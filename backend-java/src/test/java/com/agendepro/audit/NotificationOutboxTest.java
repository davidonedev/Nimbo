package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.notification.EmailService;
import com.agendepro.notification.NotificationOutbox;
import com.agendepro.notification.NotificationOutbox.Channel;
import com.agendepro.notification.NotificationOutbox.Status;
import com.agendepro.notification.NotificationService;
import com.agendepro.notification.WhatsappService;
import com.agendepro.professional.ProfessionalServiceLink;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Fila de avisos (backlog #3): enfileirar dentro da operação, enviar em segundo plano com nova tentativa, nunca
 * duplicar e nunca derrubar o agendamento. Nada real é enviado (e-mail e WhatsApp são mocks).
 */
class NotificationOutboxTest extends AuditBase {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private NotificationService notificationService;

    /** O dispatcher é chamado à mão (ele é desligado no perfil de teste); linhas de outros testes não podem disputar o lote. */
    @BeforeEach
    void emptyOutboxAndStubProviders() {
        jdbc.update("DELETE FROM notification_outbox");
        Mockito.when(emailService.sendNow(any(), any(), any())).thenReturn(EmailService.SendResult.SENT);
    }

    private NotificationOutbox row(NotificationOutbox n) {
        return outboxRepository.findById(n.getId()).orElseThrow();
    }

    private ResultActions clientCancel(Ctx c, Appointment a, Client who) throws Exception {
        return mockMvc.perform(patch("/api/public/" + c.tenant.getSlug() + "/appointments/" + a.getId() + "/cancel")
                .contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + who.getId() + "\"}"));
    }

    private Appointment pendingOf(Ctx c, Client client, String time, String end) {
        return appt(c, client, date, time, end, AppointmentStatus.PENDING);
    }

    // ── cliente: aprovação, recusa e cancelamento pelo dono ────────────────────────────────────────

    @Test
    void approving_queuesWhatsappAlways_andEmailOnlyWhenTheClientHasOne() throws Exception {
        Ctx c = ctx();
        Client withEmail = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pendingOf(c, withEmail, "10:00", "10:30");
        Client phoneOnly = clientWithPhone(c.tenant, uniquePhone());
        phoneOnly.setEmail(null);
        clientRepository.save(phoneOnly);
        Appointment b = pendingOf(c, phoneOnly, "11:00", "11:30");
        String token = adminToken(c.tenant);

        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());
        patchStatus(token, b.getId(), "confirmed").andExpect(status().isOk());

        var emails = outboxOf(c.tenant, "APPROVED", Channel.EMAIL);
        assertThat(emails).hasSize(1);
        assertThat(emails.get(0).getRecipient()).isEqualTo(withEmail.getEmail());
        assertThat(emails.get(0).getSubject()).isEqualTo(c.tenant.getName() + ": horário confirmado");
        assertThat(outboxOf(c.tenant, "APPROVED", Channel.WHATSAPP)).hasSize(2);
        assertThat(outboxOf(c.tenant)).allSatisfy(n -> {
            assertThat(n.getStatus()).isEqualTo(Status.PENDING);
            assertThat(n.getAppointmentId()).isIn(a.getId(), b.getId());
        });
    }

    @Test
    void dispatcher_sendsTheQueuedMessages_andMarksThemSent() throws Exception {
        Ctx c = ctx();
        whatsappOn();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pendingOf(c, client, "10:00", "10:30");
        patchStatus(adminToken(c.tenant), a.getId(), "confirmed").andExpect(status().isOk());

        int attempted = notificationDispatcher.run(Instant.now());

        assertThat(attempted).isEqualTo(2);
        assertThat(outboxOf(c.tenant)).allSatisfy(n -> {
            assertThat(n.getStatus()).isEqualTo(Status.SENT);
            assertThat(n.getSentAt()).isNotNull();
            assertThat(n.getAttempts()).isEqualTo(1);
        });
        Mockito.verify(emailService).sendNow(eq(client.getEmail()), eq(c.tenant.getName() + ": horário confirmado"), any());
        assertThat(whatsappTextsTo(client.getPhone())).singleElement().asString().contains("está confirmado");

        assertThat(notificationDispatcher.run(Instant.now().plus(1, ChronoUnit.DAYS))).isZero(); // nada devido
    }

    @Test
    void approvingTwice_isRejected_andNeverDuplicatesTheMessage() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pendingOf(c, client, "10:00", "10:30");
        String token = adminToken(c.tenant);

        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());
        patchStatus(token, a.getId(), "confirmed").andExpect(status().isConflict());

        assertThat(outboxOf(c.tenant, "APPROVED", Channel.WHATSAPP)).hasSize(1);
        assertThat(outboxOf(c.tenant, "APPROVED", Channel.EMAIL)).hasSize(1);
    }

    @Test
    void queueingTheSameEventTwice_keepsASingleRowPerChannel() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        notificationService.clientApproved(List.of(a));
        notificationService.clientApproved(List.of(a));

        assertThat(outboxOf(c.tenant, "APPROVED", Channel.WHATSAPP)).hasSize(1);
        assertThat(outboxOf(c.tenant, "APPROVED", Channel.EMAIL)).hasSize(1);
    }

    @Test
    void refusingAPendingRequest_andCancellingAConfirmedOne_useDifferentEvents() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment pending = pendingOf(c, client, "10:00", "10:30");
        Appointment confirmed = appt(c, client, date, "11:00", "11:30", AppointmentStatus.CONFIRMED);
        String token = adminToken(c.tenant);

        patchStatus(token, pending.getId(), "cancelled").andExpect(status().isOk());
        patchStatus(token, confirmed.getId(), "cancelled").andExpect(status().isOk());

        var refused = outboxOf(c.tenant, "REFUSED", Channel.WHATSAPP);
        assertThat(refused).hasSize(1);
        assertThat(refused.get(0).getBody()).contains("Não conseguimos atender").contains("Escolha outro horário: ")
                .contains("/" + c.tenant.getSlug());
        var cancelled = outboxOf(c.tenant, "CANCELLED_BY_OWNER", Channel.WHATSAPP);
        assertThat(cancelled).hasSize(1);
        assertThat(cancelled.get(0).getBody()).contains("foi cancelado").contains("Para reagendar: ");
        assertThat(outboxOf(c.tenant, "REFUSED", Channel.EMAIL).get(0).getSubject()).isEqualTo(c.tenant.getName() + ": horário não confirmado");
        assertThat(outboxOf(c.tenant, "CANCELLED_BY_OWNER", Channel.EMAIL).get(0).getSubject()).isEqualTo(c.tenant.getName() + ": horário cancelado");
    }

    @Test
    void completingOrMarkingNoShow_notifiesNobody() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);
        Appointment b = appt(c, client, date, "11:00", "11:30", AppointmentStatus.CONFIRMED);
        String token = adminToken(c.tenant);

        patchStatus(token, a.getId(), "completed").andExpect(status().isOk());
        patchStatus(token, b.getId(), "no_show").andExpect(status().isOk());

        assertThat(outboxOf(c.tenant)).isEmpty();
    }

    @Test
    void bulkConfirm_groupsTheSameClientAndDay_intoOneMessage() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment first = pendingOf(c, client, "10:00", "10:30");
        Appointment second = pendingOf(c, client, "10:30", "11:00"); // encadeado
        Client other = clientWithPhone(c.tenant, uniquePhone());
        Appointment third = pendingOf(c, other, "14:00", "14:30");

        mockMvc.perform(post("/api/admin/appointments/bulk-confirm").header("Authorization", bearer(adminToken(c.tenant)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + first.getId() + "\",\"" + second.getId() + "\",\"" + third.getId() + "\"]}"))
                .andExpect(status().isOk());

        assertThat(outboxOf(c.tenant, "APPROVED", Channel.WHATSAPP)).hasSize(2); // um por cliente, não por agendamento
    }

    // ── dispatcher: canal indisponível, falhas e nova tentativa ────────────────────────────────────

    @Test
    void unavailableChannels_areSkippedWithoutRetry() throws Exception {
        Ctx c = ctx();
        Mockito.when(emailService.sendNow(any(), any(), any())).thenReturn(EmailService.SendResult.NOT_CONFIGURED); // SMTP sem usuário
        whatsappOff();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pendingOf(c, client, "10:00", "10:30");
        patchStatus(adminToken(c.tenant), a.getId(), "confirmed").andExpect(status().isOk());

        notificationDispatcher.run(Instant.now());

        assertThat(outboxOf(c.tenant)).hasSize(2).allSatisfy(n -> {
            assertThat(n.getStatus()).isEqualTo(Status.SKIPPED);
            assertThat(n.getAttempts()).isEqualTo(1);
            assertThat(n.getLastError()).isNotBlank();
        });
        assertThat(notificationDispatcher.run(Instant.now().plus(1, ChronoUnit.DAYS))).isZero(); // não tenta de novo
        Mockito.verify(whatsappService, Mockito.never()).sendNow(any(), any(), any());
    }

    @Test
    void providerFailure_retriesWithBackoff_thenGivesUpAfterTheMaximum() throws Exception {
        Ctx c = ctx();
        whatsappOn();
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenReturn(WhatsappService.SendResult.FAILED);
        Client client = clientWithPhone(c.tenant, uniquePhone());
        client.setEmail(null);
        clientRepository.save(client);
        Appointment a = pendingOf(c, client, "10:00", "10:30");
        patchStatus(adminToken(c.tenant), a.getId(), "confirmed").andExpect(status().isOk());
        NotificationOutbox queued = outboxOf(c.tenant).get(0);

        Instant now = Instant.now();
        notificationDispatcher.run(now);

        NotificationOutbox afterFirst = row(queued);
        assertThat(afterFirst.getStatus()).isEqualTo(Status.PENDING);
        assertThat(afterFirst.getAttempts()).isEqualTo(1);
        assertThat(afterFirst.getNextAttemptAt()).isAfter(now);
        assertThat(afterFirst.getLastError()).isNotBlank();

        assertThat(notificationDispatcher.run(now.plusSeconds(30))).isZero(); // ainda dentro da espera de 1 min

        Instant t = now;
        for (int i = 2; i <= 5; i++) {
            t = t.plus(2, ChronoUnit.HOURS);
            assertThat(notificationDispatcher.run(t)).isEqualTo(1);
            assertThat(row(queued).getAttempts()).isEqualTo(i);
        }
        NotificationOutbox last = row(queued);
        assertThat(last.getStatus()).isEqualTo(Status.FAILED);
        assertThat(notificationDispatcher.run(t.plus(2, ChronoUnit.DAYS))).isZero();
    }

    @Test
    void aFailingSend_neverChangesTheAppointment() throws Exception {
        Ctx c = ctx();
        whatsappOn();
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenThrow(new IllegalStateException("provedor caiu"));
        Mockito.when(emailService.sendNow(any(), any(), any())).thenReturn(EmailService.SendResult.FAILED);
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pendingOf(c, client, "10:00", "10:30");

        patchStatus(adminToken(c.tenant), a.getId(), "confirmed").andExpect(status().isOk());
        notificationDispatcher.run(Instant.now());

        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(outboxOf(c.tenant)).allSatisfy(n -> assertThat(n.getStatus()).isEqualTo(Status.PENDING));
    }

    // ── dono: pedido novo, cancelamento e remarcação ───────────────────────────────────────────────

    @Test
    void pendingRequest_notifiesTheOwnerOnlyWhenTheClientConfirmsOnWhatsapp_andOnlyOnce() throws Exception {
        Ctx c = ctx();
        JsonNode res = book(c, "Cliente Pendente", uniquePhone(), "10:00", null, 200).get("data");
        assertThat(res.get("kind").asText()).isEqualTo("pending_confirmation");
        assertThat(outboxOf(c.tenant)).isEmpty(); // o cliente ainda pode nunca confirmar

        String ids = res.get("booking").get("items").get(0).get("id").asText();
        String body = "{\"appointmentIds\":[\"" + ids + "\"]}";
        for (int tap = 0; tap < 2; tap++) { // repetir o toque é inofensivo
            mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book/client-confirmed")
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        }

        assertThat(outboxOf(c.tenant, "NEW_REQUEST", Channel.EMAIL)).hasSize(1);
        assertThat(outboxOf(c.tenant, "NEW_REQUEST", Channel.WHATSAPP)).hasSize(1);
    }

    @Test
    void pendingRequestOfATenantWithoutPhone_notifiesTheOwnerRightAway_byEmailOnly() throws Exception {
        Ctx c = ctx(false, 30); // sem telefone: o cliente não tem para onde confirmar, o dono confirma
        book(c, "Cliente Sem Prazo", uniquePhone(), "10:00", null, 200);

        assertThat(outboxOf(c.tenant, "NEW_REQUEST", Channel.EMAIL)).hasSize(1);
        assertThat(outboxOf(c.tenant, "NEW_REQUEST", Channel.WHATSAPP)).isEmpty(); // sem telefone do dono
    }

    @Test
    void recognizedDevice_bookingNotifiesTheOwnerToo() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();
        JsonNode first = bookWithCode(c, "Cliente Recorrente", phone, "10:00");
        String device = first.get("data").get("deviceToken").asText();
        jdbc.update("DELETE FROM notification_outbox");

        book(c, "Cliente Recorrente", phone, "11:00", device, 200);

        assertThat(outboxOf(c.tenant, "NEW_REQUEST", Channel.EMAIL)).hasSize(1);
    }

    @Test
    void multiServiceRequest_isASingleMessageListingEveryService() throws Exception {
        Ctx c = ctx(false, 30);
        ServiceOffering second = fixtures.service(c.tenant, 60.0, 30);
        linkRepository.save(ProfessionalServiceLink.of(c.professional.getId(), second.getId()));
        String body = """
                {"name":"Cliente Combo","phone":"%s","serviceIds":["%s","%s"],"date":"%s","startTime":"10:00"}
                """.formatted(uniquePhone(), c.service.getId(), second.getId(), date);
        mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        assertThat(appointmentsOf(c.tenant)).hasSize(2);
        var emails = outboxOf(c.tenant, "NEW_REQUEST", Channel.EMAIL);
        assertThat(emails).hasSize(1);
        assertThat(emails.get(0).getBody()).contains(c.service.getName()).contains(second.getName()).contains(" + ");
    }

    @Test
    void clientCancelOfAConfirmedAppointment_notifiesTheOwner_butCancellingADraftDoesNot() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment confirmed = appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);
        clientCancel(c, confirmed, client).andExpect(status().isOk());
        assertThat(outboxOf(c.tenant, "CLIENT_CANCELLED", Channel.EMAIL)).hasSize(1);

        // pedido pendente que o cliente nunca confirmou: o dono nem soube dele
        book(c, "Cliente Rascunho", uniquePhone(), "15:00", null, 200);
        Appointment draft = appointmentsOf(c.tenant).stream().filter(x -> x.getStartTime().equals("15:00")).findFirst().orElseThrow();
        Client drafter = clientRepository.findById(draft.getClientId()).orElseThrow();
        clientCancel(c, draft, drafter).andExpect(status().isOk());

        assertThat(outboxOf(c.tenant, "CLIENT_CANCELLED", Channel.EMAIL)).hasSize(1); // continua 1
    }

    @Test
    void ownerWhatsappNeedsAUsablePhone() {
        Ctx c = ctx();
        c.tenant.setPhone("123");
        fixtures.saveTenant(c.tenant);
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        notificationService.ownerClientCancelled(a);

        assertThat(outboxOf(c.tenant, "CLIENT_CANCELLED", Channel.EMAIL)).hasSize(1);
        assertThat(outboxOf(c.tenant, "CLIENT_CANCELLED", Channel.WHATSAPP)).isEmpty();
    }

    @Test
    void theQueueIsReadInOrder_andNeverReturnsRowsOfOtherTenants() throws Exception {
        Ctx a = ctx();
        Ctx b = ctx();
        Client ca = clientWithPhone(a.tenant, uniquePhone());
        Client cb = clientWithPhone(b.tenant, uniquePhone());
        patchStatus(adminToken(a.tenant), pendingOf(a, ca, "10:00", "10:30").getId(), "confirmed").andExpect(status().isOk());
        patchStatus(adminToken(b.tenant), pendingOf(b, cb, "10:00", "10:30").getId(), "confirmed").andExpect(status().isOk());

        List<NotificationOutbox> mine = new ArrayList<>(outboxOf(a.tenant));
        assertThat(mine).isNotEmpty().allSatisfy(n -> assertThat(n.getTenantId()).isEqualTo(a.tenant.getId()));
        assertThat(outboxOf(b.tenant)).isNotEmpty().allSatisfy(n -> assertThat(n.getTenantId()).isEqualTo(b.tenant.getId()));
    }
}

package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.appointment.OwnerPendingReminderService;
import com.agendepro.appointment.PendingExpiryService;
import com.agendepro.client.Client;
import com.agendepro.notification.NotificationOutbox;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** AUDITORIA — B. Alternativos: recusa, cancelamento e reagendamento, falta, pendente sem resposta, cliente recorrente. */
class AlternativosAuditTest extends AuditBase {

    @Autowired private PendingExpiryService pendingExpiryService;
    @Autowired private OwnerPendingReminderService ownerReminderService;

    private Appointment confirmedIn(Ctx c, Client client, int days, String start, String end) {
        return appt(c, client, LocalDate.now(SP).plusDays(days).toString(), start, end, AppointmentStatus.CONFIRMED);
    }

    private org.springframework.test.web.servlet.ResultActions clientCancel(Ctx c, Appointment a, Client who) throws Exception {
        return mockMvc.perform(patch("/api/public/" + c.tenant.getSlug() + "/appointments/" + a.getId() + "/cancel")
                .header("X-Device-Token", fixtures.deviceToken(c.tenant, who))
                .contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + who.getId() + "\"}"));
    }

    private org.springframework.test.web.servlet.ResultActions clientReschedule(Ctx c, Appointment a, Client who, String day, String time) throws Exception {
        return mockMvc.perform(patch("/api/public/" + c.tenant.getSlug() + "/appointments/" + a.getId() + "/reschedule")
                .header("X-Device-Token", fixtures.deviceToken(c.tenant, who))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + who.getId() + "\",\"date\":\"" + day + "\",\"startTime\":\"" + time + "\"}"));
    }

    // ── B1. Admin recusa ───────────────────────────────────────────────────────────────────────────

    @Test
    void b1_refusing_cancelsTheAppointment_andFreesTheSlot() throws Exception {
        Ctx c = ctx();
        book(c, "Cliente Recusado", uniquePhone(), "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);
        assertThat(slots(c, date)).doesNotContain("10:00");

        patchStatus(adminToken(c.tenant), a.getId(), "cancelled").andExpect(status().isOk());

        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(slots(c, date)).contains("10:00");
        book(c, "Novo Cliente", uniquePhone(), "10:00", null, 200); // o horário voltou a ser reservável
    }

    @Test
    void gap_b1_refusalHasNoReason_butTheClientIsNowNotified() throws Exception {
        // documenta lacuna: não existe status "recusado" nem motivo (o aviso ao cliente já existe)
        Ctx c = ctx();
        String phone = uniquePhone();
        book(c, "Cliente Recusado", phone, "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);

        mockMvc.perform(patch("/api/admin/appointments/" + a.getId() + "/status").header("Authorization", bearer(adminToken(c.tenant)))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"cancelled\",\"reason\":\"Fechado nesse dia\"}"))
                .andExpect(status().isOk());

        assertThat(reload(a).getNotes()).isNull();          // o motivo enviado foi descartado
        var refused = outboxOf(c.tenant, "REFUSED", NotificationOutbox.Channel.WHATSAPP);
        assertThat(refused).hasSize(1);
        assertThat(refused.get(0).getRecipient()).isEqualTo(e164(phone));
        assertThat(refused.get(0).getBody()).doesNotContain("Fechado nesse dia"); // motivo ainda não existe
    }

    @Test
    void gap_b2_adminHasNoRescheduleOrSuggestAnotherTimeEndpoint() throws Exception {
        // documenta lacuna: só o cliente reagenda (rota pública); o admin não remarca nem sugere outro horário
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = confirmedIn(c, client, 2, "10:00", "10:30");
        String token = adminToken(c.tenant);

        mockMvc.perform(patch("/api/admin/appointments/" + a.getId()).header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"" + date + "\",\"startTime\":\"15:00\"}"))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(patch("/api/admin/appointments/" + a.getId() + "/reschedule").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"" + date + "\",\"startTime\":\"15:00\"}"))
                .andExpect(status().is4xxClientError());
        assertThat(reload(a).getStartTime()).isEqualTo("10:00");
    }

    // ── B3. Cliente cancela ────────────────────────────────────────────────────────────────────────

    @Test
    void b3_clientCancelsWithEnoughNotice_slotIsFreed() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = confirmedIn(c, client, 2, "10:00", "10:30");

        clientCancel(c, a, client).andExpect(status().isOk());

        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(slots(c, date)).contains("10:00");
    }

    @Test
    void b3_clientCannotCancelOrRescheduleWithLessThanOneHourNotice() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, LocalDateTime.now(SP).plusMinutes(20), AppointmentStatus.CONFIRMED);

        assertThat(body(clientCancel(c, a, client).andExpect(status().isBadRequest())).get("code").asText()).isEqualTo("CANCELLATION_WINDOW_EXPIRED");
        assertThat(body(clientReschedule(c, a, client, date, "15:00").andExpect(status().isBadRequest())).get("code").asText()).isEqualTo("RESCHEDULE_WINDOW_EXPIRED");
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
    }

    @Test
    void b3_clientCancellationQueuesTheOwnerNotification() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = confirmedIn(c, client, 2, "10:00", "10:30");

        clientCancel(c, a, client).andExpect(status().isOk());

        var email = outboxOf(c.tenant, "CLIENT_CANCELLED", NotificationOutbox.Channel.EMAIL);
        assertThat(email).hasSize(1);
        assertThat(email.get(0).getRecipient()).isEqualTo(c.tenant.getEmail());
        assertThat(email.get(0).getSubject()).isEqualTo("Cliente cancelou: " + client.getName());
        assertThat(outboxOf(c.tenant, "CLIENT_CANCELLED", NotificationOutbox.Channel.WHATSAPP)).hasSize(1);
    }

    // ── B4. Cliente reagenda ───────────────────────────────────────────────────────────────────────

    @Test
    void b4_clientReschedules_slotMoves_andRemindersAreReset() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = confirmedIn(c, client, 2, "10:00", "10:30");
        a.setReminder24hSentAt(Instant.now());
        a.setReminder2hSentAt(Instant.now());
        appointmentRepository.save(a);

        clientReschedule(c, a, client, date, "15:00").andExpect(status().isOk());

        Appointment moved = reload(a);
        assertThat(moved.getStartTime()).isEqualTo("15:00");
        assertThat(moved.getEndTime()).isEqualTo("15:30");
        assertThat(moved.getReminder24hSentAt()).isNull();
        assertThat(moved.getReminder2hSentAt()).isNull();
        assertThat(slots(c, date)).contains("10:00").doesNotContain("15:00");
    }

    @Test
    void b4_rescheduleIntoABlockedSlotIsRejected() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = confirmedIn(c, client, 2, "10:00", "10:30");
        fixtures.blockedSlot(c.tenant, c.professional, date, "15:00", "16:00");

        assertThat(body(clientReschedule(c, a, client, date, "15:00").andExpect(status().isConflict())).get("code").asText()).isEqualTo("SCHEDULE_CONFLICT");
    }

    @Test
    void b4_rescheduleOfAConfirmedAppointmentGoesBackToPending_andTheOwnerIsNotified() throws Exception {
        // remarcar um CONFIRMED volta para PENDENTE (o dono aprova o novo horário) e o dono é avisado
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = confirmedIn(c, client, 2, "10:00", "10:30");

        clientReschedule(c, a, client, date, "15:00").andExpect(status().isOk());

        Appointment moved = reload(a);
        assertThat(moved.getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(moved.getConfirmBy()).isNull();
        assertThat(moved.getClientConfirmedAt()).isNotNull();
        var email = outboxOf(c.tenant, "CLIENT_RESCHEDULED", NotificationOutbox.Channel.EMAIL);
        assertThat(email).hasSize(1);
        assertThat(email.get(0).getBody()).contains("às 15:00").contains("Horário anterior:").contains("às 10:00");
    }

    @Test
    void b4_rescheduleRunsTheWholeBookingValidation_hoursPastClosedAndSameSlot() throws Exception {
        // remarcar é pedir um horário novo: expediente, data passada, horário igual e estabelecimento fechado são conferidos de novo
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = confirmedIn(c, client, 2, "10:00", "10:30");

        // fora do expediente (08:00–18:00): recusado, e o agendamento fica onde estava
        assertThat(body(clientReschedule(c, a, client, date, "03:00").andExpect(status().isConflict())).get("code").asText()).isEqualTo("SCHEDULE_CONFLICT");
        assertThat(body(clientReschedule(c, a, client, date, "17:45").andExpect(status().isConflict())).get("code").asText()).isEqualTo("SCHEDULE_CONFLICT"); // 17:45 + 30 min passa das 18:00
        assertThat(reload(a).getStartTime()).isEqualTo("10:00");
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);

        // dia em que o profissional não atende
        int blockedWeekday = LocalDate.parse(date).plusDays(1).getDayOfWeek().getValue() % 7;
        Ctx weekdays = ctx();
        weekdays.professional.setWorkingDays(java.util.stream.IntStream.range(0, 7).filter(d -> d != blockedWeekday).boxed().toArray(Integer[]::new));
        professionalRepository.save(weekdays.professional);
        Client other = clientWithPhone(weekdays.tenant, uniquePhone());
        Appointment b = confirmedIn(weekdays, other, 2, "10:00", "10:30");
        String dayOff = LocalDate.parse(date).plusDays(1).toString();
        assertThat(body(clientReschedule(weekdays, b, other, dayOff, "10:00").andExpect(status().isConflict())).get("code").asText()).isEqualTo("SCHEDULE_CONFLICT");

        // horário igual ao atual
        assertThat(body(clientReschedule(c, a, client, date, "10:00").andExpect(status().isBadRequest())).get("code").asText()).isEqualTo("SAME_SLOT");

        // data passada
        Appointment toPast = confirmedIn(c, client, 3, "10:00", "10:30");
        String yesterday = LocalDate.now(SP).minusDays(1).toString();
        assertThat(body(clientReschedule(c, toPast, client, yesterday, "10:00").andExpect(status().isBadRequest())).get("code").asText()).isEqualTo("INVALID_DATE");
        assertThat(reload(toPast).getDate()).isNotEqualTo(yesterday);

        // estabelecimento fechado para novos agendamentos
        c.tenant.setIsOpen(false);
        fixtures.saveTenant(c.tenant);
        assertThat(body(clientReschedule(c, a, client, date, "15:00").andExpect(status().isForbidden())).get("code").asText()).isEqualTo("CLOSED");
        assertThat(reload(a).getStartTime()).isEqualTo("10:00");
    }

    @Test
    void b4_rescheduleCanUseTheTimeTheAppointmentItselfOccupies() throws Exception {
        // o próprio horário não conta como ocupado: dá para andar 15 min e sobrepor o horário atual
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = confirmedIn(c, client, 2, "10:00", "10:30");

        clientReschedule(c, a, client, date, "10:15").andExpect(status().isOk());

        assertThat(reload(a).getStartTime()).isEqualTo("10:15");
        assertThat(reload(a).getEndTime()).isEqualTo("10:45");
    }

    // ── B5. Falta (no-show) e Painel ───────────────────────────────────────────────────────────────

    @Test
    void b5_noShow_isRecordedAndCountedInTheDashboard() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment missed = confirmedIn(c, client, 0, "09:00", "09:30");
        Appointment cancelled = confirmedIn(c, client, 0, "10:00", "10:30");
        String token = adminToken(c.tenant);

        patchStatus(token, missed.getId(), "no_show").andExpect(status().isOk());
        patchStatus(token, cancelled.getId(), "cancelled").andExpect(status().isOk());

        JsonNode summary = json.readTree(mockMvc.perform(get("/api/admin/dashboard/summary").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        assertThat(summary.get("cancellations").get("noShow").asInt()).isEqualTo(1);
        assertThat(summary.get("cancellations").get("cancelled").asInt()).isEqualTo(1);
        assertThat(summary.get("cancellations").get("total").asInt()).isEqualTo(2);

        JsonNode detail = json.readTree(mockMvc.perform(get("/api/admin/clients/" + client.getId()).header("Authorization", bearer(token)))
                .andReturn().getResponse().getContentAsString()).get("data");
        assertThat(detail.get("appointments")).extracting(n -> n.get("status").asText()).contains("no_show", "cancelled");
    }

    // ── B6. Pendente que ninguém responde ──────────────────────────────────────────────────────────

    @Test
    void b6_clientNeverTaps_slotIsReleasedAfterTheDeadline() throws Exception {
        Ctx c = ctx();
        book(c, "Cliente Sumido", uniquePhone(), "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);
        assertThat(a.getConfirmBy()).isNotNull();

        pendingExpiryService.expire(Instant.now().plus(4, ChronoUnit.HOURS)); // prazo do cliente é 3 h

        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(slots(c, date)).contains("10:00");
    }

    @Test
    void gap_b6_ownerSilentAfterClientConfirmed_neverExpires_andOwnerIsRemindedOnlyByEmail() throws Exception {
        // documenta lacuna: o aviso ao dono é só e-mail (nada por WhatsApp); sem resposta o horário fica preso para sempre
        Ctx c = ctx();
        book(c, "Cliente Confirmou", uniquePhone(), "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);
        mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book/client-confirmed").contentType(MediaType.APPLICATION_JSON)
                .content("{\"appointmentIds\":[\"" + a.getId() + "\"]}")).andExpect(status().isOk());

        pendingExpiryService.expire(Instant.now().plus(365, ChronoUnit.DAYS));
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.PENDING); // nunca expira

        // faltam ~100 min: o único aviso é o e-mail ao dono (2 h antes)
        LocalDateTime start = LocalDateTime.now(SP).plusMinutes(100);
        Appointment moved = reload(a);
        moved.setDate(start.toLocalDate().toString());
        moved.setStartTime(start.format(HHMM));
        appointmentRepository.save(moved);
        Mockito.clearInvocations(whatsappService, emailService);

        ownerReminderService.run(Instant.now());

        Mockito.verify(emailService).sendOwnerPendingReminder(eq(c.tenant.getEmail()), eq(c.tenant.getName()), eq("2 horas"), any(), any());
        assertThat(whatsappSentTo(c.tenant.getPhone())).isFalse();
    }

    @Test
    void gap_b6_tenantWithoutPhone_pendingBookingsHaveNoDeadlineAndNeverExpire() throws Exception {
        // documenta lacuna: sem telefone do estabelecimento o cliente não tem como confirmar e o pedido nunca expira
        Ctx c = ctx(false, 30);
        JsonNode data = book(c, "Cliente Sem Destino", uniquePhone(), "10:00", null, 200).get("data");
        assertThat(data.get("kind").asText()).isEqualTo("pending_confirmation");
        assertThat(data.get("confirmBy").isNull()).isTrue();

        pendingExpiryService.expire(Instant.now().plus(365, ChronoUnit.DAYS));
        assertThat(appointmentsOf(c.tenant).get(0).getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(slots(c, date)).doesNotContain("10:00"); // horário segue preso
    }

    // ── B7. Cliente recorrente ─────────────────────────────────────────────────────────────────────

    @Test
    void b7_returningClientOnTheSameDevice_bookingIsDirect_noNewCode_noDuplicateClient() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();
        String deviceToken = bookWithCode(c, "Cliente Fiel", phone, "10:00").get("data").get("deviceToken").asText();
        Mockito.clearInvocations(whatsappService);

        JsonNode second = book(c, "Cliente Fiel", phone, "11:00", deviceToken, 200).get("data");

        assertThat(second.get("kind").asText()).isEqualTo("booked");
        Mockito.verify(whatsappService, Mockito.never()).sendNow(any(), any(), any());
        long clientsWithPhone = clientRepository.findAll().stream()
                .filter(cl -> cl.getTenantId().equals(c.tenant.getId()) && e164(phone).equals(cl.getPhoneE164())).count();
        assertThat(clientsWithPhone).isEqualTo(1);

        String clientId = appointmentsOf(c.tenant).get(0).getClientId().toString();
        JsonNode detail = json.readTree(mockMvc.perform(get("/api/admin/clients/" + clientId).header("Authorization", bearer(adminToken(c.tenant))))
                .andReturn().getResponse().getContentAsString()).get("data");
        assertThat(detail.get("appointments")).hasSize(2);
    }

    @Test
    void b7_sameClientFromAnotherDevice_isAskedForANewCode() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();
        bookWithCode(c, "Cliente Fiel", phone, "10:00");

        JsonNode second = book(c, "Cliente Fiel", phone, "11:00", null, 200).get("data"); // sem o token do aparelho
        assertThat(second.get("kind").asText()).isEqualTo("challenge_required");
    }

}

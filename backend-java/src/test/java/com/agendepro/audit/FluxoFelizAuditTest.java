package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.client.Client;
import com.agendepro.notification.NotificationOutbox;
import com.agendepro.reminder.ReminderService;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AUDITORIA — A. Caminho feliz: cliente agenda pelo link público → admin aprova → lembretes → atendimento concluído.
 * Nada real é enviado (WhatsApp e e-mail são mocks).
 */
class FluxoFelizAuditTest extends AuditBase {

    @Autowired private ReminderService reminderService;

    // ── A1. Cliente novo agenda pelo link público ──────────────────────────────────────────────────

    @Test
    void a1_newClientBooks_startsPending_blocksTheSlot_andIsLinkedToTheRightTenant() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();

        JsonNode data = book(c, "Cliente Novo", phone, "10:00", null, 200).get("data");
        assertThat(data.get("kind").asText()).isEqualTo("pending_confirmation");

        List<Appointment> mine = appointmentsOf(c.tenant);
        assertThat(mine).hasSize(1);
        Appointment a = mine.get(0);
        assertThat(a.getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(a.getProfessionalId()).isEqualTo(c.professional.getId());
        assertThat(a.getPrice()).isEqualTo(40.0);

        Client client = clientRepository.findById(a.getClientId()).orElseThrow();
        assertThat(client.getTenantId()).isEqualTo(c.tenant.getId());
        assertThat(client.getPhoneE164()).isEqualTo(e164(phone));
        assertThat(client.getEmail()).isNull(); // agendamento só com nome + celular, sem login

        // o horário ficou bloqueado: some da lista e um segundo pedido falha
        assertThat(slots(c, date)).doesNotContain("10:00");
        assertThat(book(c, "Outra Pessoa", uniquePhone(), "10:00", null, 409).get("code").asText()).isEqualTo("SCHEDULE_CONFLICT");
    }

    @Test
    void a1b_withWhatsappTheFirstBookingNeedsACode_andEvenAfterTheCodeItStaysPendingForTheAdmin() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();

        JsonNode booked = bookWithCode(c, "Cliente Com Codigo", phone, "11:00").get("data");
        assertThat(booked.get("kind").asText()).isEqualTo("booked"); // "booked" = reservado, NÃO aprovado
        assertThat(booked.get("deviceToken").asText()).isNotBlank();

        Appointment a = appointmentsOf(c.tenant).get(0);
        assertThat(a.getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(a.getConfirmBy()).isNull(); // sem prazo: fica aguardando o admin
    }

    // ── A2. Admin é notificado? ────────────────────────────────────────────────────────────────────

    @Test
    void a2_adminSeesTheNewRequestInThePanelList() throws Exception {
        Ctx c = ctx();
        book(c, "Cliente Painel", uniquePhone(), "10:00", null, 200);
        String token = adminToken(c.tenant);

        String body = mockMvc.perform(get("/api/admin/appointments").param("status", "PENDING").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode list = json.readTree(body).get("data");
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("client").get("name").asText()).isEqualTo("Cliente Painel");
        assertThat(list.get(0).get("startTime").asText()).isEqualTo("10:00");
    }

    @Test
    void gap_a2_statusFilterOfTheListEndpointIsCaseSensitiveUnlikeTheBody() throws Exception {
        // documenta inconsistência: o corpo usa "pending" (minúsculo) mas ?status= só aceita "PENDING"
        Ctx c = ctx();
        String token = adminToken(c.tenant);
        mockMvc.perform(get("/api/admin/appointments").param("status", "pending").header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/admin/appointments").param("status", "PENDING").header("Authorization", bearer(token)))
                .andExpect(status().isOk());
    }

    @Test
    void a2_newBookingQueuesTheOwnerNotification_onlyOnceTheRequestIsReal() throws Exception {
        Ctx c = ctx();
        book(c, "Cliente Sem Confirmar", uniquePhone(), "10:00", null, 200); // pendente com prazo: o cliente pode nunca confirmar
        assertThat(outboxOf(c.tenant)).isEmpty();

        bookWithCode(c, "Cliente Com Codigo", uniquePhone(), "11:00");       // fluxo com código: pedido real

        var email = outboxOf(c.tenant, "NEW_REQUEST", NotificationOutbox.Channel.EMAIL);
        var wpp = outboxOf(c.tenant, "NEW_REQUEST", NotificationOutbox.Channel.WHATSAPP);
        assertThat(email).hasSize(1);
        assertThat(email.get(0).getRecipient()).isEqualTo(c.tenant.getEmail());
        assertThat(email.get(0).getSubject()).isEqualTo("Novo pedido de agendamento: Cliente Com Codigo");
        assertThat(wpp).hasSize(1);
        assertThat(wpp.get(0).getRecipient()).isEqualTo(e164(c.tenant.getPhone()));
        assertThat(wpp.get(0).getBody()).contains("Cliente Com Codigo", "Aprovar ou recusar:", "/admin/appointments");
        // a fila só grava: nada saiu enquanto o dispatcher não rodou
        Mockito.verify(emailService, Mockito.never()).sendNow(any(), any(), any());
    }

    // ── A3. Admin aprova ───────────────────────────────────────────────────────────────────────────

    @Test
    void a3_adminApproves_statusBecomesConfirmed_andEveryScreenSeesIt() throws Exception {
        Ctx c = ctx();
        book(c, "Cliente Aprovado", uniquePhone(), "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);
        String token = adminToken(c.tenant);

        JsonNode res = body(patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk()));
        assertThat(res.get("data").get("status").asText()).isEqualTo("confirmed");
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(reload(a).getConfirmBy()).isNull();

        // Painel (próximos), Agenda/Agendamentos (lista do dia) e Profissional refletem a mudança
        JsonNode summary = json.readTree(mockMvc.perform(get("/api/admin/dashboard/summary").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        assertThat(summary.get("upcoming").get(0).get("status").asText()).isEqualTo("confirmed");

        JsonNode day = json.readTree(mockMvc.perform(get("/api/admin/appointments").param("date", date).header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        assertThat(day.get(0).get("status").asText()).isEqualTo("confirmed");

        String profToken = professionalToken(c.tenant, c.professional);
        JsonNode prof = json.readTree(mockMvc.perform(get("/api/professional/appointments").param("date", date).header("Authorization", bearer(profToken)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        assertThat(prof.get(0).get("status").asText()).isEqualTo("confirmed");
    }

    @Test
    void a3_approvalQueuesTheClientNotification() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();
        book(c, "Cliente Aprovado", phone, "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);

        patchStatus(adminToken(c.tenant), a.getId(), "confirmed").andExpect(status().isOk());

        var wpp = outboxOf(c.tenant, "APPROVED", NotificationOutbox.Channel.WHATSAPP);
        assertThat(wpp).hasSize(1);
        assertThat(wpp.get(0).getRecipient()).isEqualTo(e164(phone));
        assertThat(wpp.get(0).getBody()).startsWith("Olá, Cliente! Seu horário em " + c.tenant.getName() + " está confirmado:");
        // cliente do /book não tem e-mail: só WhatsApp
        assertThat(outboxOf(c.tenant, "APPROVED", NotificationOutbox.Channel.EMAIL)).isEmpty();
    }

    // ── A4. Lembretes ──────────────────────────────────────────────────────────────────────────────

    @Test
    void a4_reminder24hIsQueuedOnceInsideTheWindow_andNeverDuplicated() {
        Ctx c = ctx();
        String phone = uniquePhone();
        Client client = clientWithPhone(c.tenant, phone);
        Appointment a = appt(c, client, LocalDateTime.now(SP).plusHours(24), AppointmentStatus.CONFIRMED);

        reminderService.send24hReminders();
        reminderService.send24hReminders(); // 2ª rodada (próximo ciclo do agendador)

        var queued = outboxOf(c.tenant, "REMINDER_24H", NotificationOutbox.Channel.WHATSAPP);
        assertThat(queued).hasSize(1);
        assertThat(queued.get(0).getRecipient()).isEqualTo(e164(phone));
        assertThat(queued.get(0).getBody()).contains(a.getStartTime()).contains(c.tenant.getName()).contains("/my-appointments");
        assertThat(reload(a).getReminder24hSentAt()).isNotNull();
    }

    @Test
    void a4_reminder2hIsQueuedOnceInsideTheWindow_andNeverDuplicated() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, LocalDateTime.now(SP).plusMinutes(100), AppointmentStatus.CONFIRMED);

        reminderService.send2hReminders();
        reminderService.send2hReminders();

        assertThat(outboxOf(c.tenant, "REMINDER_2H", NotificationOutbox.Channel.WHATSAPP)).hasSize(1);
        assertThat(reload(a).getReminder2hSentAt()).isNotNull();
        assertThat(reload(a).getReminder24hSentAt()).isNull(); // lembretes são independentes
    }

    @Test
    void a4_reminderWindowUsesSaoPauloTimeNotUtc() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        // mesmo "relógio de parede" em UTC (3 h à frente de SP): fica fora da janela de 20–25 h
        Appointment utcWallClock = appt(c, client, LocalDateTime.now(ZoneOffset.UTC).plusHours(24), AppointmentStatus.CONFIRMED);

        reminderService.send24hReminders();

        assertThat(reload(utcWallClock).getReminder24hSentAt()).isNull();
        assertThat(outboxOf(c.tenant, "REMINDER_24H", NotificationOutbox.Channel.WHATSAPP)).isEmpty();
    }

    @Test
    void a4_aReminderMissedWhileTheServiceSlept_isCaughtUpOnTheNextRun() {
        // Render free dormindo: a janela original passou, mas o lembrete ainda sai enquanto ele ainda ajuda
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment late24 = appt(c, client, LocalDateTime.now(SP).plusHours(21), AppointmentStatus.CONFIRMED);
        Appointment late2 = appt(c, client, LocalDateTime.now(SP).plusMinutes(45), AppointmentStatus.CONFIRMED);

        reminderService.send24hReminders();
        reminderService.send2hReminders();

        assertThat(reload(late24).getReminder24hSentAt()).isNotNull();
        assertThat(reload(late2).getReminder2hSentAt()).isNotNull();
        assertThat(outboxOf(c.tenant, "REMINDER_24H", NotificationOutbox.Channel.WHATSAPP)).hasSize(1);
        assertThat(outboxOf(c.tenant, "REMINDER_2H", NotificationOutbox.Channel.WHATSAPP)).hasSize(1);
    }

    @Test
    void a4_tooLateRemindersAreNotSent_theyWouldOnlyAddNoise() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment soon = appt(c, client, LocalDateTime.now(SP).plusMinutes(10), AppointmentStatus.CONFIRMED); // < 30 min
        Appointment today = appt(c, client, LocalDateTime.now(SP).plusHours(10), AppointmentStatus.CONFIRMED);   // < 20 h para o de 24 h

        reminderService.send24hReminders();
        reminderService.send2hReminders();

        assertThat(reload(soon).getReminder2hSentAt()).isNull();
        assertThat(reload(today).getReminder24hSentAt()).isNull();
        assertThat(outboxOf(c.tenant)).noneMatch(n -> n.getEvent().startsWith("REMINDER"));
    }

    @Test
    void a4_onlyConfirmedAppointmentsGetReminders_pendingAndNoShowDoNot() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        appt(c, client, LocalDateTime.now(SP).plusHours(24), AppointmentStatus.PENDING);
        appt(c, client, LocalDateTime.now(SP).plusMinutes(100), AppointmentStatus.PENDING);
        appt(c, client, LocalDateTime.now(SP).plusHours(24).plusMinutes(30), AppointmentStatus.NO_SHOW);

        reminderService.send24hReminders();
        reminderService.send2hReminders();

        assertThat(outboxOf(c.tenant)).noneMatch(n -> n.getEvent().startsWith("REMINDER"));
    }

    @Test
    void a4_the24hReminderSaysTodayWhenTheCatchUpMakesItSameDay() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        LocalDateTime start = LocalDateTime.now(SP).plusHours(21);
        appt(c, client, start, AppointmentStatus.CONFIRMED);

        reminderService.send24hReminders();

        String body = outboxOf(c.tenant, "REMINDER_24H", NotificationOutbox.Channel.WHATSAPP).get(0).getBody();
        String expected = start.toLocalDate().equals(LocalDateTime.now(SP).toLocalDate()) ? "*hoje*" : "*amanhã*";
        assertThat(body).contains(expected);
    }

    @Test
    void gap_a4_remindersNeverAskForPresenceConfirmation() {
        // documenta lacuna: pedir "responda 1 para confirmar" exige receber a resposta (webhook de entrada) — não existe ainda
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        appt(c, client, LocalDateTime.now(SP).plusHours(24), AppointmentStatus.CONFIRMED);
        appt(c, client, LocalDateTime.now(SP).plusMinutes(100), AppointmentStatus.CONFIRMED);

        reminderService.send24hReminders();
        reminderService.send2hReminders();

        assertThat(outboxOf(c.tenant)).filteredOn(n -> n.getEvent().startsWith("REMINDER") && n.getChannel() == NotificationOutbox.Channel.WHATSAPP).hasSize(2)
                .allSatisfy(n -> assertThat(n.getBody().toLowerCase()).doesNotContain("responda").doesNotContain("confirme"));
    }

    @Test
    void a4_clientWithoutPhoneOrEmail_queuesNothing_butIsNotRetriedForever() {
        Ctx c = ctx();
        Client client = fixtures.client(c.tenant);
        client.setEmail(null);
        clientRepository.save(client); // sem celular e sem e-mail
        Appointment a = appt(c, client, LocalDateTime.now(SP).plusHours(24), AppointmentStatus.CONFIRMED);

        reminderService.send24hReminders();

        assertThat(reload(a).getReminder24hSentAt()).isNotNull(); // tratado: não volta a cada ciclo
        assertThat(outboxOf(c.tenant)).noneMatch(n -> n.getEvent().startsWith("REMINDER"));
    }

    @Test
    void a4_aClientWithEmailAlsoGetsTheReminderByEmail() {
        Ctx c = ctx();
        Client client = fixtures.client(c.tenant); // o fixture traz e-mail
        Appointment a = appt(c, client, LocalDateTime.now(SP).plusHours(24), AppointmentStatus.CONFIRMED);

        reminderService.send24hReminders();

        assertThat(outboxOf(c.tenant, "REMINDER_24H", NotificationOutbox.Channel.EMAIL)).hasSize(1);
        assertThat(reload(a).getReminder24hSentAt()).isNotNull();
    }

    // ── A5. Atendimento: concluir, valor, pagamento, histórico ────────────────────────────────────

    @Test
    void a5_completing_keepsThePriceAndShowsUpInTheClientHistory() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();
        book(c, "Cliente Concluido", phone, "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);
        String token = adminToken(c.tenant);

        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());
        JsonNode done = body(patchStatus(token, a.getId(), "completed").andExpect(status().isOk())).get("data");
        assertThat(done.get("status").asText()).isEqualTo("completed");
        assertThat(done.get("price").asDouble()).isEqualTo(40.0);

        JsonNode detail = json.readTree(mockMvc.perform(get("/api/admin/clients/" + a.getClientId()).header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        assertThat(detail.get("appointments")).hasSize(1);
        assertThat(detail.get("appointments").get(0).get("status").asText()).isEqualTo("completed");
        assertThat(detail.get("appointments").get(0).get("price").asDouble()).isEqualTo(40.0);
    }

    @Test
    void gap_a5_completionRecordsNoPaymentCommissionOrClientTotals() throws Exception {
        // documenta lacuna: concluir não registra valor cobrado/forma de pagamento/comissão nem totais do cliente
        Ctx c = ctx();
        book(c, "Cliente Concluido", uniquePhone(), "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);
        String token = adminToken(c.tenant);

        JsonNode done = body(patchStatus(token, a.getId(), "completed").andExpect(status().isOk())).get("data");
        assertThat(done.get("paymentStatus").isNull()).isTrue();
        assertThat(done.get("paymentId").isNull()).isTrue();
        for (String field : new String[]{"commission", "amountPaid", "paidAmount", "paymentMethod", "tip", "discount"}) {
            assertThat(done.has(field)).as("campo %s", field).isFalse();
        }
        JsonNode detail = json.readTree(mockMvc.perform(get("/api/admin/clients/" + a.getClientId()).header("Authorization", bearer(token)))
                .andReturn().getResponse().getContentAsString()).get("data");
        for (String field : new String[]{"totalSpent", "visits", "noShows", "lastVisit"}) {
            assertThat(detail.has(field)).as("campo %s", field).isFalse();
        }
    }

    @Test
    void gap_a5_thereIsNoInProgressStatus_soAttendanceCannotBeStarted() throws Exception {
        // documenta lacuna: o fluxo-alvo tem "iniciar atendimento"; o enum só tem pending/confirmed/completed/cancelled/no_show
        Ctx c = ctx();
        book(c, "Cliente", uniquePhone(), "10:00", null, 200);
        Appointment a = appointmentsOf(c.tenant).get(0);

        patchStatus(adminToken(c.tenant), a.getId(), "in_progress").andExpect(status().isBadRequest());
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.PENDING);
    }
}

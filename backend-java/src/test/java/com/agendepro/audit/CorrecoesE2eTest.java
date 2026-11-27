package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.client.Client;
import com.agendepro.client.ClientEmailToken;
import com.agendepro.client.ClientEmailTokenRepository;
import com.agendepro.notification.NotificationOutbox;
import com.agendepro.publicapi.BookingChallenge;
import com.agendepro.publicapi.BookingChallengeRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Correções do teste E2E: janela de datas no agendamento, remarcação de confirmado e prova de posse (X-Device-Token). */
class CorrecoesE2eTest extends AuditBase {

    @Autowired private BookingChallengeRepository challengeRepository;
    @Autowired private ClientEmailTokenRepository emailTokenRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JdbcTemplate jdbc;

    private String base(Ctx c) {
        return "/api/public/" + c.tenant.getSlug();
    }

    private ResultActions cancel(Ctx c, Appointment a, String token, String bodyJson) throws Exception {
        var req = patch(base(c) + "/appointments/" + a.getId() + "/cancel").contentType(MediaType.APPLICATION_JSON);
        if (bodyJson != null) req.content(bodyJson);
        if (token != null) req.header("X-Device-Token", token);
        return mockMvc.perform(req);
    }

    private ResultActions reschedule(Ctx c, Appointment a, String token, String day, String time, UUID clientId) throws Exception {
        String cid = clientId == null ? "" : "\"clientId\":\"" + clientId + "\",";
        var req = patch(base(c) + "/appointments/" + a.getId() + "/reschedule").contentType(MediaType.APPLICATION_JSON)
                .content("{" + cid + "\"date\":\"" + day + "\",\"startTime\":\"" + time + "\"}");
        if (token != null) req.header("X-Device-Token", token);
        return mockMvc.perform(req);
    }

    // ── G3: janela de datas ao gravar ──────────────────────────────────────────────────────────────

    @Test
    void g3_bookRejectsPastAndBeyondSixtyDays_withInvalidDate() throws Exception {
        Ctx c = ctx();
        String yesterday = LocalDate.now(SP).minusDays(1).toString();
        String day61 = LocalDate.now(SP).plusDays(61).toString();

        assertThat(bookOn(c, "Passado", uniquePhone(), yesterday, "10:00", null, 400).get("code").asText()).isEqualTo("INVALID_DATE");
        JsonNode far = bookOn(c, "Longe", uniquePhone(), day61, "10:00", null, 400);
        assertThat(far.get("code").asText()).isEqualTo("INVALID_DATE");
        assertThat(far.get("error").asText()).contains("60 dias");
        assertThat(appointmentsOf(c.tenant)).isEmpty();
    }

    @Test
    void g3_bookAtTheSixtyDayLimitIsStillAccepted() throws Exception {
        Ctx c = ctx();
        bookOn(c, "No Limite", uniquePhone(), LocalDate.now(SP).plusDays(60).toString(), "10:00", null, 200);
        assertThat(appointmentsOf(c.tenant)).hasSize(1);
    }

    @Test
    void g3_verifyPathAlsoRejectsAnOutOfWindowDate() throws Exception {
        Ctx c = ctx();
        whatsappOn();
        String phone = uniquePhone();
        String id = book(c, "Com Codigo", phone, "10:00", null, 200).get("data").get("challengeId").asText();
        // a data do pedido guardado ficou no passado (ex.: o cliente demorou a digitar o código na virada do dia)
        BookingChallenge ch = challengeRepository.findById(UUID.fromString(id)).orElseThrow();
        ch.setDate(LocalDate.now(SP).minusDays(1).toString());
        challengeRepository.save(ch);

        JsonNode res = verify(c, id, sentCode(phone), 400);

        assertThat(res.get("code").asText()).isEqualTo("INVALID_DATE");
        assertThat(appointmentsOf(c.tenant)).isEmpty();
    }

    @Test
    void g3_rescheduleRejectsPastAndBeyondSixtyDays() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        String token = fixtures.deviceToken(c.tenant, client);
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        reschedule(c, a, token, LocalDate.now(SP).minusDays(1).toString(), "10:00", null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_DATE"));
        reschedule(c, a, token, LocalDate.now(SP).plusDays(61).toString(), "10:00", null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_DATE"));
        assertThat(reload(a).getDate()).isEqualTo(date);
    }

    // ── F5: remarcar um confirmado volta a pendente ────────────────────────────────────────────────

    @Test
    void f5_rescheduleOfConfirmedBecomesPending_clientConfirmed_noDeadline_remindersReset_ownerNotified() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);
        a.setReminder24hSentAt(Instant.now());
        a.setReminder2hSentAt(Instant.now());
        a.setConfirmBy(Instant.now().plus(1, ChronoUnit.HOURS));
        appointmentRepository.save(a);

        reschedule(c, a, fixtures.deviceToken(c.tenant, client), date, "15:00", null).andExpect(status().isOk());

        Appointment moved = reload(a);
        assertThat(moved.getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(moved.getStartTime()).isEqualTo("15:00");
        assertThat(moved.getConfirmBy()).isNull();
        assertThat(moved.getClientConfirmedAt()).isNotNull();
        assertThat(moved.getReminder24hSentAt()).isNull();
        assertThat(moved.getReminder2hSentAt()).isNull();
        assertThat(outboxOf(c.tenant, "CLIENT_RESCHEDULED", NotificationOutbox.Channel.EMAIL)).hasSize(1);
    }

    @Test
    void f5_pendingStaysPending_andADraftRescheduleDoesNotBotherTheOwner() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        String token = fixtures.deviceToken(c.tenant, client);

        // rascunho: pendente com prazo e sem confirmação do cliente (o dono nem sabe dele)
        Appointment draft = appt(c, client, date, "09:00", "09:30", AppointmentStatus.PENDING);
        draft.setConfirmBy(Instant.now().plus(2, ChronoUnit.HOURS));
        appointmentRepository.save(draft);
        reschedule(c, draft, token, date, "11:00", null).andExpect(status().isOk());
        Appointment d = reload(draft);
        assertThat(d.getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(d.getConfirmBy()).isNotNull();
        assertThat(d.getClientConfirmedAt()).isNull();
        assertThat(outboxOf(c.tenant, "CLIENT_RESCHEDULED", NotificationOutbox.Channel.EMAIL)).isEmpty();

        // o cliente já confirmou: pendente continua pendente e o dono é avisado da remarcação
        Appointment confirmedByClient = appt(c, client, date, "13:00", "13:30", AppointmentStatus.PENDING);
        confirmedByClient.setClientConfirmedAt(Instant.now().minusSeconds(60));
        appointmentRepository.save(confirmedByClient);
        reschedule(c, confirmedByClient, token, date, "14:00", null).andExpect(status().isOk());
        assertThat(reload(confirmedByClient).getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(outboxOf(c.tenant, "CLIENT_RESCHEDULED", NotificationOutbox.Channel.EMAIL)).hasSize(1);
    }

    // ── G2: prova de posse ─────────────────────────────────────────────────────────────────────────

    @Test
    void g2_cancelNeedsAValidDevice_clientIdAloneIsNotEnough() throws Exception {
        Ctx c = ctx();
        Client owner = clientWithPhone(c.tenant, uniquePhone());
        Client other = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, owner, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);
        String idBody = "{\"clientId\":\"" + owner.getId() + "\"}";

        cancel(c, a, null, idBody).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEVICE_REQUIRED"));
        cancel(c, a, "token-inventado", idBody).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEVICE_REQUIRED"));
        cancel(c, a, fixtures.deviceToken(c.tenant, other), idBody).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEVICE_REQUIRED"));
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);

        // clientId opcional: sem body e sem clientId o cliente vem do token
        cancel(c, a, fixtures.deviceToken(c.tenant, owner), null).andExpect(status().isOk());
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
    }

    @Test
    void g2_cancelWithMatchingClientIdAndToken_works_andTheOtherClientsTokenCannotTouchIt() throws Exception {
        Ctx c = ctx();
        Client owner = clientWithPhone(c.tenant, uniquePhone());
        Client other = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, owner, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        // token do outro cliente sem clientId: passa pela posse, mas o agendamento não é dele
        cancel(c, a, fixtures.deviceToken(c.tenant, other), "{}").andExpect(status().isNotFound());
        cancel(c, a, fixtures.deviceToken(c.tenant, owner), "{\"clientId\":\"" + owner.getId() + "\"}").andExpect(status().isOk());
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
    }

    @Test
    void g2_rescheduleNeedsAValidDevice() throws Exception {
        Ctx c = ctx();
        Client owner = clientWithPhone(c.tenant, uniquePhone());
        Client other = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, owner, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        reschedule(c, a, null, date, "15:00", owner.getId()).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEVICE_REQUIRED"));
        reschedule(c, a, fixtures.deviceToken(c.tenant, other), date, "15:00", owner.getId()).andExpect(status().isForbidden());
        assertThat(reload(a).getStartTime()).isEqualTo("10:00");

        reschedule(c, a, fixtures.deviceToken(c.tenant, owner), date, "15:00", null).andExpect(status().isOk());
        assertThat(reload(a).getStartTime()).isEqualTo("15:00");
    }

    @Test
    void g2_expiredDeviceIsRejected() throws Exception {
        Ctx c = ctx();
        Client owner = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, owner, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);
        String token = fixtures.deviceToken(c.tenant, owner);
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        assertThat(jdbc.update("UPDATE client_devices SET expires_at = now() - interval '1 day' WHERE token_hash = ?", hash)).isEqualTo(1);

        cancel(c, a, token, null).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEVICE_REQUIRED"));
    }

    @Test
    void g2_myAppointmentsNeedsTheDevice_andTheNewBookEndpointResolvesTheClientFromTheToken() throws Exception {
        Ctx c = ctx();
        Client owner = clientWithPhone(c.tenant, uniquePhone());
        Client other = clientWithPhone(c.tenant, uniquePhone());
        appt(c, owner, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);
        appt(c, other, date, "11:00", "11:30", AppointmentStatus.CONFIRMED);
        String ownerToken = fixtures.deviceToken(c.tenant, owner);

        mockMvc.perform(get(base(c) + "/book/my-appointments")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("DEVICE_REQUIRED"));
        mockMvc.perform(get(base(c) + "/book/my-appointments").header("X-Device-Token", "x")).andExpect(status().isForbidden());

        JsonNode mine = json.readTree(mockMvc.perform(get(base(c) + "/book/my-appointments").header("X-Device-Token", ownerToken))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).get("clientId").asText()).isEqualTo(owner.getId().toString());

        // my-appointments?clientId=: precisa do token e o clientId tem de ser o dele
        mockMvc.perform(get(base(c) + "/my-appointments").param("clientId", owner.getId().toString())).andExpect(status().isForbidden());
        mockMvc.perform(get(base(c) + "/my-appointments").param("clientId", other.getId().toString()).header("X-Device-Token", ownerToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(base(c) + "/my-appointments").param("clientId", owner.getId().toString()).header("X-Device-Token", ownerToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
    }

    @Test
    void g2_deviceFromAnotherTenantIsRejected() throws Exception {
        Ctx a = ctx();
        Ctx b = ctx();
        Client owner = clientWithPhone(a.tenant, uniquePhone());
        String token = fixtures.deviceToken(a.tenant, owner);

        mockMvc.perform(get(base(b) + "/book/my-appointments").header("X-Device-Token", token)).andExpect(status().isForbidden());
    }

    @Test
    void g2_deviceIssuedByTheBookFlowWorksOnTheNewEndpoints() throws Exception {
        Ctx c = ctx();
        JsonNode verified = bookWithCode(c, "Cliente Novo", uniquePhone(), "10:00");
        String token = verified.get("data").get("deviceToken").asText();

        mockMvc.perform(get(base(c) + "/book/my-appointments").header("X-Device-Token", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
    }

    // ── G2: portal antigo (e-mail/senha, verificação) devolve deviceToken ──────────────────────────

    @Test
    void g2_portalLoginReturnsADeviceTokenThatWorks() throws Exception {
        Ctx c = ctx();
        Client client = fixtures.client(c.tenant);
        client.setPasswordHash(passwordEncoder.encode("senha123"));
        client.setEmailVerified(true);
        clientRepository.save(client);
        appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        String res = mockMvc.perform(post(base(c) + "/login/client").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + client.getEmail() + "\",\"password\":\"senha123\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode data = json.readTree(res).get("data");
        String token = data.get("deviceToken").asText();
        assertThat(token).isNotBlank();
        assertThat(data.get("id").asText()).isEqualTo(client.getId().toString());

        mockMvc.perform(get(base(c) + "/my-appointments").param("clientId", client.getId().toString()).header("X-Device-Token", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
    }

    @Test
    void g2_verifyEmailReturnsADeviceToken() throws Exception {
        Ctx c = ctx();
        Client client = fixtures.client(c.tenant);
        client.setPasswordHash(passwordEncoder.encode("senha123"));
        client.setEmailVerified(false);
        clientRepository.save(client);
        String raw = UUID.randomUUID().toString().replace("-", "");
        emailTokenRepository.save(ClientEmailToken.builder().clientId(client.getId()).token(raw)
                .expiresAt(Instant.now().plus(1, ChronoUnit.HOURS)).build());

        String res = mockMvc.perform(get(base(c) + "/verify-email").param("token", raw))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        String token = json.readTree(res).get("data").get("deviceToken").asText();
        assertThat(token).isNotBlank();
        mockMvc.perform(get(base(c) + "/book/my-appointments").header("X-Device-Token", token)).andExpect(status().isOk());
    }
}

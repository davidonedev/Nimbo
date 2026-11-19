package com.agendepro.publicapi;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.appointment.PendingExpiryService;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.appointment.AppointmentRepository;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.notification.WhatsappService;
import com.agendepro.professional.Professional;
import com.agendepro.professional.ProfessionalServiceLink;
import com.agendepro.professional.ProfessionalServiceLinkRepository;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.TestFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Agendamento público por celular: código por WhatsApp, aparelho reconhecido, conflito e limites. */
class PhoneBookingIntegrationTest extends AbstractIntegrationTest {

    private static final String PHONE = "(19) 98179-4567";
    private static final String PHONE_E164 = "5519981794567";
    private static final String OTHER_PHONE = "(11) 91234-5678";

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private ClientRepository clientRepository;
    @Autowired private AppointmentRepository appointmentRepository;
    @Autowired private ProfessionalServiceLinkRepository linkRepository;
    @Autowired private BookingChallengeRepository challengeRepository;
    @Autowired private PendingExpiryService pendingExpiryService;
    @Autowired private AuthTestHelper authTestHelper;
    @MockBean private WhatsappService whatsappService;

    private final ObjectMapper json = new ObjectMapper();
    private final String date = LocalDate.now(ZoneId.of("America/Sao_Paulo")).plusDays(2).toString();

    @BeforeEach
    void whatsappDelivers() {
        Mockito.reset(whatsappService);
        Mockito.when(whatsappService.isAvailable(any())).thenReturn(true);
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenReturn(WhatsappService.SendResult.SENT);
    }

    private record Ctx(Tenant tenant, Professional professional, ServiceOffering service) {
    }

    private Ctx setUp() {
        Tenant tenant = fixtures.tenant(TenantPlan.BASIC);
        Professional professional = fixtures.professional(tenant);
        ServiceOffering service = fixtures.service(tenant, 40.0, 30);
        linkRepository.save(ProfessionalServiceLink.of(professional.getId(), service.getId()));
        return new Ctx(tenant, professional, service);
    }

    private String bookBody(Ctx c, String phone, String time) {
        return """
                {"name":"Fulano de Tal","phone":"%s","serviceIds":["%s"],"date":"%s","startTime":"%s"}
                """.formatted(phone, c.service.getId(), date, time);
    }

    private JsonNode book(Ctx c, String phone, String time, String deviceToken, int expectedStatus) throws Exception {
        var req = post("/api/public/" + c.tenant.getSlug() + "/book").contentType(MediaType.APPLICATION_JSON).content(bookBody(c, phone, time));
        if (deviceToken != null) req.header("X-Device-Token", deviceToken);
        String body = mockMvc.perform(req).andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private JsonNode verify(Ctx c, String challengeId, String code, int expectedStatus) throws Exception {
        String body = mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book/verify").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"challengeId\":\"" + challengeId + "\",\"code\":\"" + code + "\"}"))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    /** Pega o código de 6 dígitos da última mensagem de WhatsApp enviada ao celular. */
    private String lastCode() {
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        Mockito.verify(whatsappService, Mockito.atLeastOnce()).sendNow(any(), eq(PHONE_E164), text.capture());
        Matcher m = Pattern.compile("\\*(\\d{6})\\*").matcher(text.getValue());
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    @Test
    void firstBookingNeedsCodeThenRecognisesTheDevice() throws Exception {
        Ctx c = setUp();

        JsonNode challenge = book(c, PHONE, "10:00", null, 200).get("data");
        assertThat(challenge.get("kind").asText()).isEqualTo("challenge_required");
        assertThat(challenge.get("maskedPhone").asText()).endsWith("67").doesNotContain("9817");
        assertThat(appointmentRepository.findAll().stream().filter(a -> a.getTenantId().equals(c.tenant.getId()))).isEmpty();

        String id = challenge.get("challengeId").asText();
        verify(c, id, "000000".equals(lastCode()) ? "111111" : "000000", 400);

        JsonNode booked = verify(c, id, lastCode(), 200).get("data");
        assertThat(booked.get("kind").asText()).isEqualTo("booked");
        assertThat(booked.get("booking").get("items").get(0).get("startTime").asText()).isEqualTo("10:00");
        String deviceToken = booked.get("deviceToken").asText();
        assertThat(deviceToken).isNotBlank();

        Client client = clientRepository.findFirstByTenantIdAndPhoneE164OrderByCreatedAtAsc(c.tenant.getId(), PHONE_E164).orElseThrow();
        assertThat(client.getEmail()).isNull();
        assertThat(client.getPhone()).isEqualTo(PHONE);

        // código não pode ser reaproveitado
        verify(c, id, lastCode(), 400);

        // mesmo aparelho + mesmo celular: agenda direto, sem novo código
        Mockito.clearInvocations(whatsappService);
        JsonNode direct = book(c, PHONE, "11:00", deviceToken, 200).get("data");
        assertThat(direct.get("kind").asText()).isEqualTo("booked");
        Mockito.verify(whatsappService, Mockito.never()).sendNow(any(), any(), any());

        // mesmo aparelho, OUTRO celular: pede código
        JsonNode other = book(c, OTHER_PHONE, "12:00", deviceToken, 200).get("data");
        assertThat(other.get("kind").asText()).isEqualTo("challenge_required");

        // reconhecimento devolve nome e o último serviço
        mockMvc.perform(get("/api/public/" + c.tenant.getSlug() + "/book/possession").header("X-Device-Token", deviceToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.recognized").value(true))
                .andExpect(jsonPath("$.data.fullName").value("Fulano de Tal"))
                .andExpect(jsonPath("$.data.lastServiceId").value(c.service.getId().toString()));
        mockMvc.perform(get("/api/public/" + c.tenant.getSlug() + "/book/possession").header("X-Device-Token", "inventado"))
                .andExpect(jsonPath("$.data.recognized").value(false));
    }

    @Test
    void bookedSlotDisappearsAndCannotBeTakenAgain() throws Exception {
        Ctx c = setUp();
        String id = book(c, PHONE, "10:00", null, 200).get("data").get("challengeId").asText();
        verify(c, id, lastCode(), 200);

        String slots = mockMvc.perform(get("/api/public/" + c.tenant.getSlug() + "/book/slots")
                        .param("serviceIds", c.service.getId().toString()).param("date", date))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(slots).get("data").toString()).contains("09:30").doesNotContain("\"10:00\"").contains("\"10:30\"");

        JsonNode taken = book(c, OTHER_PHONE, "10:00", null, 409);
        assertThat(taken.get("code").asText()).isEqualTo("SCHEDULE_CONFLICT");

        mockMvc.perform(get("/api/public/" + c.tenant.getSlug() + "/book/days")
                        .param("serviceIds", c.service.getId().toString()).param("from", date).param("count", "3"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0]").value(date));
    }

    @Test
    void wrongCodeIsLimitedToFiveAttempts() throws Exception {
        Ctx c = setUp();
        String id = book(c, PHONE, "10:00", null, 200).get("data").get("challengeId").asText();
        String real = lastCode();
        String wrong = "000000".equals(real) ? "111111" : "000000";
        for (int i = 0; i < 5; i++) verify(c, id, wrong, 400);

        JsonNode blocked = verify(c, id, real, 429);
        assertThat(blocked.get("code").asText()).isEqualTo("TOO_MANY_ATTEMPTS");
    }

    @Test
    void invalidPhoneAndClosedPlaceAreRejected() throws Exception {
        Ctx c = setUp();
        assertThat(book(c, "123", "10:00", null, 400).get("code").asText()).isEqualTo("INVALID_PHONE");

        c.tenant.setIsOpen(false);
        fixtures.saveTenant(c.tenant);
        assertThat(book(c, PHONE, "10:00", null, 403).get("code").asText()).isEqualTo("CLOSED");
    }

    // ─── Sem WhatsApp: horário pendente com prazo, confirmado pelo dono ─────────────────────────────

    private Ctx setUpWithoutWhatsapp(boolean tenantHasPhone) {
        Ctx c = setUp();
        if (tenantHasPhone) {
            c.tenant.setPhone("(19) 98179-4567");
            fixtures.saveTenant(c.tenant);
        }
        Mockito.when(whatsappService.isAvailable(any())).thenReturn(false);
        return c;
    }

    @Test
    void withoutWhatsappTheSlotIsHeldAsPendingWithADeadline() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);

        JsonNode res = book(c, PHONE, "10:00", null, 200).get("data");
        assertThat(res.get("kind").asText()).isEqualTo("pending_confirmation");
        assertThat(res.get("booking").get("items").get(0).get("startTime").asText()).isEqualTo("10:00");
        Instant confirmBy = Instant.parse(res.get("confirmBy").asText());
        assertThat(confirmBy).isBetween(Instant.now().plusSeconds(179 * 60), Instant.now().plusSeconds(181 * 60));
        assertThat(res.get("deviceToken").isNull()).isTrue(); // celular não verificado: aparelho NÃO é reconhecido

        var appt = appointmentRepository.findAll().stream().filter(a -> a.getTenantId().equals(c.tenant.getId())).toList();
        assertThat(appt).hasSize(1);
        assertThat(appt.get(0).getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(appt.get(0).getConfirmBy()).isNotNull();
        assertThat(challengeRepository.findAll().stream().filter(ch -> ch.getTenantId().equals(c.tenant.getId()))).isEmpty();
        Mockito.verify(whatsappService, Mockito.never()).sendNow(any(), any(), any());

        // o horário fica ocupado
        assertThat(book(c, OTHER_PHONE, "10:00", null, 409).get("code").asText()).isEqualTo("SCHEDULE_CONFLICT");
    }

    @Test
    void tenantWithoutPhoneGetsNoDeadline() throws Exception {
        Ctx c = setUpWithoutWhatsapp(false);
        JsonNode res = book(c, PHONE, "10:00", null, 200).get("data");
        assertThat(res.get("kind").asText()).isEqualTo("pending_confirmation");
        assertThat(res.get("confirmBy").isNull()).isTrue();
    }

    @Test
    void configuredWhatsappThatFailsFallsBackToPending() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        Mockito.when(whatsappService.isAvailable(any())).thenReturn(true);
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenReturn(WhatsappService.SendResult.FAILED);

        assertThat(book(c, PHONE, "10:00", null, 200).get("data").get("kind").asText()).isEqualTo("pending_confirmation");
        assertThat(challengeRepository.findAll().stream().filter(ch -> ch.getTenantId().equals(c.tenant.getId()))).isEmpty();
    }

    @Test
    void aClientCannotHoldMoreThanThreePendingSlots() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        for (String time : new String[]{"09:00", "10:00", "11:00"}) {
            assertThat(book(c, PHONE, time, null, 200).get("data").get("kind").asText()).isEqualTo("pending_confirmation");
        }
        assertThat(book(c, PHONE, "12:00", null, 429).get("code").asText()).isEqualTo("TOO_MANY_PENDING");
    }

    @Test
    void unconfirmedSlotsAreReleasedAfterTheDeadline() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        book(c, PHONE, "10:00", null, 200);
        var appt = appointmentRepository.findAll().stream().filter(a -> a.getTenantId().equals(c.tenant.getId())).findFirst().orElseThrow();

        pendingExpiryService.expireOnSchedule(); // o job real (com transação) roda sem erro
        assertThat(pendingExpiryService.expire(Instant.now())).isZero(); // ainda no prazo
        appt.setConfirmBy(Instant.now().minusSeconds(60));
        appointmentRepository.save(appt);
        assertThat(pendingExpiryService.expire(Instant.now())).isGreaterThanOrEqualTo(1);

        assertThat(appointmentRepository.findById(appt.getId()).orElseThrow().getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        // o horário volta a ficar livre
        assertThat(book(c, OTHER_PHONE, "10:00", null, 200).get("data").get("kind").asText()).isEqualTo("pending_confirmation");
    }

    @Test
    void confirmedOrOtherPendingAppointmentsAreNotExpired() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        book(c, PHONE, "10:00", null, 200);
        var appt = appointmentRepository.findAll().stream().filter(a -> a.getTenantId().equals(c.tenant.getId())).findFirst().orElseThrow();
        appt.setStatus(AppointmentStatus.CONFIRMED);
        appt.setConfirmBy(Instant.now().minusSeconds(60));
        appointmentRepository.save(appt);
        pendingExpiryService.expire(Instant.now());
        assertThat(appointmentRepository.findById(appt.getId()).orElseThrow().getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
    }

    // ─── Confirmação em massa pelo dono ─────────────────────────────────────────────────────────────

    private String adminToken(Ctx c) throws Exception {
        String email = "adm-" + UUID.randomUUID() + "@example.com";
        fixtures.admin(c.tenant, email, "senha123");
        return authTestHelper.login(mockMvc, email, "senha123");
    }

    @Test
    void ownerConfirmsSeveralPendingAppointmentsAtOnce() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        book(c, PHONE, "09:00", null, 200);
        book(c, OTHER_PHONE, "10:00", null, 200);
        var mine = appointmentRepository.findAll().stream().filter(a -> a.getTenantId().equals(c.tenant.getId())).toList();
        var cancelled = mine.get(1);
        cancelled.setStatus(AppointmentStatus.CANCELLED);
        appointmentRepository.save(cancelled);

        // agendamento de OUTRO estabelecimento: nunca pode ser tocado
        Ctx other = setUpWithoutWhatsapp(true);
        book(other, PHONE, "09:00", null, 200);
        var foreign = appointmentRepository.findAll().stream().filter(a -> a.getTenantId().equals(other.tenant.getId())).findFirst().orElseThrow();

        String ids = "[\"" + mine.get(0).getId() + "\",\"" + mine.get(1).getId() + "\",\"" + foreign.getId() + "\"]";
        mockMvc.perform(post("/api/admin/appointments/bulk-confirm").header("Authorization", "Bearer " + adminToken(c))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"ids\":" + ids + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.confirmed").value(1))
                .andExpect(jsonPath("$.data.skipped").value(2));

        var done = appointmentRepository.findById(mine.get(0).getId()).orElseThrow();
        assertThat(done.getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(done.getConfirmBy()).isNull();
        assertThat(appointmentRepository.findById(foreign.getId()).orElseThrow().getStatus()).isEqualTo(AppointmentStatus.PENDING);
    }

    @Test
    void bulkConfirmNeedsAnAdminAndAnIdList() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        mockMvc.perform(post("/api/admin/appointments/bulk-confirm").contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[]}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/admin/appointments/bulk-confirm").header("Authorization", "Bearer " + adminToken(c))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[]}"))
                .andExpect(status().isUnprocessableEntity());
    }

    // ─── Captcha e limite por IP ────────────────────────────────────────────────────────────────────

    @Test
    void captchaIsRequiredOnlyWhenTheSecretIsConfigured() {
        CaptchaService off = new CaptchaService();
        off.verify(null, "1.2.3.4"); // sem chave: pula (desenvolvimento)

        CaptchaService on = new CaptchaService();
        org.springframework.test.util.ReflectionTestUtils.setField(on, "secret", "segredo");
        assertThat(on.enabled()).isTrue();
        org.junit.jupiter.api.Assertions.assertThrows(com.agendepro.common.AppException.class, () -> on.verify(null, "1.2.3.4"));
        org.junit.jupiter.api.Assertions.assertThrows(com.agendepro.common.AppException.class, () -> on.verify("  ", "1.2.3.4"));
    }

    @Test
    void attemptLimiterBlocksAnIpAfterTheCapacity() {
        BookingAttemptLimiter limiter = new BookingAttemptLimiter(3, 15);
        for (int i = 0; i < 3; i++) limiter.check("9.9.9.9");
        var ex = org.junit.jupiter.api.Assertions.assertThrows(com.agendepro.common.AppException.class, () -> limiter.check("9.9.9.9"));
        assertThat(ex.getStatusCode()).isEqualTo(429);
        limiter.check("8.8.8.8"); // outro IP não é afetado
    }

    // ─── Só o cliente tem prazo (3 h); depois que ele toca no botão, o horário fica reservado ────────

    private JsonNode clientConfirmed(Ctx c, String... appointmentIds) throws Exception {
        String ids = String.join("\",\"", appointmentIds);
        String body = mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book/client-confirmed")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"appointmentIds\":[\"" + ids + "\"]}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("data");
    }

    private String bookPendingAndGetId(Ctx c, String phone, String time) throws Exception {
        return book(c, phone, time, null, 200).get("data").get("booking").get("items").get(0).get("id").asText();
    }

    private com.agendepro.appointment.Appointment appt(String id) {
        return appointmentRepository.findById(java.util.UUID.fromString(id)).orElseThrow();
    }

    @Test
    void whenTheClientTapsConfirmTheDeadlineDisappears() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        String id = bookPendingAndGetId(c, PHONE, "10:00");
        assertThat(appt(id).getConfirmBy()).isNotNull(); // antes do toque: prazo do cliente

        assertThat(clientConfirmed(c, id).get("confirmed").asInt()).isEqualTo(1);

        var after = appt(id);
        assertThat(after.getClientConfirmedAt()).isNotNull();
        assertThat(after.getConfirmBy()).isNull();                       // sem prazo
        assertThat(after.getStatus()).isEqualTo(AppointmentStatus.PENDING); // o dono ainda decide

        assertThat(clientConfirmed(c, id).get("confirmed").asInt()).isEqualTo(1); // repetir é inofensivo
        assertThat(appt(id).getClientConfirmedAt()).isEqualTo(after.getClientConfirmedAt());
    }

    @Test
    void aSlotTheClientConfirmedIsNeverReleasedAutomatically() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        String confirmedByClient = bookPendingAndGetId(c, PHONE, "09:00");
        String neverTapped = bookPendingAndGetId(c, OTHER_PHONE, "10:00");
        clientConfirmed(c, confirmedByClient);

        // 4 h depois: quem não tocou perdeu o horário; quem tocou continua
        pendingExpiryService.expire(Instant.now().plusSeconds(4 * 3600));
        assertThat(appt(neverTapped).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(appt(confirmedByClient).getStatus()).isEqualTo(AppointmentStatus.PENDING);

        // mesmo muito tempo depois, só o dono (ou o cancelamento) decide
        pendingExpiryService.expire(Instant.now().plusSeconds(30L * 24 * 3600));
        assertThat(appt(confirmedByClient).getStatus()).isEqualTo(AppointmentStatus.PENDING);
    }

    @Test
    void clientConfirmationIgnoresExpiredAlreadyDecidedAndForeignAppointments() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        String expired = bookPendingAndGetId(c, PHONE, "09:00");
        String decided = bookPendingAndGetId(c, PHONE, "10:00");
        var a1 = appt(expired);
        a1.setConfirmBy(Instant.now().minusSeconds(60)); // prazo do cliente já passou
        appointmentRepository.save(a1);
        var a2 = appt(decided);
        a2.setStatus(AppointmentStatus.CONFIRMED);
        a2.setConfirmBy(null);
        appointmentRepository.save(a2);

        Ctx other = setUpWithoutWhatsapp(true);
        String foreign = bookPendingAndGetId(other, PHONE, "09:00");

        assertThat(clientConfirmed(c, expired, decided, foreign).get("confirmed").asInt()).isZero(); // 'foreign' é de outro estabelecimento
        assertThat(appt(expired).getClientConfirmedAt()).isNull();
        assertThat(appt(foreign).getClientConfirmedAt()).isNull();
    }

    @Test
    void confirmedPendingSlotsStillCountTowardsThePerPhoneLimit() throws Exception {
        Ctx c = setUpWithoutWhatsapp(true);
        for (String time : new String[]{"09:00", "10:00", "11:00"}) {
            clientConfirmed(c, bookPendingAndGetId(c, PHONE, time)); // toca no botão em todos: ficam sem prazo
        }
        assertThat(book(c, PHONE, "12:00", null, 429).get("code").asText()).isEqualTo("TOO_MANY_PENDING");
    }
}

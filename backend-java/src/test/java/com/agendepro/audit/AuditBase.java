package com.agendepro.audit;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentRepository;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.notification.WhatsappService;
import com.agendepro.professional.Professional;
import com.agendepro.professional.ProfessionalRepository;
import com.agendepro.professional.ProfessionalServiceLink;
import com.agendepro.professional.ProfessionalServiceLinkRepository;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.mockito.invocation.Invocation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Base dos testes de AUDITORIA do fluxo de agendamento (cliente → admin → atendimento).
 *
 * <p>Nada real é enviado: {@link WhatsappService} e {@code EmailService} são mocks e os testes inspecionam o que
 * SERIA enviado. Convenção: testes {@code gap_*} PASSAM documentando um comportamento atual que diverge do fluxo-alvo
 * (lacuna/bug); ao corrigir, inverter a assertiva.
 */
abstract class AuditBase extends AbstractIntegrationTest {

    protected static final ZoneId SP = ZoneId.of("America/Sao_Paulo");
    protected static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    @Autowired protected MockMvc mockMvc;
    @Autowired protected TestFixtures fixtures;
    @Autowired protected AuthTestHelper authHelper;
    @Autowired protected AppointmentRepository appointmentRepository;
    @Autowired protected ClientRepository clientRepository;
    @Autowired protected ProfessionalRepository professionalRepository;
    @Autowired protected ProfessionalServiceLinkRepository linkRepository;
    @MockBean protected WhatsappService whatsappService;

    protected final ObjectMapper json = new ObjectMapper();
    protected final String date = LocalDate.now(SP).plusDays(2).toString();

    protected static final class Ctx {
        final Tenant tenant;
        final Professional professional;
        final ServiceOffering service;

        Ctx(Tenant tenant, Professional professional, ServiceOffering service) {
            this.tenant = tenant;
            this.professional = professional;
            this.service = service;
        }
    }

    @BeforeEach
    void resetNotificationMocks() {
        Mockito.reset(whatsappService, emailService);
        // o mock não pode devolver null nos auxiliares puros (o texto do lembrete passa por eles)
        Mockito.when(whatsappService.interpolateTemplate(any(), any())).thenCallRealMethod();
        Mockito.when(whatsappService.normalizePhone(any())).thenCallRealMethod();
        whatsappOff();
    }

    /** Estabelecimento sem WhatsApp próprio nem da plataforma: o agendamento nasce pendente, sem código. */
    protected void whatsappOff() {
        Mockito.when(whatsappService.isAvailable(any())).thenReturn(false);
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenReturn(WhatsappService.SendResult.NOT_CONFIGURED);
    }

    /** WhatsApp disponível e entregando (simulado): o fluxo usa código de 6 dígitos. */
    protected void whatsappOn() {
        Mockito.when(whatsappService.isAvailable(any())).thenReturn(true);
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenReturn(WhatsappService.SendResult.SENT);
    }

    // ─── dados ──────────────────────────────────────────────────────────────────────────────────────

    protected static String uniquePhone() {
        String d = String.format("%08d", ThreadLocalRandom.current().nextInt(10_000_000, 99_999_999));
        return "(19) 9" + d.substring(0, 4) + "-" + d.substring(4);
    }

    protected static String digits(String s) {
        return s == null ? "" : s.replaceAll("\\D", "");
    }

    protected static String e164(String phone) {
        return "55" + digits(phone);
    }

    /** Estabelecimento com 1 profissional (08:00–18:00, todos os dias) e 1 serviço de R$ 40 que ele faz. */
    protected Ctx ctx() {
        return ctx(true, 30);
    }

    protected Ctx ctx(boolean tenantHasPhone, int serviceMinutes) {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        if (tenantHasPhone) {
            t.setPhone(uniquePhone());
            t = fixtures.saveTenant(t);
        }
        Professional p = fixtures.professional(t);
        ServiceOffering s = fixtures.service(t, 40.0, serviceMinutes);
        linkRepository.save(ProfessionalServiceLink.of(p.getId(), s.getId()));
        return new Ctx(t, p, s);
    }

    protected Professional professional(Tenant t, ServiceOffering link, String start, String end, Integer[] days) {
        Professional p = professionalRepository.save(Professional.builder()
                .tenantId(t.getId()).name("Prof " + UUID.randomUUID().toString().substring(0, 6))
                .workingHoursStart(start).workingHoursEnd(end).workingDays(days).build());
        linkRepository.save(ProfessionalServiceLink.of(p.getId(), link.getId()));
        return p;
    }

    protected Client clientWithPhone(Tenant t, String phone) {
        Client c = fixtures.client(t);
        c.setPhone(phone);
        return clientRepository.save(c);
    }

    protected Appointment appt(Ctx c, Client client, LocalDateTime start, AppointmentStatus status) {
        return appointmentRepository.save(Appointment.builder()
                .tenantId(c.tenant.getId()).clientId(client.getId()).professionalId(c.professional.getId())
                .serviceId(c.service.getId()).date(start.toLocalDate().toString()).startTime(start.format(HHMM))
                .endTime(start.plusMinutes(30).format(HHMM)).price(c.service.getPrice()).status(status).build());
    }

    protected Appointment appt(Ctx c, Client client, String day, String start, String end, AppointmentStatus status) {
        return appointmentRepository.save(Appointment.builder()
                .tenantId(c.tenant.getId()).clientId(client.getId()).professionalId(c.professional.getId())
                .serviceId(c.service.getId()).date(day).startTime(start).endTime(end).price(c.service.getPrice()).status(status).build());
    }

    protected Appointment reload(Appointment a) {
        return appointmentRepository.findById(a.getId()).orElseThrow();
    }

    protected List<Appointment> appointmentsOf(Tenant t) {
        return appointmentRepository.findAll().stream().filter(a -> a.getTenantId().equals(t.getId())).toList();
    }

    protected String adminToken(Tenant t) throws Exception {
        String email = "adm-" + UUID.randomUUID() + "@example.com";
        fixtures.admin(t, email, "senha123");
        return authHelper.login(mockMvc, email, "senha123");
    }

    protected String professionalToken(Tenant t, Professional p) throws Exception {
        String email = "prof-" + UUID.randomUUID() + "@example.com";
        fixtures.professionalUser(t, p, email, "senha123");
        return authHelper.login(mockMvc, email, "senha123");
    }

    protected static String bearer(String token) {
        return "Bearer " + token;
    }

    // ─── HTTP ───────────────────────────────────────────────────────────────────────────────────────

    protected String bookBody(Ctx c, String name, String phone, String day, String time) {
        return """
                {"name":"%s","phone":"%s","serviceIds":["%s"],"date":"%s","startTime":"%s"}
                """.formatted(name, phone, c.service.getId(), day, time);
    }

    /** POST /api/public/{slug}/book — devolve o corpo inteiro (success/data/code). */
    protected JsonNode book(Ctx c, String name, String phone, String time, String deviceToken, int expectedStatus) throws Exception {
        return bookOn(c, name, phone, date, time, deviceToken, expectedStatus);
    }

    protected JsonNode bookOn(Ctx c, String name, String phone, String day, String time, String deviceToken, int expectedStatus) throws Exception {
        var req = post("/api/public/" + c.tenant.getSlug() + "/book").contentType(MediaType.APPLICATION_JSON)
                .content(bookBody(c, name, phone, day, time));
        if (deviceToken != null) req.header("X-Device-Token", deviceToken);
        String body = mockMvc.perform(req).andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    protected JsonNode verify(Ctx c, String challengeId, String code, int expectedStatus) throws Exception {
        String body = mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book/verify").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"challengeId\":\"" + challengeId + "\",\"code\":\"" + code + "\"}"))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    /** Código de 6 dígitos que o WhatsApp (simulado) enviaria para o celular. */
    protected String sentCode(String phone) {
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        Mockito.verify(whatsappService, Mockito.atLeastOnce()).sendNow(any(), eq(e164(phone)), text.capture());
        Matcher m = Pattern.compile("\\*(\\d{6})\\*").matcher(text.getValue());
        assertThat(m.find()).as("mensagem com código: %s", text.getValue()).isTrue();
        return m.group(1);
    }

    /** Primeira reserva de um celular novo com WhatsApp ligado: pede o código, confirma e devolve o corpo do verify. */
    protected JsonNode bookWithCode(Ctx c, String name, String phone, String time) throws Exception {
        whatsappOn();
        String id = book(c, name, phone, time, null, 200).get("data").get("challengeId").asText();
        return verify(c, id, sentCode(phone), 200);
    }

    protected ResultActions patchStatus(String token, UUID id, String status) throws Exception {
        return mockMvc.perform(patch("/api/admin/appointments/" + id + "/status").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + status + "\"}"));
    }

    protected List<String> slots(Ctx c, String day) throws Exception {
        String body = mockMvc.perform(get("/api/public/" + c.tenant.getSlug() + "/book/slots")
                        .param("serviceIds", c.service.getId().toString()).param("date", day))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> out = new ArrayList<>();
        json.readTree(body).get("data").forEach(n -> out.add(n.asText()));
        return out;
    }

    protected JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    // ─── o que o sistema "enviaria" ─────────────────────────────────────────────────────────────────

    /** Destinatários (só dígitos) de tudo que passou por sendNow/sendMessage. */
    protected List<String> whatsappRecipients() {
        List<String> out = new ArrayList<>();
        for (Invocation inv : Mockito.mockingDetails(whatsappService).getInvocations()) {
            String m = inv.getMethod().getName();
            if (m.equals("sendNow") || m.equals("sendMessage")) out.add(digits(String.valueOf((Object) inv.getArgument(1))));
        }
        return out;
    }

    protected boolean whatsappSentTo(String phone) {
        String d = digits(phone);
        return whatsappRecipients().stream().anyMatch(r -> r.endsWith(d));
    }

    /** Textos que seriam enviados para o celular. */
    protected List<String> whatsappTextsTo(String phone) {
        String d = digits(phone);
        List<String> out = new ArrayList<>();
        for (Invocation inv : Mockito.mockingDetails(whatsappService).getInvocations()) {
            String m = inv.getMethod().getName();
            if ((m.equals("sendNow") || m.equals("sendMessage")) && digits(String.valueOf((Object) inv.getArgument(1))).endsWith(d)) {
                out.add(String.valueOf((Object) inv.getArgument(2)));
            }
        }
        return out;
    }

    /** Métodos de e-mail chamados cujos argumentos mencionam o texto (ex.: e-mail do dono). */
    protected List<String> emailCallsMentioning(String needle) {
        List<String> out = new ArrayList<>();
        for (Invocation inv : Mockito.mockingDetails(emailService).getInvocations()) {
            if (Arrays.deepToString(inv.getArguments()).contains(needle)) out.add(inv.getMethod().getName());
        }
        return out;
    }
}

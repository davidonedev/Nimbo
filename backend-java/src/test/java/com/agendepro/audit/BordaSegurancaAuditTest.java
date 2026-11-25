package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.appointment.PendingExpiryService;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.notification.WhatsappService;
import com.agendepro.professional.Professional;
import com.agendepro.professional.ProfessionalServiceLink;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** AUDITORIA — C. Casos de borda e segurança: concorrência, horários inválidos, transições, isolamento, abuso, falhas. */
class BordaSegurancaAuditTest extends AuditBase {

    @Autowired private PendingExpiryService pendingExpiryService;
    @Autowired private JdbcTemplate jdbc;

    // ── helpers ────────────────────────────────────────────────────────────────────────────────────

    private ResultActions adminCreate(String token, Ctx c, Client client, String day, String time) throws Exception {
        return mockMvc.perform(post("/api/admin/appointments").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"clientId":"%s","professionalId":"%s","serviceId":"%s","date":"%s","startTime":"%s"}
                        """.formatted(client.getId(), c.professional.getId(), c.service.getId(), day, time)));
    }

    private ResultActions legacyBooking(Ctx c, String day, String time, String email, String name, String phone) throws Exception {
        return mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/booking").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"professionalId":"%s","serviceIds":["%s"],"date":"%s","startTime":"%s","clientName":"%s","clientEmail":"%s","clientPhone":"%s"}
                        """.formatted(c.professional.getId(), c.service.getId(), day, time, name, email, phone)));
    }

    private ResultActions registerAndBook(Ctx c, String day, String time) throws Exception {
        return mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/register-and-book").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name":"Cadastro Rapido","email":"rb-%s@example.com","phone":"%s","password":"senha123","professionalId":"%s",
                         "serviceIds":["%s"],"date":"%s","startTime":"%s"}
                        """.formatted(UUID.randomUUID(), uniquePhone(), c.professional.getId(), c.service.getId(), day, time)));
    }

    private static int dayOfWeek(String day) {
        return LocalDate.parse(day).getDayOfWeek().getValue() % 7;
    }

    private String uniqueEmail() {
        return "lg-" + UUID.randomUUID() + "@example.com";
    }

    private List<Integer> runConcurrently(int n, java.util.function.IntFunction<ResultActions> action) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(n);
        try {
            CyclicBarrier barrier = new CyclicBarrier(n);
            List<Future<Integer>> futures = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                final int idx = i;
                futures.add(pool.submit(() -> {
                    barrier.await();
                    return action.apply(idx).andReturn().getResponse().getStatus();
                }));
            }
            List<Integer> out = new ArrayList<>();
            for (Future<Integer> f : futures) out.add(f.get());
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    // ── C1. Concorrência ───────────────────────────────────────────────────────────────────────────

    @Test
    void c1_fourClientsRaceForTheSameSlotOnThePublicBooking_onlyOneWins() throws Exception {
        Ctx c = ctx();
        List<Integer> statuses = runConcurrently(4, i -> {
            try {
                return mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book").contentType(MediaType.APPLICATION_JSON)
                        .content(bookBody(c, "Corredor " + i, uniquePhone(), date, "10:00")));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });

        assertThat(statuses).containsOnlyOnce(200).filteredOn(s -> s != 200).containsOnly(409);
        assertThat(appointmentsOf(c.tenant)).hasSize(1);
    }

    @Test
    void c1_fourAdminCreationsRaceForTheSameSlot_onlyOneWins() throws Exception {
        Ctx c = ctx();
        String token = adminToken(c.tenant);
        List<Client> clients = new ArrayList<>();
        for (int i = 0; i < 4; i++) clients.add(fixtures.client(c.tenant));

        List<Integer> statuses = runConcurrently(4, i -> {
            try {
                return adminCreate(token, c, clients.get(i), date, "10:00");
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });

        assertThat(statuses).containsOnlyOnce(201).filteredOn(s -> s != 201).containsOnly(409);
        assertThat(appointmentsOf(c.tenant)).hasSize(1);
    }

    // ── C2. Horários inválidos por cada porta de entrada ───────────────────────────────────────────

    @Test
    void c2_phoneBookingRejectsOutsideHoursOffDaysAndBlockedSlots() throws Exception {
        Ctx c = ctx();
        assertThat(book(c, "Madrugador", uniquePhone(), "03:00", null, 409).get("code").asText()).isEqualTo("SCHEDULE_CONFLICT");

        Integer[] allButTarget = java.util.stream.IntStream.rangeClosed(0, 6).filter(d -> d != dayOfWeek(date)).boxed().toArray(Integer[]::new);
        c.professional.setWorkingDays(allButTarget);
        professionalRepository.save(c.professional);
        assertThat(book(c, "Dia de Folga", uniquePhone(), "10:00", null, 409).get("code").asText()).isEqualTo("SCHEDULE_CONFLICT");

        Ctx blocked = ctx();
        fixtures.blockedSlot(blocked.tenant, blocked.professional, date, "14:00", "15:00");
        book(blocked, "Bloqueio 1", uniquePhone(), "14:00", null, 409);
        book(blocked, "Bloqueio 2", uniquePhone(), "14:30", null, 409);
        book(blocked, "Livre", uniquePhone(), "15:00", null, 200);
    }

    @Test
    void c2_phoneBookingRejectsTodaysSlotsThatAlreadyPassed() throws Exception {
        Assumptions.assumeTrue(LocalTime.now(SP).isAfter(LocalTime.of(0, 40)), "só vale depois das 00:40 (SP)");
        Ctx c = ctx();
        c.professional.setWorkingHoursStart("00:00");
        c.professional.setWorkingHoursEnd("23:45");
        professionalRepository.save(c.professional);

        bookOn(c, "Atrasado", uniquePhone(), LocalDate.now(SP).toString(), "00:15", null, 409);
    }

    @Test
    void gap_c2_phoneBookingAcceptsPastDaysAndDatesBeyondTheAdvanceLimit() throws Exception {
        // documenta lacuna: book() só valida a janela (hoje..+60 dias) em slots()/days(), não ao gravar
        Ctx c = ctx();
        String yesterday = LocalDate.now(SP).minusDays(1).toString();
        String farFuture = LocalDate.now(SP).plusDays(200).toString();

        bookOn(c, "Do Passado", uniquePhone(), yesterday, "10:00", null, 200);
        bookOn(c, "Do Futuro", uniquePhone(), farFuture, "10:00", null, 200);

        assertThat(appointmentsOf(c.tenant)).extracting(Appointment::getDate).contains(yesterday, farFuture);
    }

    @Test
    void c2_legacyBookingEndpointsWereRemoved_soNoUnprotectedPathCreatesAppointments() throws Exception {
        // /booking e /register-and-book não tinham captcha, limite, validação de data nem prazo: foram removidos.
        // O único caminho público de agendamento é o /book (coberto pelos testes c1, c2 e c9).
        Ctx c = ctx();
        String yesterday = LocalDate.now(SP).minusDays(1).toString();

        legacyBooking(c, yesterday, "10:00", uniqueEmail(), "Legado Passado", uniquePhone()).andExpect(status().is4xxClientError());
        legacyBooking(c, date, "10:00", uniqueEmail(), "Legado", uniquePhone()).andExpect(status().is4xxClientError());
        registerAndBook(c, date, "11:00").andExpect(status().is4xxClientError());

        assertThat(appointmentsOf(c.tenant)).isEmpty();
    }

    @Test
    void c2_adminCreateRejectsPast_acceptsOutsideHours_andStillRespectsBlocks() throws Exception {
        // data/hora passada é rejeitada (INVALID_DATE); fora do expediente segue aceito (admin decide); bloqueio e conflito valem
        Ctx c = ctx();
        String token = adminToken(c.tenant);
        Client client = fixtures.client(c.tenant);
        String yesterday = LocalDate.now(SP).minusDays(1).toString();

        adminCreate(token, c, client, yesterday, "10:00").andExpect(status().isBadRequest());
        adminCreate(token, c, client, date, "03:00").andExpect(status().isCreated());

        fixtures.blockedSlot(c.tenant, c.professional, date, "14:00", "15:00");
        adminCreate(token, c, client, date, "14:30").andExpect(status().isConflict());
    }

    @Test
    void c2_multipleServicesAreChainedAndBlockTheWholeDuration() throws Exception {
        Ctx c = ctx(); // serviço 1: 30 min
        ServiceOffering second = fixtures.service(c.tenant, 60.0, 45);
        linkRepository.save(ProfessionalServiceLink.of(c.professional.getId(), second.getId()));

        String body = """
                {"name":"Combo","phone":"%s","serviceIds":["%s","%s"],"date":"%s","startTime":"10:00"}
                """.formatted(uniquePhone(), c.service.getId(), second.getId(), date);
        JsonNode res = json.readTree(mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data").get("booking");

        assertThat(res.get("totalDuration").asInt()).isEqualTo(75);
        assertThat(res.get("totalPrice").asDouble()).isEqualTo(100.0);
        assertThat(res.get("items").get(0).get("startTime").asText()).isEqualTo("10:00");
        assertThat(res.get("items").get(0).get("endTime").asText()).isEqualTo("10:30");
        assertThat(res.get("items").get(1).get("startTime").asText()).isEqualTo("10:30");
        assertThat(res.get("items").get(1).get("endTime").asText()).isEqualTo("11:15");
        assertThat(slots(c, date)).contains("09:30", "11:15").doesNotContain("10:00", "10:30", "10:45");
    }

    // ── C3. Fuso ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void c3_databaseSaoPauloRulesHaveNoDaylightSavingToday() {
        long summer = jdbc.queryForObject("select extract(epoch from ('2027-01-15 12:00:00'::timestamp at time zone 'America/Sao_Paulo'))::bigint", Long.class);
        assertThat(summer).isEqualTo(LocalDateTime.of(2027, 1, 15, 15, 0).toEpochSecond(ZoneOffset.UTC)); // UTC-3, sem horário de verão
        long oldDst = jdbc.queryForObject("select extract(epoch from ('2018-11-10 12:00:00'::timestamp at time zone 'America/Sao_Paulo'))::bigint", Long.class);
        assertThat(oldDst).isEqualTo(LocalDateTime.of(2018, 11, 10, 14, 0).toEpochSecond(ZoneOffset.UTC)); // UTC-2 (último verão)
        assertThat(SP.getRules().isDaylightSavings(Instant.parse("2027-01-15T12:00:00Z"))).isFalse();
    }

    // ── C4. Falhas do provedor de WhatsApp ─────────────────────────────────────────────────────────

    @Test
    void c4_whenTheWhatsappProviderFails_theBookingStillSucceedsAsPending() throws Exception {
        Ctx c = ctx();
        Mockito.when(whatsappService.isAvailable(any())).thenReturn(true);
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenReturn(WhatsappService.SendResult.FAILED);

        JsonNode data = book(c, "Cliente Resiliente", uniquePhone(), "10:00", null, 200).get("data");

        assertThat(data.get("kind").asText()).isEqualTo("pending_confirmation");
        assertThat(appointmentsOf(c.tenant)).hasSize(1);
    }

    @Test
    void gap_c4_anUnexpectedExceptionFromTheProviderBecomesA500_andNothingIsSaved() throws Exception {
        // documenta lacuna: sendCode() não captura exceções inesperadas (o WhatsappService real captura, mas não há timeout — ver WhatsappTimeoutAuditTest)
        Ctx c = ctx();
        Mockito.when(whatsappService.isAvailable(any())).thenReturn(true);
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenThrow(new IllegalStateException("provedor fora do ar"));

        book(c, "Cliente Azarado", uniquePhone(), "10:00", null, 500);

        assertThat(appointmentsOf(c.tenant)).isEmpty();
    }

    // ── C5. Transições de status ───────────────────────────────────────────────────────────────────

    @Test
    void c5_validTransitionsAreAccepted() throws Exception {
        Ctx c = ctx();
        Client client = fixtures.client(c.tenant);
        String token = adminToken(c.tenant);

        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.PENDING);
        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());
        patchStatus(token, a.getId(), "completed").andExpect(status().isOk());

        Appointment b = appt(c, client, date, "11:00", "11:30", AppointmentStatus.PENDING);
        patchStatus(token, b.getId(), "cancelled").andExpect(status().isOk());

        Appointment d = appt(c, client, date, "12:00", "12:30", AppointmentStatus.CONFIRMED);
        patchStatus(token, d.getId(), "no_show").andExpect(status().isOk());
        patchStatus(token, d.getId(), "cancelled").andExpect(status().isOk());
        assertThat(reload(d).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
    }

    @Test
    void c5_invalidTransitionsAreRejectedWith409_andNothingChanges() throws Exception {
        Ctx c = ctx();
        Client client = fixtures.client(c.tenant);
        String token = adminToken(c.tenant);

        Appointment confirmed = appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);
        patchStatus(token, confirmed.getId(), "confirmed").andExpect(status().isConflict()); // aprovar 2x
        patchStatus(token, confirmed.getId(), "pending").andExpect(status().isConflict());   // voltar para pendente

        Appointment cancelled = appt(c, client, date, "11:00", "11:30", AppointmentStatus.CANCELLED);
        for (String next : new String[]{"confirmed", "completed", "no_show", "pending", "cancelled"}) {
            patchStatus(token, cancelled.getId(), next).andExpect(status().isConflict()); // concluir/reabrir cancelado
        }

        Appointment completed = appt(c, client, date, "12:00", "12:30", AppointmentStatus.COMPLETED);
        for (String next : new String[]{"confirmed", "cancelled", "no_show", "pending"}) {
            patchStatus(token, completed.getId(), next).andExpect(status().isConflict()); // reabrir concluído
        }

        assertThat(reload(confirmed).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(reload(cancelled).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(reload(completed).getStatus()).isEqualTo(AppointmentStatus.COMPLETED);
        patchStatus(token, cancelled.getId(), "confirmed").andExpect(jsonPath("$.code").value("INVALID_STATUS_TRANSITION"));
    }

    @Test
    void c5_aCancelledAppointmentCannotBeReopened_soTheSlotIsNeverDoubleBooked() throws Exception {
        Ctx c = ctx();
        Client first = fixtures.client(c.tenant);
        Appointment cancelled = appt(c, first, date, "10:00", "10:30", AppointmentStatus.CANCELLED);
        book(c, "Quem Pegou o Horario", uniquePhone(), "10:00", null, 200); // o horário liberado foi ocupado

        patchStatus(adminToken(c.tenant), cancelled.getId(), "confirmed").andExpect(status().isConflict());

        long active = appointmentsOf(c.tenant).stream()
                .filter(x -> x.getDate().equals(date) && x.getStartTime().equals("10:00") && x.getStatus() != AppointmentStatus.CANCELLED).count();
        assertThat(active).isEqualTo(1);
    }

    // ── C6. Isolamento entre estabelecimentos ──────────────────────────────────────────────────────

    @Test
    void c6_anAdminCannotTouchAnotherTenantsAppointmentsClientsOrCatalog() throws Exception {
        Ctx a = ctx();
        Ctx b = ctx();
        Client clientA = fixtures.client(a.tenant);
        Appointment apptA = appt(a, clientA, date, "10:00", "10:30", AppointmentStatus.PENDING);
        String tokenB = adminToken(b.tenant);

        patchStatus(tokenB, apptA.getId(), "confirmed").andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/admin/appointments/" + apptA.getId()).header("Authorization", bearer(tokenB))).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/admin/clients/" + clientA.getId()).header("Authorization", bearer(tokenB))).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/admin/appointments").param("professionalId", a.professional.getId().toString())
                .header("Authorization", bearer(tokenB))).andExpect(status().isNotFound());
        // criar usando serviço/profissional/cliente do outro estabelecimento
        mockMvc.perform(post("/api/admin/appointments").header("Authorization", bearer(tokenB)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"clientId":"%s","professionalId":"%s","serviceId":"%s","date":"%s","startTime":"12:00"}
                                """.formatted(clientA.getId(), a.professional.getId(), a.service.getId(), date)))
                .andExpect(status().isNotFound());

        assertThat(reload(apptA).getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(appointmentRepository.existsById(apptA.getId())).isTrue();
    }

    @Test
    void c6_publicCancelAndRescheduleNeverCrossTenantsOrClients() throws Exception {
        Ctx a = ctx();
        Ctx b = ctx();
        Client owner = clientWithPhone(a.tenant, uniquePhone());
        Client stranger = clientWithPhone(a.tenant, uniquePhone());
        Appointment apptA = appt(a, owner, LocalDate.now(SP).plusDays(2).toString(), "10:00", "10:30", AppointmentStatus.CONFIRMED);

        // mesmo estabelecimento, outro cliente
        mockMvc.perform(patch("/api/public/" + a.tenant.getSlug() + "/appointments/" + apptA.getId() + "/cancel")
                .contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + stranger.getId() + "\"}")).andExpect(status().isNotFound());
        // slug de outro estabelecimento
        mockMvc.perform(patch("/api/public/" + b.tenant.getSlug() + "/appointments/" + apptA.getId() + "/cancel")
                .contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + owner.getId() + "\"}")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/public/" + b.tenant.getSlug() + "/my-appointments").param("clientId", owner.getId().toString()))
                .andExpect(status().isNotFound());
        assertThat(reload(apptA).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
    }

    // ── C7. Dados do cliente expostos sem autenticação ─────────────────────────────────────────────

    @Test
    void gap_c7_myAppointmentsNeedsOnlyTheClientUuid_noAuthentication() throws Exception {
        // documenta lacuna: o UUID ainda é a única credencial desses endpoints (endurecer com token — backlog).
        // O id não vaza mais pelo /book (teste c7_pendingFlowDoesNotRevealAnExistingClient), então só o próprio cliente o conhece.
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        appt(c, client, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        JsonNode list = json.readTree(mockMvc.perform(get("/api/public/" + c.tenant.getSlug() + "/my-appointments").param("clientId", client.getId().toString()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");

        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("client").get("phone").asText()).isEqualTo(client.getPhone());
        assertThat(list.get(0).get("client").get("email").asText()).isEqualTo(client.getEmail());
    }

    @Test
    void c7_pendingFlowDoesNotRevealAnExistingClient() throws Exception {
        // Sem WhatsApp (fluxo pendente) o /book não prova posse do celular: a resposta só pode conter o que o próprio
        // solicitante digitou. Antes devolvia o id e o nome reais do dono do celular (e com o id dava para ler e cancelar a agenda).
        Ctx c = ctx();
        String victimPhone = uniquePhone();
        Client victim = clientWithPhone(c.tenant, victimPhone);
        victim.setName("Maria Vitima");
        clientRepository.save(victim);
        Appointment victimAppt = appt(c, victim, date, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        JsonNode res = book(c, "Atacante", victimPhone, "15:00", null, 200).get("data");

        assertThat(res.get("kind").asText()).isEqualTo("pending_confirmation");
        assertThat(res.get("client").get("id").isNull()).isTrue();
        assertThat(res.get("client").get("phone").isNull()).isTrue();
        assertThat(res.get("client").get("name").asText()).isEqualTo("Atacante");
        assertThat(res.toString()).doesNotContain(victim.getId().toString()).doesNotContain("Maria Vitima");

        // O cadastro da vítima não foi alterado e a agenda dela segue intacta.
        assertThat(clientRepository.findById(victim.getId()).orElseThrow().getName()).isEqualTo("Maria Vitima");
        assertThat(reload(victimAppt).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
    }

    @Test
    void c7_pendingFlowForANewPhoneAlsoReturnsNoClientId() throws Exception {
        Ctx c = ctx();

        JsonNode res = book(c, "Cliente Novo", uniquePhone(), "15:00", null, 200).get("data");

        assertThat(res.get("kind").asText()).isEqualTo("pending_confirmation");
        assertThat(res.get("client").get("id").isNull()).isTrue();
        assertThat(res.get("client").get("name").asText()).isEqualTo("Cliente Novo");
    }

    @Test
    void c7_withWhatsappTheResponseDoesNotLeakTheClient() throws Exception {
        Ctx c = ctx();
        String victimPhone = uniquePhone();
        Client victim = clientWithPhone(c.tenant, victimPhone);
        whatsappOn();

        JsonNode res = book(c, "Atacante", victimPhone, "15:00", null, 200).get("data");

        assertThat(res.get("kind").asText()).isEqualTo("challenge_required");
        assertThat(res.has("client") && !res.get("client").isNull()).isFalse();
        assertThat(res.toString()).doesNotContain(victim.getId().toString());
    }

    // ── C8. Permissões ─────────────────────────────────────────────────────────────────────────────

    @Test
    void c8_professionalActsOnlyOnTheirOwnAppointments() throws Exception {
        Ctx c = ctx();
        Professional colleague = fixtures.professional(c.tenant);
        Client client = fixtures.client(c.tenant);
        Appointment mine = appt(c, client, date, "10:00", "10:30", AppointmentStatus.PENDING);
        Appointment theirs = fixtures.appointment(c.tenant, colleague, client, c.service, date, "10:00", "10:30");
        String token = professionalToken(c.tenant, c.professional);

        mockMvc.perform(patch("/api/professional/appointments/" + theirs.getId() + "/status").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"confirmed\"}")).andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/professional/appointments/" + mine.getId() + "/status").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"confirmed\"}")).andExpect(status().isOk());

        JsonNode list = json.readTree(mockMvc.perform(get("/api/professional/appointments").param("date", date).header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        assertThat(list).extracting(n -> n.get("id").asText()).containsExactly(mine.getId().toString());

        mockMvc.perform(post("/api/professional/appointments").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"clientId":"%s","professionalId":"%s","serviceId":"%s","date":"%s","startTime":"15:00"}
                        """.formatted(client.getId(), colleague.getId(), c.service.getId(), date))).andExpect(status().isForbidden());

        assertThat(reload(theirs).getStatus()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(reload(mine).getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
    }

    @Test
    void c8_withoutTokenOrWithTheWrongRoleThePanelIsClosed() throws Exception {
        Ctx c = ctx();
        Client client = fixtures.client(c.tenant);
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.PENDING);

        mockMvc.perform(get("/api/admin/appointments")).andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/api/admin/appointments/" + a.getId() + "/status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"confirmed\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/professional/appointments")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/dashboard/summary")).andExpect(status().isUnauthorized());

        String profToken = professionalToken(c.tenant, c.professional);
        mockMvc.perform(patch("/api/admin/appointments/" + a.getId() + "/status").header("Authorization", bearer(profToken))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"confirmed\"}")).andExpect(status().isForbidden());
        assertThat(reload(a).getStatus()).isEqualTo(AppointmentStatus.PENDING);
    }

    // ── C9. Abuso e limites ────────────────────────────────────────────────────────────────────────

    @Test
    void c9_aPhoneCannotHoldMoreThanThreePendingSlots() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();
        for (String time : new String[]{"09:00", "10:00", "11:00"}) book(c, "Acaparador", phone, time, null, 200);

        assertThat(book(c, "Acaparador", phone, "12:00", null, 429).get("code").asText()).isEqualTo("TOO_MANY_PENDING");
    }

    @Test
    void c9_inputValidationOnThePublicBooking() throws Exception {
        Ctx c = ctx();
        String phone = uniquePhone();
        String svc = c.service.getId().toString();
        java.util.function.Function<String, ResultActions> post = body -> {
            try {
                return mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book").contentType(MediaType.APPLICATION_JSON).content(body));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        };

        assertThat(body(post.apply(bookBody(c, "Nome", "123", date, "10:00")).andExpect(status().isBadRequest())).get("code").asText()).isEqualTo("INVALID_PHONE");
        post.apply(bookBody(c, "A", phone, date, "10:00")).andExpect(status().is4xxClientError());                       // nome curto
        post.apply(bookBody(c, "Nome", phone, "2026-13-45", "10:00")).andExpect(status().isBadRequest());                 // data impossível
        post.apply(bookBody(c, "Nome", phone, "26-1-1", "10:00")).andExpect(status().is4xxClientError());                 // formato
        post.apply("{\"name\":\"Nome\",\"phone\":\"" + phone + "\",\"serviceIds\":[],\"date\":\"" + date + "\",\"startTime\":\"10:00\"}")
                .andExpect(status().is4xxClientError());                                                                   // sem serviço
        post.apply("{\"name\":\"Nome\",\"phone\":\"" + phone + "\",\"serviceIds\":[\"x\"],\"date\":\"" + date + "\",\"startTime\":\"10:00\"}")
                .andExpect(status().isBadRequest());                                                                       // serviço inválido
        post.apply("{\"name\":\"Nome\",\"phone\":\"" + phone + "\",\"serviceIds\":[\"" + svc + "\",\"" + svc + "\"],\"date\":\"" + date + "\",\"startTime\":\"10:00\"}")
                .andExpect(status().isBadRequest());                                                                       // serviço repetido
        post.apply("{\"name\":\"Nome\",\"phone\":\"" + phone + "\",\"serviceIds\":[\"" + UUID.randomUUID() + "\"],\"date\":\"" + date + "\",\"startTime\":\"10:00\"}")
                .andExpect(status().is4xxClientError());                                                                   // serviço de outro lugar
        post.apply(bookBody(c, "Nome", phone, date, "25:99")).andExpect(status().isConflict());                           // horário impossível
        post.apply("{\"name\":\"Nome\",\"phone\":\"" + phone + "\",\"serviceIds\":[\"" + svc + "\"],\"date\":\"" + date + "\",\"startTime\":\"10:00\",\"notes\":\""
                + "x".repeat(501) + "\"}").andExpect(status().is4xxClientError());                                         // observação grande

        assertThat(appointmentsOf(c.tenant)).isEmpty();
    }

    // ── C10. Telefone do estabelecimento ───────────────────────────────────────────────────────────

    @Test
    void gap_c10_tenantPhoneIsNotValidatedAsAWhatsappNumber() throws Exception {
        // documenta lacuna: o telefone do admin/estabelecimento aceita qualquer texto (só limita o tamanho) — não é E.164 nem checado
        Ctx c = ctx();
        mockMvc.perform(patch("/api/admin/settings").header("Authorization", bearer(adminToken(c.tenant)))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"não é telefone\"}"))
                .andExpect(status().isOk());
    }
}

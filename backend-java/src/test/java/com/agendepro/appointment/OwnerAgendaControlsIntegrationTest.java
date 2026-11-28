package com.agendepro.appointment;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.notification.NotificationOutbox;
import com.agendepro.notification.NotificationOutboxRepository;
import com.agendepro.professional.Professional;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** O dono muda o horário de um agendamento, define o intervalo de almoço e não apaga sem querer o que ainda vai acontecer. */
class OwnerAgendaControlsIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authHelper;
    @Autowired private AppointmentRepository appointmentRepository;
    @Autowired private ClientRepository clientRepository;
    @Autowired private NotificationOutboxRepository outbox;

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");
    private final String day = LocalDate.now(SP).plusDays(3).toString();

    private record Ctx(Tenant tenant, String token, Professional prof, ServiceOffering service, Client client) {}

    private Ctx ctx() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        fixtures.admin(t, "dono-" + t.getSlug() + "@example.com", "senha123");
        String token = authHelper.login(mockMvc, "dono-" + t.getSlug() + "@example.com", "senha123");
        Client c = fixtures.client(t);
        c.setPhone("(11) 99999-" + (1000 + (int) (Math.random() * 8999)));
        clientRepository.save(c);
        return new Ctx(t, token, fixtures.professional(t), fixtures.service(t, 40, 30), c);
    }

    private ResultActions move(Ctx c, Appointment a, String date, String start) throws Exception {
        return mockMvc.perform(patch("/api/admin/appointments/" + a.getId())
                .header("Authorization", "Bearer " + c.token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"date\":\"" + date + "\",\"startTime\":\"" + start + "\"}"));
    }

    @Test
    void theOwnerMovesAnAppointmentAndTheClientIsTold() throws Exception {
        Ctx c = ctx();
        Appointment a = fixtures.appointment(c.tenant, c.prof, c.client, c.service, day, "10:00", "10:30");
        a.setStatus(AppointmentStatus.CONFIRMED);
        a.setReminder24hSentAt(java.time.Instant.now());
        appointmentRepository.save(a);

        move(c, a, day, "14:00").andExpect(status().isOk());

        Appointment moved = appointmentRepository.findById(a.getId()).orElseThrow();
        assertThat(moved.getStartTime()).isEqualTo("14:00");
        assertThat(moved.getEndTime()).isEqualTo("14:30");
        assertThat(moved.getStatus()).isEqualTo(AppointmentStatus.CONFIRMED); // o dono decidiu: não volta a pendente
        assertThat(moved.getReminder24hSentAt()).isNull(); // lembretes recomeçam para o novo horário
        List<NotificationOutbox> rows = outbox.findByTenantIdOrderByCreatedAtAsc(c.tenant.getId()).stream()
                .filter(n -> n.getEvent().equals("CLIENT_MOVED_BY_OWNER")).toList();
        assertThat(rows).isNotEmpty();
        assertThat(rows.get(0).getBody()).contains("14:00");
    }

    @Test
    void movingIntoAnotherAppointmentOrThePastOrTheSameSlotIsRefused() throws Exception {
        Ctx c = ctx();
        Appointment a = fixtures.appointment(c.tenant, c.prof, c.client, c.service, day, "10:00", "10:30");
        fixtures.appointment(c.tenant, c.prof, fixtures.client(c.tenant), c.service, day, "15:00", "15:30");

        move(c, a, day, "15:15").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SCHEDULE_CONFLICT"));
        move(c, a, day, "10:00").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SAME_SLOT"));
        move(c, a, LocalDate.now(SP).minusDays(1).toString(), "10:00").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_DATE"));
        move(c, a, day, "10:15").andExpect(status().isOk()); // o próprio horário não conta como conflito
    }

    @Test
    void aCancelledAppointmentCannotBeMoved() throws Exception {
        Ctx c = ctx();
        Appointment a = fixtures.appointment(c.tenant, c.prof, c.client, c.service, day, "10:00", "10:30");
        a.setStatus(AppointmentStatus.CANCELLED);
        appointmentRepository.save(a);

        move(c, a, day, "11:00").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVALID_STATUS_TRANSITION"));
    }

    @Test
    void completedAndNoShowOnlyAfterTheAppointmentStarted() throws Exception {
        Ctx c = ctx();
        Appointment future = fixtures.appointment(c.tenant, c.prof, c.client, c.service, day, "10:00", "10:30");
        future.setStatus(AppointmentStatus.CONFIRMED);
        appointmentRepository.save(future);

        for (String s : new String[]{"completed", "no_show"}) {
            mockMvc.perform(patch("/api/admin/appointments/" + future.getId() + "/status")
                            .header("Authorization", "Bearer " + c.token).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"" + s + "\"}"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("NOT_STARTED_YET"));
        }

        Appointment past = fixtures.appointment(c.tenant, c.prof, c.client, c.service, LocalDate.now(SP).minusDays(1).toString(), "10:00", "10:30");
        past.setStatus(AppointmentStatus.CONFIRMED);
        appointmentRepository.save(past);
        mockMvc.perform(patch("/api/admin/appointments/" + past.getId() + "/status")
                        .header("Authorization", "Bearer " + c.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"completed\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void theLunchBreakIsNotOfferedToClients() throws Exception {
        Ctx c = ctx();
        mockMvc.perform(patch("/api/admin/professionals/" + c.prof.getId())
                        .header("Authorization", "Bearer " + c.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"breakStart\":\"12:00\",\"breakEnd\":\"13:00\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.breakStart").value("12:00"));

        String body = mockMvc.perform(get("/api/public/" + c.tenant.getSlug() + "/availability")
                        .param("professionalId", c.prof.getId().toString()).param("serviceId", c.service.getId().toString())
                        .param("date", day))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(body).contains("\"11:30\"").contains("\"13:00\"")
                .doesNotContain("\"12:00\"").doesNotContain("\"12:15\"").doesNotContain("\"12:45\"").doesNotContain("\"11:45\"");
    }

    @Test
    void anInvalidBreakIsRejectedAndEmptyRemovesIt() throws Exception {
        Ctx c = ctx();
        String url = "/api/admin/professionals/" + c.prof.getId();
        mockMvc.perform(patch(url).header("Authorization", "Bearer " + c.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"breakStart\":\"13:00\",\"breakEnd\":\"12:00\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_BREAK"));
        mockMvc.perform(patch(url).header("Authorization", "Bearer " + c.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"breakStart\":\"06:00\",\"breakEnd\":\"07:00\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_BREAK"));
        mockMvc.perform(patch(url).header("Authorization", "Bearer " + c.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"breakStart\":\"12:00\",\"breakEnd\":\"13:00\"}")).andExpect(status().isOk());
        mockMvc.perform(patch(url).header("Authorization", "Bearer " + c.token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"breakStart\":\"\",\"breakEnd\":\"\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.breakStart").doesNotExist());
    }

    @Test
    void deletingSomethingWithUpcomingAppointmentsIsBlockedUntilTheyAreGone() throws Exception {
        Ctx c = ctx();
        Appointment a = fixtures.appointment(c.tenant, c.prof, c.client, c.service, day, "10:00", "10:30");

        mockMvc.perform(delete("/api/admin/professionals/" + c.prof.getId()).header("Authorization", "Bearer " + c.token))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("HAS_UPCOMING_APPOINTMENTS"));
        mockMvc.perform(delete("/api/admin/services/" + c.service.getId()).header("Authorization", "Bearer " + c.token))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("HAS_UPCOMING_APPOINTMENTS"));
        mockMvc.perform(delete("/api/admin/clients/" + c.client.getId()).header("Authorization", "Bearer " + c.token))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("HAS_UPCOMING_APPOINTMENTS"));

        a.setStatus(AppointmentStatus.CANCELLED);
        appointmentRepository.save(a);
        mockMvc.perform(delete("/api/admin/clients/" + c.client.getId()).header("Authorization", "Bearer " + c.token))
                .andExpect(status().is2xxSuccessful());
    }
}

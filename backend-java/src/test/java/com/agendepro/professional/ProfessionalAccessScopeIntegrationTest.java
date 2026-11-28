package com.agendepro.professional;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.appointment.Appointment;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * O papel PROFESSIONAL enxerga apenas a própria carteira: clientes que atendeu, a própria agenda,
 * nada de colegas, nada de /api/admin/** e nada de outro tenant (mesmo trocando IDs na URL/corpo).
 */
class ProfessionalAccessScopeIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authHelper;

    private final String date = LocalDate.now().plusDays(2).toString();

    private String profToken(Tenant t, Professional p) throws Exception {
        String email = "prof-" + UUID.randomUUID() + "@example.com";
        fixtures.professionalUser(t, p, email, "senha123");
        return authHelper.login(mockMvc, email, "senha123");
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    @Test
    void professionalListsOnlyClientsWithAppointmentsWithThem() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional colleague = fixtures.professional(t);
        ServiceOffering svc = fixtures.service(t, 50.0, 30);
        Client mineClient = fixtures.client(t);
        Client colleagueClient = fixtures.client(t);
        Client noAppointmentClient = fixtures.client(t);
        fixtures.appointment(t, mine, mineClient, svc, date, "09:00", "09:30");
        fixtures.appointment(t, colleague, colleagueClient, svc, date, "09:00", "09:30");
        String token = profToken(t, mine);

        mockMvc.perform(get("/api/professional/clients").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id").value(mineClient.getId().toString()))
                .andExpect(content().string(not(containsString(colleagueClient.getEmail()))))
                .andExpect(content().string(not(containsString(noAppointmentClient.getEmail()))));
    }

    @Test
    void clientsAreNotLeakedAcrossTenants() throws Exception {
        Tenant a = fixtures.tenant(TenantPlan.PRO);
        Tenant b = fixtures.tenant(TenantPlan.PRO);
        Professional profA = fixtures.professional(a);
        Professional profB = fixtures.professional(b);
        ServiceOffering svcB = fixtures.service(b, 50.0, 30);
        Client clientB = fixtures.client(b);
        fixtures.appointment(b, profB, clientB, svcB, date, "09:00", "09:30");
        String tokenA = profToken(a, profA);

        mockMvc.perform(get("/api/professional/clients").header("Authorization", bearer(tokenA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void professionalListShowsOnlyThemselvesNotColleagues() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional colleague = fixtures.professional(t);
        String token = profToken(t, mine);

        mockMvc.perform(get("/api/professional/professionals").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id").value(mine.getId().toString()))
                .andExpect(content().string(not(containsString(colleague.getId().toString()))));
    }

    @Test
    void professionalCannotReachAdminEndpoints() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional colleague = fixtures.professional(t);
        Client client = fixtures.client(t);
        String token = profToken(t, mine);

        mockMvc.perform(get("/api/admin/professionals").header("Authorization", bearer(token))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/professionals/" + colleague.getId()).header("Authorization", bearer(token))).andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/admin/professionals/" + colleague.getId()).header("Authorization", bearer(token))).andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/admin/professionals/" + mine.getId()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"X\"}").header("Authorization", bearer(token))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/clients").header("Authorization", bearer(token))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/clients/" + client.getId()).header("Authorization", bearer(token))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/appointments").header("Authorization", bearer(token))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/super/tenants").header("Authorization", bearer(token))).andExpect(status().isForbidden());
    }

    @Test
    void professionalSeesOnlyOwnAppointmentsEvenAskingForAColleague() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional colleague = fixtures.professional(t);
        ServiceOffering svc = fixtures.service(t, 50.0, 30);
        Appointment own = fixtures.appointment(t, mine, fixtures.client(t), svc, date, "09:00", "09:30");
        fixtures.appointment(t, colleague, fixtures.client(t), svc, date, "10:00", "10:30");
        String token = profToken(t, mine);

        mockMvc.perform(get("/api/professional/appointments").param("professionalId", colleague.getId().toString())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id").value(own.getId().toString()));
    }

    @Test
    void professionalCannotChangeStatusOfColleaguesOrOtherTenantsAppointment() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Tenant other = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional colleague = fixtures.professional(t);
        Professional otherTenantProf = fixtures.professional(other);
        ServiceOffering svc = fixtures.service(t, 50.0, 30);
        ServiceOffering otherSvc = fixtures.service(other, 50.0, 30);
        Appointment colleagueApt = fixtures.appointment(t, colleague, fixtures.client(t), svc, date, "10:00", "10:30");
        Appointment otherTenantApt = fixtures.appointment(other, otherTenantProf, fixtures.client(other), otherSvc, date, "10:00", "10:30");
        Appointment ownApt = fixtures.appointment(t, mine, fixtures.client(t), svc, date, "11:00", "11:30");
        String token = profToken(t, mine);

        mockMvc.perform(patch("/api/professional/appointments/" + colleagueApt.getId() + "/status")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"cancelled\"}")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isForbidden());
        // Outro tenant: 404, indistinguível de ID inexistente
        mockMvc.perform(patch("/api/professional/appointments/" + otherTenantApt.getId() + "/status")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"cancelled\"}")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/professional/appointments/" + ownApt.getId() + "/status")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"confirmed\"}")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk());
    }

    @Test
    void professionalCannotCreateAppointmentForColleagueOrWithColleaguesClient() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional colleague = fixtures.professional(t);
        ServiceOffering svc = fixtures.service(t, 50.0, 30);
        Client colleagueClient = fixtures.client(t);
        fixtures.appointment(t, colleague, colleagueClient, svc, date, "09:00", "09:30");
        String token = profToken(t, mine);

        String forColleague = """
                {"professionalId":"%s","serviceId":"%s","date":"%s","startTime":"14:00",
                 "clientName":"Novo Cliente","clientPhone":"(11) 98765-4321","clientEmail":"novo-%s@example.com"}
                """.formatted(colleague.getId(), svc.getId(), date, UUID.randomUUID());
        mockMvc.perform(post("/api/professional/appointments").contentType(MediaType.APPLICATION_JSON)
                        .content(forColleague).header("Authorization", bearer(token)))
                .andExpect(status().isForbidden());

        String withForeignClient = """
                {"professionalId":"%s","serviceId":"%s","date":"%s","startTime":"14:00","clientId":"%s"}
                """.formatted(mine.getId(), svc.getId(), date, colleagueClient.getId());
        mockMvc.perform(post("/api/professional/appointments").contentType(MediaType.APPLICATION_JSON)
                        .content(withForeignClient).header("Authorization", bearer(token)))
                .andExpect(status().isNotFound())
                .andExpect(content().string(not(containsString(colleagueClient.getEmail()))));

        String own = """
                {"professionalId":"%s","serviceId":"%s","date":"%s","startTime":"14:00",
                 "clientName":"Cliente Proprio","clientPhone":"(11) 98765-4321","clientEmail":"proprio-%s@example.com"}
                """.formatted(mine.getId(), svc.getId(), date, UUID.randomUUID());
        mockMvc.perform(post("/api/professional/appointments").contentType(MediaType.APPLICATION_JSON)
                        .content(own).header("Authorization", bearer(token)))
                .andExpect(status().isCreated());
    }

    @Test
    void professionalCannotBookWithAnotherTenantsProfessionalOrService() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Tenant other = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional otherProf = fixtures.professional(other);
        ServiceOffering otherSvc = fixtures.service(other, 50.0, 30);
        ServiceOffering mySvc = fixtures.service(t, 50.0, 30);
        String token = profToken(t, mine);

        String otherProfBody = """
                {"professionalId":"%s","serviceId":"%s","date":"%s","startTime":"15:00",
                 "clientName":"Fulano","clientPhone":"(11) 98765-4321","clientEmail":"fulano-%s@example.com"}
                """.formatted(otherProf.getId(), mySvc.getId(), date, UUID.randomUUID());
        mockMvc.perform(post("/api/professional/appointments").contentType(MediaType.APPLICATION_JSON)
                        .content(otherProfBody).header("Authorization", bearer(token)))
                .andExpect(status().isForbidden());

        String otherSvcBody = """
                {"professionalId":"%s","serviceId":"%s","date":"%s","startTime":"15:00",
                 "clientName":"Fulano","clientPhone":"(11) 98765-4321","clientEmail":"fulano-%s@example.com"}
                """.formatted(mine.getId(), otherSvc.getId(), date, UUID.randomUUID());
        mockMvc.perform(post("/api/professional/appointments").contentType(MediaType.APPLICATION_JSON)
                        .content(otherSvcBody).header("Authorization", bearer(token)))
                .andExpect(status().isNotFound());
    }

    @Test
    void professionalCannotReachOtherTenantsResourcesByIdInUrl() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Tenant other = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional otherProf = fixtures.professional(other);
        ServiceOffering otherSvc = fixtures.service(other, 50.0, 30);
        String token = profToken(t, mine);

        mockMvc.perform(get("/api/professional/me").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(mine.getId().toString()));
        mockMvc.perform(patch("/api/professional/services/" + otherSvc.getId()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Hack\"}").header("Authorization", bearer(token)))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/professional/blocked-slots/" + UUID.randomUUID()).header("Authorization", bearer(token)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/professional/appointments").param("professionalId", otherProf.getId().toString())
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(0)));
    }
}

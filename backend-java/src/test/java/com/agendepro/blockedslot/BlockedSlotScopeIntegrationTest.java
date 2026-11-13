package com.agendepro.blockedslot;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.professional.Professional;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A Agenda serve admin e profissional: o profissional só enxerga e gerencia os bloqueios da própria agenda. */
class BlockedSlotScopeIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authTestHelper;

    private String profToken(Tenant t, Professional p) throws Exception {
        String email = "prof-" + UUID.randomUUID() + "@example.com";
        fixtures.professionalUser(t, p, email, "senha123");
        return authTestHelper.login(mockMvc, email, "senha123");
    }

    private String adminToken(Tenant t) throws Exception {
        String email = "admin-" + UUID.randomUUID() + "@example.com";
        fixtures.admin(t, email, "senha123");
        return authTestHelper.login(mockMvc, email, "senha123");
    }

    private String body(Professional p, String date) {
        return """
                {"professionalId":"%s","date":"%s","startTime":"12:00","endTime":"13:00","reason":"Almoço"}
                """.formatted(p.getId(), date);
    }

    @Test
    void professionalListsOnlyOwnBlocksEvenWhenAskingForAnotherProfessional() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional other = fixtures.professional(t);
        fixtures.blockedSlot(t, mine, "2026-11-20", "09:00", "10:00");
        fixtures.blockedSlot(t, other, "2026-11-20", "11:00", "12:00");
        String token = profToken(t, mine);

        mockMvc.perform(get("/api/professional/blocked-slots").param("startDate", "2026-11-01").param("endDate", "2026-11-30")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].professionalId").value(mine.getId().toString()));
        mockMvc.perform(get("/api/professional/blocked-slots").param("professionalId", other.getId().toString())
                        .param("startDate", "2026-11-01").param("endDate", "2026-11-30")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].professionalId").value(mine.getId().toString()));
    }

    @Test
    void professionalCreatesOwnBlockButNotForAnotherProfessional() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional other = fixtures.professional(t);
        String token = profToken(t, mine);

        mockMvc.perform(post("/api/professional/blocked-slots").contentType(MediaType.APPLICATION_JSON)
                        .content(body(mine, "2026-11-21")).header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/professional/blocked-slots").contentType(MediaType.APPLICATION_JSON)
                        .content(body(other, "2026-11-21")).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void professionalDeletesOwnBlockButAnotherProfessionalsBlockIsNotFound() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional mine = fixtures.professional(t);
        Professional other = fixtures.professional(t);
        var own = fixtures.blockedSlot(t, mine, "2026-11-22", "09:00", "10:00");
        var foreign = fixtures.blockedSlot(t, other, "2026-11-22", "09:00", "10:00");
        String token = profToken(t, mine);

        mockMvc.perform(delete("/api/professional/blocked-slots/" + foreign.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/professional/blocked-slots/" + own.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
    }

    @Test
    void adminSeesAllBlocksOfItsTenantOnlyAndAnonymousIsRejected() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Tenant outro = fixtures.tenant(TenantPlan.PRO);
        fixtures.blockedSlot(t, fixtures.professional(t), "2026-11-23", "09:00", "10:00");
        fixtures.blockedSlot(t, fixtures.professional(t), "2026-11-23", "10:00", "11:00");
        fixtures.blockedSlot(outro, fixtures.professional(outro), "2026-11-23", "09:00", "10:00");
        String token = adminToken(t);

        mockMvc.perform(get("/api/admin/blocked-slots").param("startDate", "2026-11-01").param("endDate", "2026-11-30")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(2)));
        mockMvc.perform(get("/api/professional/blocked-slots").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/blocked-slots")).andExpect(status().is4xxClientError());
    }
}

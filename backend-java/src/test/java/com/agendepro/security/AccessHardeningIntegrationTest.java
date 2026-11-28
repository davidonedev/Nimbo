package com.agendepro.security;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import com.agendepro.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Acesso só por convite do dono: ninguém cria login de profissional sozinho e removê-lo tira o acesso. */
class AccessHardeningIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authHelper;
    @Autowired private UserRepository userRepository;
    @Autowired private ObjectMapper mapper;

    @Test
    void anonymousCannotCreateAProfessionalLogin() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        String email = "intruso-" + t.getSlug() + "@example.com";

        mockMvc.perform(post("/api/public/" + t.getSlug() + "/register/professional")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Intruso\",\"email\":\"" + email + "\",\"password\":\"senha123\",\"specialty\":\"Barbeiro\"}"))
                .andExpect(status().is4xxClientError());

        assertThat(userRepository.existsByEmail(email)).isFalse();
    }

    @Test
    void theDemoAccountListingIsGone() throws Exception {
        mockMvc.perform(get("/api/public/login-data")).andExpect(status().isNotFound());
    }

    @Test
    void removingAProfessionalRemovesTheirLoginAndSessions() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        fixtures.admin(t, "dono-" + t.getSlug() + "@example.com", "senha123");
        String ownerToken = authHelper.login(mockMvc, "dono-" + t.getSlug() + "@example.com", "senha123");
        String profEmail = "func-" + t.getSlug() + "@example.com";

        String created = mockMvc.perform(post("/api/admin/professionals")
                        .header("Authorization", "Bearer " + ownerToken).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Funcionario\",\"email\":\"" + profEmail + "\",\"password\":\"senha123\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode json = mapper.readTree(created);
        String professionalId = json.path("data").path("id").asText();
        String profToken = authHelper.login(mockMvc, profEmail, "senha123");
        mockMvc.perform(get("/api/professional/me").header("Authorization", "Bearer " + profToken)).andExpect(status().isOk());

        mockMvc.perform(delete("/api/admin/professionals/" + professionalId)
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().is2xxSuccessful());

        assertThat(userRepository.existsByEmail(profEmail)).isFalse();
        mockMvc.perform(get("/api/professional/me").header("Authorization", "Bearer " + profToken)).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + profEmail + "\",\"password\":\"senha123\"}"))
                .andExpect(status().isUnauthorized());
    }
}

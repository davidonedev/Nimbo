package com.agendepro.publicapi;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A mensagem do cadastro de cliente deve apontar o canal em que o link de verificação foi realmente enviado. */
class ClientRegistrationMessageIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private TestFixtures fixtures;

    @Test
    void phoneIsRequired_withoutItTheRegistrationIsRefused() throws Exception {
        Tenant tenant = fixtures.tenant(TenantPlan.BASIC);

        mockMvc.perform(post("/api/public/" + tenant.getSlug() + "/register/client")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("sem-telefone", null)))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(post("/api/public/" + tenant.getSlug() + "/register/client")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("vazio", "")))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void phoneWithoutAreaCodeOrTooShort_isRefusedAsInvalid() throws Exception {
        Tenant tenant = fixtures.tenant(TenantPlan.BASIC);

        mockMvc.perform(post("/api/public/" + tenant.getSlug() + "/register/client")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("curto", "99999-888")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PHONE"));
    }

    @Test
    void withPhoneTheMessagePointsToWhatsapp() throws Exception {
        Tenant tenant = fixtures.tenant(TenantPlan.BASIC);

        mockMvc.perform(post("/api/public/" + tenant.getSlug() + "/register/client")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("com-telefone", "11987654321")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.message").value("Cadastro iniciado. Verifique seu WhatsApp para ativar sua conta."));
    }

    private static String body(String prefix, String phone) {
        String unique = prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
        return "{\"name\":\"Cliente Teste\",\"email\":\"" + unique + "@example.com\",\"password\":\"Cliente#2026\""
                + (phone == null ? "" : ",\"phone\":\"" + phone + "\"") + "}";
    }
}

package com.agendepro.tenant;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Configurações do estabelecimento (PATCH /api/admin/settings): o que o painel salva precisa voltar igual no GET. */
class TenantSettingsIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authTestHelper;
    private final ObjectMapper json = new ObjectMapper();

    private String token() throws Exception {
        Tenant tenant = fixtures.tenant(TenantPlan.BASIC);
        String email = "cfg-" + UUID.randomUUID() + "@example.com";
        fixtures.admin(tenant, email, "senha123");
        return authTestHelper.login(mockMvc, email, "senha123");
    }

    private ResultActions patchSettings(String token, String body) throws Exception {
        return mockMvc.perform(patch("/api/admin/settings").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode me(String token) throws Exception {
        String body = mockMvc.perform(get("/api/admin/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("data");
    }

    /** Imagem em data URL do tamanho que o painel envia depois de redimensionar (algumas centenas de KB). */
    private static String dataUrl(int approxBytes) {
        return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(new byte[approxBytes]);
    }

    @Test
    void textAndColorFieldsAreSavedAndReturned() throws Exception {
        String token = token();
        patchSettings(token, """
                {"name":"Barbearia Nova","phone":"(11) 98888-7777","address":"Rua A, 10","primaryColor":"#C2410C","adminColor":"#1E1B4B","isOpen":false,"minAdvanceMinutes":90}
                """).andExpect(status().isOk());

        JsonNode t = me(token);
        assertThat(t.get("name").asText()).isEqualTo("Barbearia Nova");
        assertThat(t.get("phone").asText()).isEqualTo("(11) 98888-7777");
        assertThat(t.get("address").asText()).isEqualTo("Rua A, 10");
        assertThat(t.get("primaryColor").asText()).isEqualTo("#C2410C");
        assertThat(t.get("adminColor").asText()).isEqualTo("#1E1B4B");
        assertThat(t.get("isOpen").asBoolean()).isFalse();
        assertThat(t.get("minAdvanceMinutes").asInt()).isEqualTo(90);
    }

    @Test
    void logoAndBannerSentAsDataUrlAreSaved() throws Exception {
        String token = token();
        String logo = dataUrl(300_000);
        String banner = dataUrl(600_000);
        patchSettings(token, "{\"logoUrl\":\"" + logo + "\",\"bannerUrl\":\"" + banner + "\"}").andExpect(status().isOk());

        JsonNode t = me(token);
        assertThat(t.get("logoUrl").asText()).isEqualTo(logo);
        assertThat(t.get("bannerUrl").asText()).isEqualTo(banner);
    }

    @Test
    void emptyStringClearsOptionalFields() throws Exception {
        String token = token();
        patchSettings(token, "{\"logoUrl\":\"https://x.com/l.png\",\"bannerUrl\":\"https://x.com/b.png\",\"adminColor\":\"#112233\","
                + "\"whatsappApiUrl\":\"https://wa.example.com\",\"whatsappApiKey\":\"k\",\"whatsappInstance\":\"i\",\"whatsappTemplate\":\"oi\",\"phone\":\"(11) 90000-0000\"}")
                .andExpect(status().isOk());

        patchSettings(token, "{\"logoUrl\":\"\",\"bannerUrl\":\"\",\"adminColor\":\"\",\"whatsappApiUrl\":\"\",\"whatsappApiKey\":\"\","
                + "\"whatsappInstance\":\"\",\"whatsappTemplate\":\"\",\"phone\":\"\"}").andExpect(status().isOk());

        JsonNode t = me(token);
        for (String field : new String[]{"logoUrl", "bannerUrl", "adminColor", "whatsappApiUrl", "whatsappApiKey", "whatsappInstance", "whatsappTemplate", "phone"}) {
            assertThat(t.get(field).isNull()).as(field).isTrue();
        }
    }

    @Test
    void omittedFieldsAreLeftUntouched() throws Exception {
        String token = token();
        patchSettings(token, "{\"logoUrl\":\"https://x.com/l.png\",\"name\":\"Meu Nome\"}").andExpect(status().isOk());
        patchSettings(token, "{\"primaryColor\":\"#112233\"}").andExpect(status().isOk());

        JsonNode t = me(token);
        assertThat(t.get("logoUrl").asText()).isEqualTo("https://x.com/l.png");
        assertThat(t.get("name").asText()).isEqualTo("Meu Nome");
    }

    @Test
    void invalidValuesAreRejectedWithAClearMessage() throws Exception {
        String token = token();
        patchSettings(token, "{\"primaryColor\":\"azul\"}")
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        patchSettings(token, "{\"name\":\"A\"}").andExpect(status().isUnprocessableEntity());
        patchSettings(token, "{\"logoUrl\":\"javascript:alert(1)\"}").andExpect(status().isUnprocessableEntity());
        patchSettings(token, "{\"logoUrl\":\"" + dataUrl(3_000_000) + "\"}")
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }
}

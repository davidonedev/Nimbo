package com.agendepro.audit;

import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Trocar a foto do profissional: o painel envia a imagem como data URL (base64), que passa de 2000 caracteres. Antes a
 * coluna era VARCHAR(2000) e o servidor respondia "Registro duplicado" (409), sem relação com duplicidade.
 */
class FotoProfissionalTest extends AuditBase {

    @Autowired private JdbcTemplate jdbc;

    private static String dataUrl(int chars) {
        return "data:image/jpeg;base64," + "A".repeat(chars);
    }

    private String body(String photoUrl) {
        return "{\"photoUrl\":\"" + photoUrl + "\"}";
    }

    private MvcResult patchPhoto(String token, UUID id, String photoUrl) throws Exception {
        return mockMvc.perform(patch("/api/admin/professionals/" + id).header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(body(photoUrl))).andReturn();
    }

    @Test
    void trocarAFotoPorUmaImagemRealFunciona_eFicaSalva() throws Exception {
        Ctx c = ctx();
        String token = adminToken(c.tenant);
        String foto = dataUrl(60_000); // ~45 KB de arquivo: uma foto redimensionada normal

        MvcResult r = patchPhoto(token, c.professional.getId(), foto);

        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode data = json.readTree(r.getResponse().getContentAsString()).get("data");
        assertThat(data.get("photoUrl").asText()).isEqualTo(foto);
        assertThat(jdbc.queryForObject("SELECT length(photo_url) FROM professionals WHERE id = ?", Integer.class, c.professional.getId()))
                .isEqualTo(foto.length());
    }

    @Test
    void trocarDeNovoSubstituiAFotoAnterior() throws Exception {
        Ctx c = ctx();
        String token = adminToken(c.tenant);
        patchPhoto(token, c.professional.getId(), dataUrl(5_000));

        MvcResult r = patchPhoto(token, c.professional.getId(), dataUrl(8_000));

        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT length(photo_url) FROM professionals WHERE id = ?", Integer.class, c.professional.getId()))
                .isEqualTo(dataUrl(8_000).length());
    }

    @Test
    void criarProfissionalJaComFotoGrande() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        String token = adminToken(t);
        String payload = "{\"name\":\"Novo Barbeiro\",\"specialty\":\"Barbeiro\",\"photoUrl\":\"" + dataUrl(50_000) + "\","
                + "\"workingHoursStart\":\"09:00\",\"workingHoursEnd\":\"18:00\",\"workingDays\":[1,2,3,4,5],\"serviceIds\":[]}";

        mockMvc.perform(post("/api/admin/professionals").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isCreated());
    }

    @Test
    void fotoMaiorQueOLimiteViraErroDeValidacaoClaro_e_naoDuplicado() throws Exception {
        Ctx c = ctx();
        String token = adminToken(c.tenant);

        MvcResult r = patchPhoto(token, c.professional.getId(), dataUrl(2_000_100));

        assertThat(r.getResponse().getStatus()).isEqualTo(422); // validação de campo, como as demais do projeto
        String resposta = r.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(resposta).contains("A foto é grande demais");
        assertThat(resposta).doesNotContain("Registro duplicado");
    }

    @Test
    void textoMaiorQueAColunaNaoVira409Duplicado() throws Exception {
        // avatar ainda é VARCHAR(500): estourar a coluna deve dar 400 "tamanho permitido", não "Registro duplicado"
        Ctx c = ctx();
        String token = adminToken(c.tenant);

        MvcResult r = mockMvc.perform(patch("/api/admin/professionals/" + c.professional.getId()).header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"avatar\":\"" + "x".repeat(600) + "\"}")).andReturn();

        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        assertThat(r.getResponse().getContentAsString()).contains("VALUE_TOO_LONG");
    }
}

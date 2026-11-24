package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.client.Client;
import com.agendepro.notification.NotificationDispatcher;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Confirmação automática ao cliente: ao confirmar, a mensagem sai sozinha pelo WhatsApp do estabelecimento (sem o dono
 * abrir o WhatsApp), em segundos; e a tela consegue saber se saiu ou se precisa do link de reserva. Nada real é enviado.
 */
class ConfirmacaoAutomaticaTest extends AuditBase {

    @Autowired private TenantRepository tenantRepository;

    private List<JsonNode> statusItems(String base, String token, Appointment... appointments) throws Exception {
        var req = get(base + "/status");
        for (Appointment a : appointments) req = req.param("ids", a.getId().toString());
        String body = mockMvc.perform(req.header("Authorization", bearer(token))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        List<JsonNode> out = new ArrayList<>();
        json.readTree(body).get("data").forEach(out::add);
        return out;
    }

    private Appointment pending(Ctx c, Client client, String time, String end) {
        return appt(c, client, date, time, end, AppointmentStatus.PENDING);
    }

    // ── o que a tela consulta ──────────────────────────────────────────────────────────────────────

    @Test
    void depoisDeConfirmar_aTelaVeAFilaDoWhatsApp_comOMotivoQuandoNaoSai() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pending(c, client, "10:00", "10:30");
        String token = adminToken(c.tenant);

        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());
        List<JsonNode> queued = statusItems("/api/admin/notifications", token, a);
        assertThat(queued).filteredOn(n -> n.get("channel").asText().equals("WHATSAPP")).singleElement().satisfies(n -> {
            assertThat(n.get("event").asText()).isEqualTo("APPROVED");
            assertThat(n.get("status").asText()).isEqualTo("PENDING");
        });

        // sem WhatsApp configurado o envio é ignorado e o motivo chega à tela (que então oferece o link)
        notificationDispatcher.run(Instant.now());
        List<JsonNode> after = statusItems("/api/admin/notifications", token, a);
        assertThat(after).filteredOn(n -> n.get("channel").asText().equals("WHATSAPP")).singleElement().satisfies(n -> {
            assertThat(n.get("status").asText()).isEqualTo("SKIPPED");
            assertThat(n.get("error").asText()).isEqualTo("WhatsApp não configurado");
        });
    }

    @Test
    void comWhatsAppConfigurado_aMensagemSaiEFicaComoEnviada() throws Exception {
        Ctx c = ctx();
        whatsappOn();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pending(c, client, "10:00", "10:30");
        String token = adminToken(c.tenant);

        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());
        notificationDispatcher.run(Instant.now());

        assertThat(statusItems("/api/admin/notifications", token, a))
                .filteredOn(n -> n.get("channel").asText().equals("WHATSAPP")).singleElement()
                .satisfies(n -> assertThat(n.get("status").asText()).isEqualTo("SENT"));
        assertThat(whatsappTextsTo(client.getPhone())).singleElement().asString().contains("está confirmado");
    }

    @Test
    void oProfissionalVeSoOsAvisosDosAgendamentosDele() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment mine = pending(c, client, "10:00", "10:30");
        var other = professional(c.tenant, c.service, "08:00", "18:00", new Integer[]{0, 1, 2, 3, 4, 5, 6});
        Appointment colleagues = appt(new Ctx(c.tenant, other, c.service), client, date, "11:00", "11:30", AppointmentStatus.PENDING);
        String admin = adminToken(c.tenant);
        patchStatus(admin, mine.getId(), "confirmed").andExpect(status().isOk());
        patchStatus(admin, colleagues.getId(), "confirmed").andExpect(status().isOk());

        String profToken = professionalToken(c.tenant, c.professional);
        List<JsonNode> seen = statusItems("/api/professional/notifications", profToken, mine, colleagues);

        assertThat(seen).isNotEmpty().allSatisfy(n -> assertThat(n.get("appointmentId").asText()).isEqualTo(mine.getId().toString()));
    }

    @Test
    void naoVazaAvisosDeOutroEstabelecimento() throws Exception {
        Ctx mine = ctx();
        Ctx theirs = ctx();
        Client theirClient = clientWithPhone(theirs.tenant, uniquePhone());
        Appointment theirAppt = pending(theirs, theirClient, "10:00", "10:30");
        patchStatus(adminToken(theirs.tenant), theirAppt.getId(), "confirmed").andExpect(status().isOk());

        assertThat(statusItems("/api/admin/notifications", adminToken(mine.tenant), theirAppt)).isEmpty();
    }

    @Test
    void canais_dizSeOEnvioAutomaticoDoWhatsAppEstaDisponivel() throws Exception {
        Ctx c = ctx();
        String token = adminToken(c.tenant);

        String off = mockMvc.perform(get("/api/admin/notifications/channels").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(json.readTree(off).get("data").get("whatsappAuto").asBoolean()).isFalse();

        whatsappOn();
        String on = mockMvc.perform(get("/api/admin/notifications/channels").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(json.readTree(on).get("data").get("whatsappAuto").asBoolean()).isTrue();

        String prof = mockMvc.perform(get("/api/professional/notifications/channels").header("Authorization", bearer(professionalToken(c.tenant, c.professional))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(json.readTree(prof).get("data").get("whatsappAuto").asBoolean()).isTrue();
    }

    // ── envio imediato ─────────────────────────────────────────────────────────────────────────────

    @Test
    void confirmar_disparaOEnvioNaHora_semEsperarOAgendador() throws Exception {
        Ctx c = ctx();
        whatsappOn();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pending(c, client, "10:00", "10:30");
        String token = adminToken(c.tenant);

        // No perfil de teste o dispatcher fica desligado; liga só aqui para provar o envio logo após o commit.
        NotificationDispatcher target = AopTestUtils.getUltimateTargetObject(notificationDispatcher);
        ReflectionTestUtils.setField(target, "enabled", true);
        try {
            patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());

            await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                    assertThat(outboxOf(c.tenant, "APPROVED", com.agendepro.notification.NotificationOutbox.Channel.WHATSAPP))
                            .singleElement().satisfies(n -> assertThat(n.getStatus().name()).isEqualTo("SENT")));
            assertThat(whatsappTextsTo(client.getPhone())).singleElement().asString().contains("está confirmado");
        } finally {
            ReflectionTestUtils.setField(target, "enabled", false);
        }
    }

    @Test
    void falhaNoEnvioImediatoNaoDerrubaAConfirmacao_eAMensagemContinuaNaFila() throws Exception {
        Ctx c = ctx();
        Mockito.when(whatsappService.isAvailable(any())).thenReturn(true);
        Mockito.when(whatsappService.sendNow(any(), any(), any())).thenReturn(com.agendepro.notification.WhatsappService.SendResult.FAILED);
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = pending(c, client, "10:00", "10:30");
        String token = adminToken(c.tenant);

        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());
        notificationDispatcher.run(Instant.now());

        assertThat(appointmentRepository.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(outboxOf(c.tenant, "APPROVED", com.agendepro.notification.NotificationOutbox.Channel.WHATSAPP))
                .singleElement().satisfies(n -> {
                    assertThat(n.getStatus().name()).isEqualTo("PENDING"); // tenta de novo mais tarde
                    assertThat(n.getLastError()).isNotBlank();
                });
    }
}

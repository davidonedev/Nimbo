package com.agendepro.audit;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentRepository;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.professional.Professional;
import com.agendepro.reminder.ReminderService;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.TestFixtures;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.InetSocketAddress;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AUDITORIA — falha REAL do provedor nos lembretes. Aqui o {@code WhatsappService} NÃO é mock: ele chama um servidor HTTP
 * local que responde 500 (nenhuma mensagem real sai). Mostra o que o sistema faz quando o envio falha.
 */
class ReminderRealWhatsappAuditTest extends AbstractIntegrationTest {

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    @Autowired private ReminderService reminderService;
    @Autowired private TestFixtures fixtures;
    @Autowired private AppointmentRepository appointmentRepository;
    @Autowired private ClientRepository clientRepository;

    private Appointment reminderCandidate(Tenant t) {
        Professional p = fixtures.professional(t);
        ServiceOffering s = fixtures.service(t, 40.0, 30);
        Client client = fixtures.client(t);
        client.setPhone("(19) 98765-4321");
        clientRepository.save(client);
        LocalDateTime start = LocalDateTime.now(SP).plusHours(24);
        return appointmentRepository.save(Appointment.builder()
                .tenantId(t.getId()).clientId(client.getId()).professionalId(p.getId()).serviceId(s.getId())
                .date(start.toLocalDate().toString()).startTime(start.format(HHMM)).endTime(start.plusMinutes(30).format(HHMM))
                .price(40.0).status(AppointmentStatus.CONFIRMED).build());
    }

    @Test
    void gap_providerErrorOnAReminder_isSwallowed_markedAsSent_andNeverRetried() throws Exception {
        // documenta lacuna: sem fila/outbox/retry — o 500 do provedor é só logado e o lembrete é dado como enviado
        AtomicInteger hits = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            hits.incrementAndGet();
            ex.sendResponseHeaders(500, -1);
            ex.close();
        });
        server.start();
        try {
            Tenant t = fixtures.tenant(TenantPlan.BASIC);
            t.setWhatsappApiUrl("http://127.0.0.1:" + server.getAddress().getPort());
            t.setWhatsappApiKey("chave-de-teste");
            t.setWhatsappInstance("instancia-de-teste");
            t = fixtures.saveTenant(t);
            Appointment a = reminderCandidate(t);

            reminderService.send24hReminders();
            for (int i = 0; i < 50 && hits.get() == 0; i++) Thread.sleep(100); // o envio é @Async
            assertThat(hits.get()).isEqualTo(1); // o sistema TENTOU enviar e o provedor respondeu 500

            assertThat(appointmentRepository.findById(a.getId()).orElseThrow().getReminder24hSentAt()).isNotNull(); // marcado como enviado

            reminderService.send24hReminders(); // próximo ciclo do agendador
            Thread.sleep(500);
            assertThat(hits.get()).isEqualTo(1); // sem nova tentativa
        } finally {
            server.stop(0);
        }
    }

    @Test
    void gap_tenantWithoutWhatsapp_reminderIsMarkedSentAndOnlyLogged() {
        // documenta lacuna: lembretes usam só a config do tenant (ignoram o WhatsApp padrão da plataforma) e somem em silêncio
        Tenant t = fixtures.tenant(TenantPlan.BASIC); // sem whatsapp_api_url/key/instance
        Appointment a = reminderCandidate(t);

        reminderService.send24hReminders();

        assertThat(appointmentRepository.findById(a.getId()).orElseThrow().getReminder24hSentAt()).isNotNull();
    }
}

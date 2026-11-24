package com.agendepro.audit;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentRepository;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.notification.NotificationDispatcher;
import com.agendepro.notification.NotificationOutbox;
import com.agendepro.notification.NotificationOutboxRepository;
import com.agendepro.professional.Professional;
import com.agendepro.reminder.ReminderService;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.TestFixtures;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.InetSocketAddress;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AUDITORIA — falha REAL do provedor nos lembretes (agora pela fila de avisos). Aqui o {@code WhatsappService} NÃO é mock: ele chama um servidor HTTP
 * local que responde 500 (nenhuma mensagem real sai). Mostra o que o sistema faz quando o envio falha.
 */
class ReminderRealWhatsappAuditTest extends AbstractIntegrationTest {

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    @Autowired private ReminderService reminderService;
    @Autowired private TestFixtures fixtures;
    @Autowired private AppointmentRepository appointmentRepository;
    @Autowired private ClientRepository clientRepository;
    @Autowired private NotificationDispatcher dispatcher;
    @Autowired private NotificationOutboxRepository outboxRepository;

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

    private java.util.List<NotificationOutbox> whatsappRows(Tenant t) {
        return outboxRepository.findByTenantIdOrderByCreatedAtAsc(t.getId()).stream()
                .filter(n -> n.getChannel() == NotificationOutbox.Channel.WHATSAPP && n.getEvent().equals("REMINDER_24H")).toList();
    }

    @Test
    void providerErrorOnAReminder_isRetriedByTheQueue_insteadOfBeingLost() throws Exception {
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
            assertThat(whatsappRows(t)).hasSize(1);

            Instant now = Instant.now();
            dispatcher.run(now);
            assertThat(hits.get()).isEqualTo(1); // tentou e o provedor respondeu 500
            NotificationOutbox row = whatsappRows(t).get(0);
            assertThat(row.getStatus()).isEqualTo(NotificationOutbox.Status.PENDING); // não foi dado como entregue
            assertThat(row.getAttempts()).isEqualTo(1);
            assertThat(row.getLastError()).isNotBlank();

            dispatcher.run(now.plusSeconds(30)); // ainda dentro da espera de 1 min
            assertThat(hits.get()).isEqualTo(1);

            dispatcher.run(now.plus(3, ChronoUnit.MINUTES)); // próxima tentativa
            assertThat(hits.get()).isEqualTo(2);
            assertThat(whatsappRows(t).get(0).getAttempts()).isEqualTo(2);
            assertThat(appointmentRepository.findById(a.getId()).orElseThrow().getReminder24hSentAt()).isNotNull();
        } finally {
            server.stop(0);
        }
    }

    @Test
    void tenantWithoutWhatsapp_reminderIsQueuedAndThenSkippedWithAReason() {
        Tenant t = fixtures.tenant(TenantPlan.BASIC); // sem whatsapp_api_url/key/instance e sem padrão da plataforma
        reminderCandidate(t);

        reminderService.send24hReminders();
        dispatcher.run(Instant.now());

        NotificationOutbox row = whatsappRows(t).get(0);
        assertThat(row.getStatus()).isEqualTo(NotificationOutbox.Status.SKIPPED);
        assertThat(row.getLastError()).contains("WhatsApp não configurado");
    }
}

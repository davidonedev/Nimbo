package com.agendepro.reminder;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentRepository;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.catalog.ServiceOfferingRepository;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.notification.NotificationService;
import com.agendepro.notification.WhatsappService;
import com.agendepro.professional.Professional;
import com.agendepro.professional.ProfessionalRepository;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.format.TextStyle;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Lembretes automáticos de agendamento CONFIRMADO (24 h e 2 h antes). Não envia direto: grava na fila de avisos
 * (notification_outbox), cujo dispatcher tenta de novo se o provedor falhar e envia o que ficou atrasado quando o
 * serviço acorda. A chave de idempotência por agendamento garante que o mesmo lembrete não sai duas vezes, mesmo com
 * mais de uma instância.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReminderService {

    private final AppointmentRepository appointmentRepository;
    private final ClientRepository clientRepository;
    private final ProfessionalRepository professionalRepository;
    private final ServiceOfferingRepository serviceOfferingRepository;
    private final TenantRepository tenantRepository;
    private final WhatsappService whatsappService;
    private final NotificationService notificationService;

    @Value("${app.app-url}")
    private String appUrl;

    @Value("${app.reminders.enabled:true}")
    private boolean remindersEnabled;

    /** Sem mensagem de lembrete de 22h às 7h (Brasília): o lembrete sai na primeira varredura depois das 7h. */
    @Value("${app.reminders.quiet-hours-enabled:true}")
    private boolean quietHoursEnabled;

    /** 22h–7h (hora cheia em Brasília). */
    static boolean isQuietHour(int hour) {
        return hour >= 22 || hour < 7;
    }

    private boolean isQuietNow() {
        return quietHoursEnabled && isQuietHour(java.time.ZonedDateTime.now(SAO_PAULO).getHour());
    }

    private static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter SHORT_DATE = DateTimeFormatter.ofPattern("dd/MM");

    // ── 24h ────────────────────────────────────────────────────────────────────

    @Scheduled(fixedDelayString = "${app.reminders.check-interval-ms:300000}")
    @Transactional
    public void send24hReminders() {
        if (!remindersEnabled || isQuietNow()) return;
        queueAll(appointmentRepository.findNeedingReminder24h(), NotificationService.Event.REMINDER_24H, WhatsappService.REMINDER_24H_TEMPLATE);
    }

    // ── 2h ─────────────────────────────────────────────────────────────────────

    @Scheduled(fixedDelayString = "${app.reminders.check-interval-ms:300000}")
    @Transactional
    public void send2hReminders() {
        if (!remindersEnabled || isQuietNow()) return;
        queueAll(appointmentRepository.findNeedingReminder2h(), NotificationService.Event.REMINDER_2H, WhatsappService.REMINDER_2H_TEMPLATE);
    }

    // ── Helper ─────────────────────────────────────────────────────────────────

    private void queueAll(List<Appointment> due, NotificationService.Event event, String template) {
        if (due.isEmpty()) return;
        log.info("[reminders] {}: {} agendamento(s) para lembrar", event, due.size());
        for (Appointment a : due) {
            try {
                queueReminder(a, event, template);
                Instant now = Instant.now();
                if (event == NotificationService.Event.REMINDER_24H) a.setReminder24hSentAt(now);
                else a.setReminder2hSentAt(now);
                appointmentRepository.save(a);
            } catch (Exception ex) {
                log.error("[reminders] Falha ao enfileirar {} do agendamento {}: {}", event, a.getId(), ex.getMessage());
            }
        }
    }

    private void queueReminder(Appointment a, NotificationService.Event event, String template) {
        Client client = clientRepository.findById(a.getClientId()).orElse(null);
        Tenant tenant = tenantRepository.findById(a.getTenantId()).orElse(null);
        if (client == null || tenant == null) {
            log.warn("[reminders] {}: cliente ou estabelecimento do agendamento {} não existe mais, pulando", event, a.getId());
            return;
        }

        String professionalName = professionalRepository.findById(a.getProfessionalId())
                .map(Professional::getName).orElse("—");
        String serviceName = serviceOfferingRepository.findById(a.getServiceId())
                .map(ServiceOffering::getName).orElse("—");

        Map<String, String> vars = Map.of(
                "clientName",   client.getName(),
                "tenantName",   tenant.getName(),
                "date",         formatDate(a.getDate()),
                "dayLabel",     dayLabel(a.getDate()),
                "time",         a.getStartTime(),
                "professional", professionalName,
                "services",     serviceName,
                "portalLink",   appUrl + "/" + tenant.getSlug() + "/meus-agendamentos"
        );

        String message = whatsappService.interpolateTemplate(template, vars);
        if (!notificationService.clientReminder(a, tenant, client, event, message)) {
            log.warn("[reminders] {}: cliente {} sem celular nem e-mail, nada a enviar", event, a.getClientId());
        }
    }

    /** "hoje", "amanhã" ou "em dd/MM": com a janela de recuperação o lembrete de 24 h pode sair no mesmo dia. */
    private String dayLabel(String date) {
        try {
            LocalDate d = LocalDate.parse(date);
            LocalDate today = LocalDate.now(SAO_PAULO);
            if (d.equals(today)) return "hoje";
            if (d.equals(today.plusDays(1))) return "amanhã";
            return "em " + d.format(SHORT_DATE);
        } catch (Exception e) {
            return "em breve";
        }
    }

    // ── Clientes ausentes (porta de reminder.controller.ts) ────────────────────

    @Transactional(readOnly = true)
    public List<AbsentClientResponse> listAbsentClients(UUID tenantId, int daysSince) {
        List<Client> clients = clientRepository.findByTenantIdAndPhoneIsNotNullOrderByNameAsc(tenantId);
        if (clients.isEmpty()) return List.of();

        List<UUID> clientIds = clients.stream().map(Client::getId).toList();
        List<Appointment> lastAppts = appointmentRepository.findActiveByClientIds(clientIds);

        // Último agendamento por cliente
        Map<UUID, Appointment> lastByClient = lastAppts.stream()
                .collect(Collectors.toMap(
                        Appointment::getClientId,
                        a -> a,
                        (a, b) -> a.getDate().compareTo(b.getDate()) >= 0 ? a : b
                ));

        LocalDate cutoff = LocalDate.now().minusDays(daysSince);

        return clients.stream()
                .filter(c -> {
                    Appointment last = lastByClient.get(c.getId());
                    if (last == null) return true; // nunca agendou
                    return LocalDate.parse(last.getDate()).isBefore(cutoff);
                })
                .map(c -> {
                    Appointment last = lastByClient.get(c.getId());
                    String lastDate = last != null ? last.getDate() : null;
                    String lastService = last != null
                            ? serviceOfferingRepository.findById(last.getServiceId())
                                    .map(ServiceOffering::getName).orElse(null)
                            : null;
                    long days = last != null
                            ? ChronoUnit.DAYS.between(LocalDate.parse(last.getDate()), LocalDate.now())
                            : -1L;
                    return new AbsentClientResponse(
                            c.getId(), c.getName(), c.getPhone(), c.getEmail(), c.getCreatedAt(),
                            lastDate, lastService, days < 0 ? null : days);
                })
                .toList();
    }

    private String formatDate(String date) {
        try {
            LocalDate d = LocalDate.parse(date);
            String dayOfWeek = d.getDayOfWeek().getDisplayName(TextStyle.FULL, new Locale("pt", "BR"));
            String monthName = d.getMonth().getDisplayName(TextStyle.FULL, new Locale("pt", "BR"));
            return dayOfWeek.substring(0, 1).toUpperCase() + dayOfWeek.substring(1)
                    + ", " + d.getDayOfMonth() + " de " + monthName;
        } catch (Exception e) {
            return date;
        }
    }
}

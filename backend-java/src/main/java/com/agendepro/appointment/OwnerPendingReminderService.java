package com.agendepro.appointment;

import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.catalog.ServiceOfferingRepository;
import com.agendepro.notification.EmailService;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Avisa o dono quando um agendamento que o CLIENTE já confirmou pelo WhatsApp continua pendente perto do horário:
 * um aviso 2 h antes e, se ele ainda não confirmou, outro 1 h antes. Sem confirmação nem cancelamento o horário
 * não expira sozinho, então este aviso é o que impede o dono de esquecer.
 *
 * <p>Cada agendamento recebe no máximo um aviso por rodada; se os dois estão devidos de uma vez (cliente confirmou
 * tarde), só o de 1 h sai. Os avisos de um mesmo estabelecimento vão juntos, num único e-mail.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OwnerPendingReminderService {

    private static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd/MM");

    private final AppointmentRepository appointmentRepository;
    private final TenantRepository tenantRepository;
    private final ClientRepository clientRepository;
    private final ServiceOfferingRepository serviceOfferingRepository;
    private final EmailService emailService;

    @Value("${app.owner-reminders.enabled:true}")
    private boolean enabled;

    @Value("${app.app-url}")
    private String appUrl;

    @Scheduled(fixedDelayString = "${app.owner-reminders.check-interval-ms:60000}")
    public void runOnSchedule() {
        if (enabled) run(Instant.now());
    }

    /** Envia os avisos devidos em {@code now}; devolve quantos agendamentos foram avisados. */
    @Transactional
    public int run(Instant now) {
        LocalDate today = LocalDate.ofInstant(now, SAO_PAULO);
        LocalDate lastDay = LocalDate.ofInstant(now.plus(Duration.ofHours(2)), SAO_PAULO);
        List<String> dates = today.equals(lastDay) ? List.of(today.toString()) : List.of(today.toString(), lastDay.toString());

        // tenant → ("1h"/"2h" → agendamentos que devem ser avisados agora)
        Map<UUID, Map<String, List<Appointment>>> due = new LinkedHashMap<>();
        for (Appointment a : appointmentRepository.findByStatusAndClientConfirmedAtIsNotNullAndDateIn(AppointmentStatus.PENDING, dates)) {
            Instant start = LocalDateTime.parse(a.getDate() + "T" + a.getStartTime()).atZone(SAO_PAULO).toInstant();
            long minutesLeft = Duration.between(now, start).toMinutes();
            if (start.isBefore(now) || minutesLeft > 120) continue;

            String kind = null;
            if (minutesLeft <= 60 && a.getOwnerRemind1hAt() == null) {
                kind = "1h";
                a.setOwnerRemind1hAt(now);
                if (a.getOwnerRemind2hAt() == null) a.setOwnerRemind2hAt(now); // não manda o de 2 h depois do de 1 h
            } else if (minutesLeft > 60 && a.getOwnerRemind2hAt() == null && a.getOwnerRemind1hAt() == null) {
                kind = "2h";
                a.setOwnerRemind2hAt(now);
            }
            if (kind == null) continue;
            appointmentRepository.save(a);
            due.computeIfAbsent(a.getTenantId(), k -> new LinkedHashMap<>()).computeIfAbsent(kind, k -> new ArrayList<>()).add(a);
        }
        if (due.isEmpty()) return 0;

        Map<UUID, Tenant> tenants = tenantRepository.findAllById(due.keySet()).stream().collect(Collectors.toMap(Tenant::getId, t -> t));
        int notified = 0;
        for (var byTenant : due.entrySet()) {
            Tenant tenant = tenants.get(byTenant.getKey());
            if (tenant == null || tenant.getEmail() == null || tenant.getEmail().isBlank()) continue;
            for (var byKind : byTenant.getValue().entrySet()) {
                List<EmailService.OwnerReminderItem> items = toItems(byKind.getValue());
                emailService.sendOwnerPendingReminder(tenant.getEmail(), tenant.getName(),
                        "1h".equals(byKind.getKey()) ? "1 hora" : "2 horas", items, appUrl + "/admin/appointments");
                notified += items.size();
            }
        }
        log.info("[avisos-dono] {} agendamento(s) sem confirmação avisados", notified);
        return notified;
    }

    private List<EmailService.OwnerReminderItem> toItems(List<Appointment> appointments) {
        Map<UUID, Client> clients = clientRepository.findAllById(appointments.stream().map(Appointment::getClientId).distinct().toList())
                .stream().collect(Collectors.toMap(Client::getId, c -> c));
        Map<UUID, ServiceOffering> services = serviceOfferingRepository.findAllById(appointments.stream().map(Appointment::getServiceId).distinct().toList())
                .stream().collect(Collectors.toMap(ServiceOffering::getId, s -> s));
        LocalDate today = LocalDate.now(SAO_PAULO);
        return appointments.stream().map(a -> {
            Client c = clients.get(a.getClientId());
            ServiceOffering s = services.get(a.getServiceId());
            LocalDate date = LocalDate.parse(a.getDate());
            String day = date.equals(today) ? "hoje" : date.equals(today.plusDays(1)) ? "amanhã" : date.format(DATE_FMT);
            return new EmailService.OwnerReminderItem(c == null ? "Cliente" : c.getName(), c == null ? null : c.getPhone(),
                    s == null ? "—" : s.getName(), day + " às " + a.getStartTime());
        }).toList();
    }
}

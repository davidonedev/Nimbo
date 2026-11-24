package com.agendepro.notification;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentRepository;
import com.agendepro.common.ApiResponse;
import com.agendepro.security.AuthenticatedUser;
import com.agendepro.security.SecurityUtils;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantRepository;
import com.agendepro.user.UserRole;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * O que aconteceu com os avisos ao cliente depois que o dono ou o profissional aprovou, recusou ou cancelou: a tela
 * mostra "mensagem enviada" ou, se o WhatsApp automático não saiu, oferece o link para avisar à mão.
 * Mesmo conteúdo em /api/admin e /api/professional (o profissional só vê os agendamentos dele).
 */
@Tag(name = "Notifications")
@RestController
@RequestMapping({"/api/admin/notifications", "/api/professional/notifications"})
@RequiredArgsConstructor
public class NotificationStatusController {

    /** Eventos que avisam o cliente por decisão do dono/profissional. */
    private static final Set<String> CLIENT_EVENTS = Set.of(
            NotificationService.Event.APPROVED.name(),
            NotificationService.Event.REFUSED.name(),
            NotificationService.Event.CANCELLED_BY_OWNER.name());

    private static final int MAX_IDS = 200;

    private final NotificationOutboxRepository outbox;
    private final AppointmentRepository appointmentRepository;
    private final TenantRepository tenantRepository;
    private final WhatsappService whatsappService;

    /** Resultado do envio de um aviso. {@code error} traz o motivo curto quando não saiu ("WhatsApp não configurado"). */
    public record Item(UUID appointmentId, String event, String channel, String status, String error) {
    }

    /** O envio automático por WhatsApp está disponível para este estabelecimento? */
    public record Channels(boolean whatsappAuto) {
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<List<Item>>> status(@RequestParam List<UUID> ids) {
        UUID tenantId = SecurityUtils.requireTenantId();
        AuthenticatedUser user = SecurityUtils.currentUser();
        List<UUID> requested = ids.stream().distinct().limit(MAX_IDS).toList();

        List<UUID> allowed = appointmentRepository.findByTenantIdAndIdIn(tenantId, requested).stream()
                .filter(a -> user.role() != UserRole.PROFESSIONAL || a.getProfessionalId().equals(user.professionalId()))
                .map(Appointment::getId)
                .toList();
        if (allowed.isEmpty()) return ResponseEntity.ok(ApiResponse.ok(List.of()));

        List<Item> items = outbox.findByTenantIdAndAppointmentIdInAndEventIn(tenantId, allowed, CLIENT_EVENTS).stream()
                .map(n -> new Item(n.getAppointmentId(), n.getEvent(), n.getChannel().name(), n.getStatus().name(), n.getLastError()))
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(items));
    }

    @GetMapping("/channels")
    public ResponseEntity<ApiResponse<Channels>> channels() {
        Tenant tenant = tenantRepository.findById(SecurityUtils.requireTenantId()).orElse(null);
        if (tenant == null) return ResponseEntity.ok(ApiResponse.ok(new Channels(false)));
        var config = new WhatsappService.TenantWhatsappConfig(tenant.getWhatsappApiUrl(), tenant.getWhatsappApiKey(), tenant.getWhatsappInstance());
        return ResponseEntity.ok(ApiResponse.ok(new Channels(whatsappService.isAvailable(config))));
    }
}

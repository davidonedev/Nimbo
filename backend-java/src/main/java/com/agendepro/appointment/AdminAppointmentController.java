package com.agendepro.appointment;

import com.agendepro.security.SecurityUtils;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** DELETE só existe do lado admin (admin.routes.ts) — professional.routes.ts não expõe. */
@Tag(name = "Appointments")
@RestController
@RequestMapping("/api/admin/appointments")
@RequiredArgsConstructor
public class AdminAppointmentController {

    private final AppointmentService appointmentService;

    public record BulkConfirmRequest(@jakarta.validation.constraints.NotEmpty @jakarta.validation.constraints.Size(max = 200) List<UUID> ids) {
    }

    /** Confirma de uma vez os agendamentos pendentes escolhidos (ex.: os que o cliente confirmou pelo WhatsApp). */
    @PostMapping("/bulk-confirm")
    public ResponseEntity<com.agendepro.common.ApiResponse<AppointmentService.BulkConfirmResult>> bulkConfirm(
            @jakarta.validation.Valid @RequestBody BulkConfirmRequest request) {
        return ResponseEntity.ok(com.agendepro.common.ApiResponse.ok(
                appointmentService.bulkConfirm(SecurityUtils.requireTenantId(), request.ids())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        appointmentService.delete(SecurityUtils.requireTenantId(), id);
        return ResponseEntity.noContent().build();
    }
}

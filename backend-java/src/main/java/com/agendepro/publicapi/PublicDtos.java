package com.agendepro.publicapi;

import com.agendepro.appointment.AppointmentDtos;
import com.agendepro.professional.ProfessionalDtos;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.tenant.TenantStatus;
import jakarta.validation.constraints.*;

import java.util.List;
import java.util.UUID;

/** DTOs do portal público — porta de public.controller.ts. */
public final class PublicDtos {

    private PublicDtos() {
    }

    // ─── login-data ───────────────────────────────────────────────────────────────

    public record LoginDataUser(UUID id, String name, String email, String role) {
    }

    public record LoginDataProfessionalUser(String email) {
    }

    public record LoginDataProfessional(UUID id, String name, String specialty, List<LoginDataProfessionalUser> users) {
    }

    public record LoginDataTenant(UUID id, String name, String slug, TenantPlan plan, TenantStatus status,
                                   List<LoginDataUser> users, List<LoginDataProfessional> professionals) {
    }

    // ─── tenant público ───────────────────────────────────────────────────────────

    public record TenantPublicResponse(UUID id, String slug, String name, String primaryColor, String logoUrl,
                                        String bannerUrl, Boolean isOpen, TenantStatus status, String address,
                                        String phone, Integer minAdvanceMinutes) {
    }

    // ─── profissionais públicos ───────────────────────────────────────────────────

    public record ProfessionalPublicResponse(UUID id, String name, String specialty, String avatar, String photoUrl,
                                              String bio, List<Integer> workingDays, String workingHoursStart,
                                              String workingHoursEnd, List<ProfessionalDtos.ServiceLinkSummary> services) {
    }

    // ─── cliente ────────────────────────────────────────────────────────────────

    public record ClientLoginRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    /** {@code deviceToken}: prova de posse (header X-Device-Token) para listar, cancelar e remarcar os agendamentos. */
    public record ClientAuthResponse(UUID id, String name, String email, String phone, String deviceToken) {
    }

    public record ClientRegisterRequest(
            @NotBlank @Size(min = 2, max = 100) String name,
            @NotBlank @Email String email,
            String phone,
            @NotBlank @Size(min = 6) String password
    ) {
    }

    public record GoogleAuthRequest(@NotBlank String accessToken) {
    }

    public record ProfessionalRegisterRequest(
            @NotBlank @Size(min = 2, max = 100) String name,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 6) String password,
            @NotBlank @Size(min = 2, max = 100) String specialty,
            @Size(max = 500) String bio,
            String workingHoursStart,
            String workingHoursEnd,
            List<Integer> workingDays
    ) {
        public ProfessionalRegisterRequest {
            workingHoursStart = (workingHoursStart == null || workingHoursStart.isBlank()) ? "08:00" : workingHoursStart;
            workingHoursEnd = (workingHoursEnd == null || workingHoursEnd.isBlank()) ? "18:00" : workingHoursEnd;
            workingDays = workingDays == null ? List.of(1, 2, 3, 4, 5) : workingDays;
        }
    }

    public record ProfessionalRegisterResponse(String name, String email) {
    }

    /** {@code clientId} é opcional: o cliente vem do X-Device-Token; se informado, tem de ser o dono do token. */
    public record CancelBookingRequest(UUID clientId) {
    }

    public record ResendVerificationRequest(@NotBlank @Email String email) {
    }

    public record RescheduleRequest(
            UUID clientId, // opcional: vem do X-Device-Token; se informado, tem de ser o dono do token
            @NotBlank @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$") String date,
            @NotBlank @Pattern(regexp = "^\\d{2}:\\d{2}(:\\d{2})?$") String startTime
    ) {
        public String startTimeHHmm() {
            return startTime.length() >= 5 ? startTime.substring(0, 5) : startTime;
        }
    }

    public record BusinessRegisterRequest(
            @NotBlank @Size(min = 2, max = 100) String ownerName,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 6) String password,
            String phone,
            @NotBlank @Size(min = 2, max = 120) String businessName,
            String address,
            @Size(min = 2, max = 60) @Pattern(regexp = "^[a-z0-9-]+$", message = "Use apenas letras minúsculas, números e hífens") String slug
    ) {
    }

    public record BusinessRegisterResponse(String message, String slug) {
    }

    public record MessageResponse(String message) {
    }
}

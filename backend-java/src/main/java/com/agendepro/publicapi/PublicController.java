package com.agendepro.publicapi;

import com.agendepro.appointment.AppointmentDtos;
import com.agendepro.catalog.ServiceOfferingDtos;
import com.agendepro.common.ApiResponse;
import com.agendepro.common.AppException;
import com.agendepro.product.ProductDtos;
import com.agendepro.product.ProductService;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantRepository;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

import static com.agendepro.publicapi.PublicDtos.*;

/** Porta de public.routes.ts — /api/public/**, sem autenticação. */
@Tag(name = "Public")
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicController {

    private final PublicService publicService;
    private final PhoneBookingService phoneBookingService;
    private final ProductService productService;
    private final TenantRepository tenantRepository;

    @PostMapping("/register/business")
    public ResponseEntity<ApiResponse<BusinessRegisterResponse>> registerBusiness(@Valid @RequestBody BusinessRegisterRequest request) {
        var result = publicService.registerBusiness(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(result));
    }

    @GetMapping("/{slug}")
    public ResponseEntity<ApiResponse<TenantPublicResponse>> getTenant(@PathVariable String slug) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.getTenantBySlug(slug)));
    }

    @GetMapping("/{slug}/services")
    public ResponseEntity<ApiResponse<List<ServiceOfferingDtos.ServiceResponse>>> services(@PathVariable String slug) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.getPublicServices(slug)));
    }

    @GetMapping("/{slug}/professionals")
    public ResponseEntity<ApiResponse<List<ProfessionalPublicResponse>>> professionals(
            @PathVariable String slug, @RequestParam(required = false) UUID serviceId) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.getPublicProfessionals(slug, serviceId)));
    }

    @GetMapping("/{slug}/availability")
    public ResponseEntity<ApiResponse<List<String>>> availability(
            @PathVariable String slug,
            @RequestParam UUID professionalId,
            @RequestParam(required = false) String serviceId,
            @RequestParam(required = false) String serviceIds,
            @RequestParam String date
    ) {
        var data = publicService.getAvailableSlots(slug, professionalId, serviceId, serviceIds, date);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    // ─── Agendamento por celular (tela padrão: Nome + Celular + código por WhatsApp) ────

    @GetMapping("/{slug}/book/slots")
    public ResponseEntity<ApiResponse<List<String>>> bookSlots(
            @PathVariable String slug, @RequestParam String serviceIds, @RequestParam String date,
            @RequestParam(required = false) UUID professionalId) {
        return ResponseEntity.ok(ApiResponse.ok(phoneBookingService.slots(slug, parseIds(serviceIds), date, professionalId)));
    }

    @GetMapping("/{slug}/book/days")
    public ResponseEntity<ApiResponse<List<String>>> bookDays(
            @PathVariable String slug, @RequestParam String serviceIds, @RequestParam String from,
            @RequestParam(defaultValue = "14") int count, @RequestParam(required = false) UUID professionalId) {
        return ResponseEntity.ok(ApiResponse.ok(phoneBookingService.daysWithSlots(slug, parseIds(serviceIds), professionalId, from, count)));
    }

    @GetMapping("/{slug}/book/possession")
    public ResponseEntity<ApiResponse<PhoneBookingDtos.PossessionResponse>> possession(
            @PathVariable String slug, @RequestHeader(value = "X-Device-Token", required = false) String deviceToken) {
        return ResponseEntity.ok(ApiResponse.ok(phoneBookingService.possession(slug, deviceToken)));
    }

    @PostMapping("/{slug}/book")
    public ResponseEntity<ApiResponse<PhoneBookingDtos.BookResponse>> book(
            @PathVariable String slug, @RequestHeader(value = "X-Device-Token", required = false) String deviceToken,
            @Valid @RequestBody PhoneBookingDtos.BookRequest request, jakarta.servlet.http.HttpServletRequest http) {
        return ResponseEntity.ok(ApiResponse.ok(phoneBookingService.book(slug, deviceToken, request, com.agendepro.common.ClientIp.of(http))));
    }

    @PostMapping("/{slug}/book/client-confirmed")
    public ResponseEntity<ApiResponse<PhoneBookingDtos.ClientConfirmedResponse>> clientConfirmed(
            @PathVariable String slug, @Valid @RequestBody PhoneBookingDtos.ClientConfirmedRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(phoneBookingService.clientConfirmed(slug, request.appointmentIds())));
    }

    @PostMapping("/{slug}/book/verify")
    public ResponseEntity<ApiResponse<PhoneBookingDtos.BookResponse>> bookVerify(
            @PathVariable String slug, @Valid @RequestBody PhoneBookingDtos.VerifyRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(phoneBookingService.verify(slug, request)));
    }

    @PostMapping("/{slug}/book/resend")
    public ResponseEntity<ApiResponse<PhoneBookingDtos.ResendResponse>> bookResend(
            @PathVariable String slug, @Valid @RequestBody PhoneBookingDtos.ResendRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(phoneBookingService.resend(slug, request.challengeId())));
    }

    private static List<UUID> parseIds(String csv) {
        try {
            List<UUID> ids = java.util.Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).map(UUID::fromString).toList();
            if (ids.isEmpty() || ids.size() > 5) throw AppException.badRequest("Informe de 1 a 5 serviços.");
            return ids;
        } catch (IllegalArgumentException e) {
            throw AppException.badRequest("Serviço inválido.");
        }
    }

    @GetMapping("/{slug}/products")
    public ResponseEntity<ApiResponse<List<ProductDtos.ProductResponse>>> products(@PathVariable String slug) {
        Tenant tenant = tenantRepository.findBySlug(slug).orElseThrow(() -> AppException.notFound("Tenant não encontrado"));
        return ResponseEntity.ok(ApiResponse.ok(productService.listPublic(tenant.getId())));
    }

    @PostMapping("/{slug}/login/client")
    public ResponseEntity<ApiResponse<ClientAuthResponse>> loginClient(@PathVariable String slug, @Valid @RequestBody ClientLoginRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.loginPublicClient(slug, request)));
    }

    @PostMapping("/{slug}/register/client")
    public ResponseEntity<ApiResponse<MessageResponse>> registerClient(@PathVariable String slug, @Valid @RequestBody ClientRegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(publicService.registerPublicClient(slug, request)));
    }

    @PostMapping("/{slug}/auth/google")
    public ResponseEntity<ApiResponse<ClientAuthResponse>> googleAuth(@PathVariable String slug, @Valid @RequestBody GoogleAuthRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.googleAuthPublicClient(slug, request)));
    }

    /** Exige o X-Device-Token; {@code clientId}, se vier, tem de ser o dono do token (senão 403 DEVICE_REQUIRED). */
    @GetMapping("/{slug}/my-appointments")
    public ResponseEntity<ApiResponse<List<AppointmentDtos.AppointmentResponse>>> myAppointments(
            @PathVariable String slug, @RequestParam(required = false) UUID clientId,
            @RequestHeader(value = "X-Device-Token", required = false) String deviceToken) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.getClientAppointments(slug, clientId, deviceToken)));
    }

    /** Agendamentos do cliente do aparelho (cliente resolvido só pelo X-Device-Token). */
    @GetMapping("/{slug}/book/my-appointments")
    public ResponseEntity<ApiResponse<List<AppointmentDtos.AppointmentResponse>>> bookMyAppointments(
            @PathVariable String slug, @RequestHeader(value = "X-Device-Token", required = false) String deviceToken) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.getClientAppointments(slug, null, deviceToken)));
    }

    @PatchMapping("/{slug}/appointments/{id}/cancel")
    public ResponseEntity<ApiResponse<MessageResponse>> cancel(
            @PathVariable String slug, @PathVariable UUID id,
            @RequestHeader(value = "X-Device-Token", required = false) String deviceToken,
            @Valid @RequestBody(required = false) CancelBookingRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.cancelPublicAppointment(slug, id, request, deviceToken)));
    }

    @PatchMapping("/{slug}/appointments/{id}/reschedule")
    public ResponseEntity<ApiResponse<MessageResponse>> reschedule(
            @PathVariable String slug, @PathVariable UUID id,
            @RequestHeader(value = "X-Device-Token", required = false) String deviceToken,
            @Valid @RequestBody RescheduleRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.reschedulePublicAppointment(slug, id, request, deviceToken)));
    }

    @GetMapping("/{slug}/verify-email")
    public ResponseEntity<ApiResponse<ClientAuthResponse>> verifyEmail(@PathVariable String slug, @RequestParam String token) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.verifyClientEmail(slug, token)));
    }

    @PostMapping("/{slug}/resend-verification")
    public ResponseEntity<ApiResponse<MessageResponse>> resendVerification(
            @PathVariable String slug, @Valid @RequestBody ResendVerificationRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(publicService.resendVerificationEmail(slug, request)));
    }
}

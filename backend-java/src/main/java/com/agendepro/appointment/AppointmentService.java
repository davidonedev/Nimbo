package com.agendepro.appointment;

import com.agendepro.catalog.ServiceOffering;
import com.agendepro.catalog.ServiceOfferingDtos;
import com.agendepro.catalog.ServiceOfferingRepository;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.client.ClientService;
import com.agendepro.common.AppException;
import com.agendepro.professional.Professional;
import com.agendepro.professional.ProfessionalRepository;
import com.agendepro.security.AuthenticatedUser;
import com.agendepro.user.UserRole;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.agendepro.appointment.AppointmentDtos.*;

/** Porta de appointment.controller.ts. */
@Service
@RequiredArgsConstructor
public class AppointmentService {

    private final AppointmentRepository appointmentRepository;
    private final ScheduleService scheduleService;
    private final ServiceOfferingRepository serviceOfferingRepository;
    private final ProfessionalRepository professionalRepository;
    private final ClientRepository clientRepository;
    private final ClientService clientService;
    private final PgAdvisoryLockService pgAdvisoryLockService;
    private final com.agendepro.notification.NotificationService notificationService;

    @Transactional(readOnly = true)
    public List<AppointmentResponse> list(
            UUID tenantId, AuthenticatedUser authUser, String date, String startDate, String endDate,
            UUID professionalId, AppointmentStatus status
    ) {
        UUID effectiveProfessionalId = professionalId;

        if (authUser.role() == UserRole.PROFESSIONAL) {
            if (authUser.professionalId() == null) {
                throw new AppException("Profissional não identificado no token", 400, "MISSING_PROFESSIONAL");
            }
            effectiveProfessionalId = authUser.professionalId();
        } else if (professionalId != null) {
            professionalRepository.findByIdAndTenantId(professionalId, tenantId)
                    .orElseThrow(() -> AppException.notFound("Profissional não encontrado neste tenant"));
        }

        Specification<Appointment> spec = AppointmentSpecifications.and(
                AppointmentSpecifications.tenantIdEq(tenantId),
                AppointmentSpecifications.professionalIdEq(effectiveProfessionalId),
                AppointmentSpecifications.statusEq(status),
                date != null ? AppointmentSpecifications.dateEq(date) : AppointmentSpecifications.dateGte(startDate),
                date != null ? null : AppointmentSpecifications.dateLte(endDate)
        );

        List<Appointment> appointments = appointmentRepository.findAll(spec,
                        org.springframework.data.domain.Sort.by("date").ascending().and(org.springframework.data.domain.Sort.by("startTime").ascending()));

        return toResponses(appointments);
    }

    @Transactional
    public AppointmentResponse create(UUID tenantId, AuthenticatedUser authUser, AppointmentCreateRequest request) {
        boolean isProfessional = authUser.role() == UserRole.PROFESSIONAL;
        if (isProfessional) {
            // O profissional só agenda na própria agenda; nunca em nome de um colega.
            if (authUser.professionalId() == null) {
                throw new AppException("Profissional não identificado no token", 400, "MISSING_PROFESSIONAL");
            }
            if (!authUser.professionalId().equals(request.professionalId())) {
                throw AppException.forbidden("Acesso negado a esta agenda");
            }
        }

        ServiceOffering service = serviceOfferingRepository.findByIdAndTenantId(request.serviceId(), tenantId)
                .orElseThrow(() -> AppException.notFound("Serviço não encontrado"));

        Professional professional = professionalRepository.findByIdAndTenantId(request.professionalId(), tenantId)
                .orElseThrow(() -> AppException.notFound("Profissional não encontrado"));

        String startTime = request.startTimeHHmm();
        String endTime = ScheduleService.addMinutes(startTime, service.getDuration());

        pgAdvisoryLockService.lockProfessionalSchedule(request.professionalId(), request.date());
        boolean conflict = scheduleService.checkConflict(tenantId, request.professionalId(), request.date(), startTime, endTime, null);
        if (conflict) {
            throw new AppException("Conflito de horário: já existe agendamento neste período", 409, "SCHEDULE_CONFLICT");
        }

        UUID clientId;
        if (request.clientId() == null) {
            if (request.clientName() == null || request.clientEmail() == null) {
                throw new AppException("Informe clientId ou os dados do novo cliente (clientName, clientEmail)", 400);
            }
            Client client = clientService.upsertByEmail(tenantId, request.clientName(), request.clientEmail(), request.clientPhone());
            clientId = client.getId();
        } else {
            clientRepository.findByIdAndTenantId(request.clientId(), tenantId)
                    .orElseThrow(() -> AppException.notFound("Cliente não encontrado neste tenant"));
            // Profissional só reaproveita clientes que já atendeu (resposta idêntica a "não existe": sem enumeração).
            if (isProfessional && !appointmentRepository.existsByTenantIdAndProfessionalIdAndClientId(
                    tenantId, authUser.professionalId(), request.clientId())) {
                throw AppException.notFound("Cliente não encontrado neste tenant");
            }
            clientId = request.clientId();
        }

        Appointment appointment = appointmentRepository.save(Appointment.builder()
                .tenantId(tenantId)
                .clientId(clientId)
                .professionalId(request.professionalId())
                .serviceId(request.serviceId())
                .date(request.date())
                .startTime(startTime)
                .endTime(endTime)
                .price(service.getPrice())
                .notes(request.notes())
                .status(AppointmentStatus.PENDING)
                .build());

        return toResponse(appointment);
    }

    @Transactional
    public AppointmentResponse updateStatus(UUID tenantId, AuthenticatedUser authUser, UUID id, UpdateStatusRequest request) {
        Appointment appointment = appointmentRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> AppException.notFound("Agendamento não encontrado"));

        if (authUser.role() == UserRole.PROFESSIONAL) {
            if (authUser.professionalId() == null) {
                throw new AppException("Profissional não identificado no token", 400, "MISSING_PROFESSIONAL");
            }
            if (!appointment.getProfessionalId().equals(authUser.professionalId())) {
                throw AppException.forbidden("Acesso negado a este agendamento");
            }
        }

        if (!appointment.getStatus().canTransitionTo(request.status())) {
            throw new AppException("Este agendamento está " + appointment.getStatus().label()
                    + " e não pode passar para " + request.status().label() + ". Atualize a tela.", 409, "INVALID_STATUS_TRANSITION");
        }

        AppointmentStatus previous = appointment.getStatus();
        appointment.setStatus(request.status());
        appointment.setConfirmBy(null); // decidido: não expira mais
        Appointment saved = appointmentRepository.save(appointment);

        // Avisos do ciclo (só enfileira; o envio é em segundo plano). Concluir e marcar falta não avisam ninguém.
        switch (saved.getStatus()) {
            case CONFIRMED -> notificationService.clientApproved(List.of(saved));
            case CANCELLED -> {
                if (previous == AppointmentStatus.PENDING) notificationService.clientRefused(saved);
                else notificationService.clientCancelledByOwner(saved);
            }
            default -> { }
        }
        return toResponse(saved);
    }

    /** Resultado da confirmação em massa: quantos foram confirmados e quantos já não estavam pendentes. */
    public record BulkConfirmResult(int confirmed, int skipped, List<UUID> confirmedIds) {
    }

    /** Confirma vários agendamentos pendentes do estabelecimento de uma vez; os que não estão pendentes são ignorados. */
    @Transactional
    public BulkConfirmResult bulkConfirm(UUID tenantId, List<UUID> ids) {
        List<UUID> distinct = ids.stream().distinct().toList();
        List<Appointment> found = appointmentRepository.findByTenantIdAndIdIn(tenantId, distinct);
        List<UUID> confirmedIds = new java.util.ArrayList<>();
        List<Appointment> confirmed = new java.util.ArrayList<>();
        for (Appointment a : found) {
            if (a.getStatus() != AppointmentStatus.PENDING) continue;
            a.setStatus(AppointmentStatus.CONFIRMED);
            a.setConfirmBy(null);
            appointmentRepository.save(a);
            confirmedIds.add(a.getId());
            confirmed.add(a);
        }
        notificationService.clientApproved(confirmed); // agrupa por cliente, dia e profissional
        return new BulkConfirmResult(confirmedIds.size(), distinct.size() - confirmedIds.size(), confirmedIds);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Appointment appointment = appointmentRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> AppException.notFound("Agendamento não encontrado"));
        appointmentRepository.delete(appointment);
    }

    // ─── Mapeamento para resposta (com client/professional/service aninhados) ────────

    public AppointmentResponse toResponse(Appointment a) {
        return toResponses(List.of(a)).getFirst();
    }

    public List<AppointmentResponse> toResponses(List<Appointment> appointments) {
        if (appointments.isEmpty()) return List.of();

        Map<UUID, Client> clients = clientRepository.findAllById(appointments.stream().map(Appointment::getClientId).distinct().toList())
                .stream().collect(Collectors.toMap(Client::getId, c -> c));
        Map<UUID, Professional> professionals = professionalRepository.findAllById(appointments.stream().map(Appointment::getProfessionalId).distinct().toList())
                .stream().collect(Collectors.toMap(Professional::getId, p -> p));
        Map<UUID, ServiceOffering> services = serviceOfferingRepository.findAllById(appointments.stream().map(Appointment::getServiceId).distinct().toList())
                .stream().collect(Collectors.toMap(ServiceOffering::getId, s -> s));

        return appointments.stream()
                .map(a -> build(a, clients.get(a.getClientId()), professionals.get(a.getProfessionalId()), services.get(a.getServiceId())))
                .toList();
    }

    private AppointmentResponse build(Appointment a, Client client, Professional professional, ServiceOffering service) {
        ClientSummary clientSummary = client == null ? null : new ClientSummary(
                client.getId(), client.getTenantId(), client.getName(), client.getEmail(), client.getPhone(),
                client.getEmailVerified(), client.getCreatedAt(), client.getUpdatedAt());

        ProfessionalSummary professionalSummary = professional == null ? null : new ProfessionalSummary(
                professional.getId(), professional.getTenantId(), professional.getName(), professional.getSpecialty(),
                professional.getAvatar(), professional.getPhotoUrl(), professional.getBio(),
                professional.getWorkingHoursStart(), professional.getWorkingHoursEnd(),
                java.util.Arrays.asList(professional.getWorkingDays()), professional.getCreatedAt(), professional.getUpdatedAt());

        ServiceOfferingDtos.ServiceResponse serviceResponse = service == null ? null : ServiceOfferingDtos.ServiceResponse.from(service);

        return new AppointmentResponse(
                a.getId(), a.getTenantId(), a.getClientId(), a.getProfessionalId(), a.getServiceId(),
                a.getDate(), a.getStartTime(), a.getEndTime(), a.getStatus(), a.getPrice(), a.getNotes(),
                a.getCreatedAt(), a.getUpdatedAt(), clientSummary, professionalSummary, serviceResponse,
                a.getPaymentStatus(), a.getPaymentId(), a.getConfirmBy(), a.getClientConfirmedAt());
    }
}

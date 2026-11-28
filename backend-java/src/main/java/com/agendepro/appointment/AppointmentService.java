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
        requireNotInThePast(request.date(), startTime);

        pgAdvisoryLockService.lockProfessionalSchedule(request.professionalId(), request.date());
        boolean conflict = scheduleService.checkConflict(tenantId, request.professionalId(), request.date(), startTime, endTime, null);
        if (conflict) {
            throw new AppException("Conflito de horário: já existe agendamento neste período", 409, "SCHEDULE_CONFLICT");
        }

        UUID clientId;
        if (request.clientId() == null) {
            if (request.clientName() == null || request.clientName().isBlank()
                    || request.clientPhone() == null || request.clientPhone().isBlank()) {
                throw new AppException("Informe o cliente já cadastrado ou o nome e o celular (WhatsApp) do novo cliente", 400, "CLIENT_DATA_REQUIRED");
            }
            com.agendepro.publicapi.PublicService.requireValidPhone(request.clientPhone());
            Client client = clientService.findOrCreateByContact(tenantId, request.clientName(), request.clientPhone(), request.clientEmail());
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

    private static final java.time.ZoneId SAO_PAULO = java.time.ZoneId.of("America/Sao_Paulo");

    /**
     * Rejeita data+hora de início que já passou (America/Sao_Paulo, com precisão de minuto: agendar para o minuto em
     * curso ainda vale). Hoje num horário que ainda não chegou continua permitido.
     */
    static void requireNotInThePast(String date, String hhmm) {
        java.time.LocalDateTime start;
        try {
            start = java.time.LocalDateTime.parse(date + "T" + hhmm);
        } catch (java.time.format.DateTimeParseException e) {
            throw new AppException("Data ou horário inválido.", 400, "INVALID_DATE");
        }
        java.time.LocalDateTime now = java.time.LocalDateTime.now(SAO_PAULO).truncatedTo(java.time.temporal.ChronoUnit.MINUTES);
        if (start.isBefore(now)) {
            throw new AppException("Não é possível agendar em uma data ou horário que já passou.", 400, "INVALID_DATE");
        }
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

        // Concluir e marcar falta só fazem sentido depois do horário de início (senão entra faturamento e falta de um atendimento que não houve)
        if ((request.status() == AppointmentStatus.COMPLETED || request.status() == AppointmentStatus.NO_SHOW)
                && java.time.LocalDateTime.parse(appointment.getDate() + "T" + appointment.getStartTime())
                .isAfter(java.time.LocalDateTime.now(SAO_PAULO))) {
            throw new AppException("Só dá para marcar como " + request.status().label().toLowerCase()
                    + " depois do horário do agendamento.", 400, "NOT_STARTED_YET");
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

    /**
     * Remarcação feita pelo estabelecimento. Vale o que vale para criar: horário que não passou, sem conflito com outro
     * agendamento (o próprio não conta) nem bloqueio. Pendente continua pendente e confirmado continua confirmado (foi o dono
     * quem decidiu); lembretes e o aviso de cancelamento automático recomeçam para o novo horário; o cliente é avisado.
     */
    @Transactional
    public AppointmentResponse reschedule(UUID tenantId, AuthenticatedUser authUser, UUID id, AppointmentRescheduleRequest request) {
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
        if (appointment.getStatus() != AppointmentStatus.PENDING && appointment.getStatus() != AppointmentStatus.CONFIRMED) {
            throw new AppException("Só dá para mudar o horário de agendamentos pendentes ou confirmados.", 409, "INVALID_STATUS_TRANSITION");
        }

        UUID professionalId = request.professionalId() != null ? request.professionalId() : appointment.getProfessionalId();
        if (authUser.role() == UserRole.PROFESSIONAL && !professionalId.equals(authUser.professionalId())) {
            throw AppException.forbidden("Acesso negado a este agendamento");
        }
        professionalRepository.findByIdAndTenantId(professionalId, tenantId)
                .orElseThrow(() -> AppException.notFound("Profissional não encontrado"));
        ServiceOffering service = serviceOfferingRepository.findByIdAndTenantId(appointment.getServiceId(), tenantId)
                .orElseThrow(() -> AppException.notFound("Serviço não encontrado"));

        String startTime = request.startTimeHHmm();
        String endTime = ScheduleService.addMinutes(startTime, service.getDuration());
        if (professionalId.equals(appointment.getProfessionalId()) && request.date().equals(appointment.getDate())
                && startTime.equals(appointment.getStartTime())) {
            throw new AppException("Escolha um dia ou horário diferente do atual.", 400, "SAME_SLOT");
        }
        requireNotInThePast(request.date(), startTime);

        pgAdvisoryLockService.lockProfessionalSchedule(professionalId, request.date());
        if (scheduleService.checkConflict(tenantId, professionalId, request.date(), startTime, endTime, appointment.getId())) {
            throw new AppException("Conflito de horário: já existe agendamento ou bloqueio neste período", 409, "SCHEDULE_CONFLICT");
        }

        appointment.setProfessionalId(professionalId);
        appointment.setDate(request.date());
        appointment.setStartTime(startTime);
        appointment.setEndTime(endTime);
        appointment.setConfirmBy(null);
        appointment.setReminder24hSentAt(null);
        appointment.setReminder2hSentAt(null);
        appointment.setExpiryWarnedAt(PendingExpiryService.warnedStampFor(request.date(), startTime, java.time.Instant.now()));
        Appointment saved = appointmentRepository.save(appointment);

        notificationService.clientMovedByOwner(saved);
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
                professional.getAvatar(), null /* a foto (base64) não viaja em cada agendamento: a lista de profissionais já a traz */, professional.getBio(),
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

package com.agendepro.catalog;

import com.agendepro.common.AppException;
import com.agendepro.professional.ProfessionalRepository;
import com.agendepro.professional.ProfessionalServiceLink;
import com.agendepro.professional.ProfessionalServiceLinkRepository;
import com.agendepro.tenant.PlanLimits;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static com.agendepro.catalog.ServiceOfferingDtos.*;

/** Porta de service.controller.ts. */
@Service
@RequiredArgsConstructor
public class ServiceOfferingService {

    private final ServiceOfferingRepository serviceOfferingRepository;
    private final com.agendepro.appointment.AppointmentRepository appointmentRepository;
    private final TenantRepository tenantRepository;
    private final ProfessionalRepository professionalRepository;
    private final ProfessionalServiceLinkRepository linkRepository;

    @Transactional(readOnly = true)
    public List<ServiceResponse> list(UUID tenantId) {
        return serviceOfferingRepository.findByTenantIdOrderByNameAsc(tenantId).stream()
                .map(ServiceResponse::from)
                .toList();
    }

    @Transactional
    public ServiceResponse create(UUID tenantId, ServiceCreateRequest request) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> AppException.notFound("Tenant não encontrado"));

        int limit = PlanLimits.of(tenant.getPlan()).services();
        long current = serviceOfferingRepository.countByTenantId(tenantId);
        if (current >= limit) {
            throw new AppException("Limite de serviços atingido para o plano " + tenant.getPlan().getValue(),
                    403, "PLAN_LIMIT_REACHED");
        }

        ServiceOffering entity = ServiceOffering.builder()
                .tenantId(tenantId)
                .name(request.name())
                .description(request.description())
                .price(request.price())
                .duration(request.duration())
                .category(request.category())
                .isActive(request.isActive() == null || request.isActive())
                .build();

        ServiceOffering saved = serviceOfferingRepository.save(entity);
        // Sem vínculo o serviço não aparece para o cliente: já nasce disponível para os profissionais atuais
        // (o dono ajusta em Profissionais).
        linkRepository.saveAll(professionalRepository.findByTenantIdOrderByNameAsc(tenantId).stream()
                .map(p -> ProfessionalServiceLink.of(p.getId(), saved.getId()))
                .toList());
        return ServiceResponse.from(saved);
    }

    @Transactional
    public ServiceResponse update(UUID tenantId, UUID id, ServiceUpdateRequest request) {
        ServiceOffering existing = serviceOfferingRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> AppException.notFound("Serviço não encontrado"));

        if (request.name() != null) existing.setName(request.name());
        if (request.description() != null) existing.setDescription(request.description());
        if (request.price() != null) existing.setPrice(request.price());
        if (request.duration() != null) existing.setDuration(request.duration());
        if (request.category() != null) existing.setCategory(request.category());
        if (request.isActive() != null) existing.setIsActive(request.isActive());

        return ServiceResponse.from(serviceOfferingRepository.save(existing));
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        ServiceOffering existing = serviceOfferingRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> AppException.notFound("Serviço não encontrado"));
        long upcoming = appointmentRepository.countUpcomingByService(tenantId, id, java.time.LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")).toString());
        if (upcoming > 0) {
            throw new AppException("Este serviço tem " + upcoming + (upcoming == 1 ? " agendamento futuro" : " agendamentos futuros")
                    + ". Cancele ou remarque antes de excluir.", 409, "HAS_UPCOMING_APPOINTMENTS");
        }
        serviceOfferingRepository.delete(existing);
    }
}

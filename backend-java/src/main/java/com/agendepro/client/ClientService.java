package com.agendepro.client;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentRepository;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.catalog.ServiceOfferingRepository;
import com.agendepro.common.AppException;
import com.agendepro.professional.Professional;
import com.agendepro.professional.ProfessionalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.agendepro.client.ClientDtos.*;

/** Porta de client.controller.ts. */
@Service
@RequiredArgsConstructor
public class ClientService {

    private final ClientRepository clientRepository;
    private final AppointmentRepository appointmentRepository;
    private final ServiceOfferingRepository serviceOfferingRepository;
    private final ProfessionalRepository professionalRepository;

    @Transactional(readOnly = true)
    public List<ClientResponse> list(UUID tenantId, String search) {
        return clientRepository.search(tenantId, search).stream()
                .map(c -> ClientResponse.from(c, appointmentRepository.countByClientId(c.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public ClientDetailResponse getDetail(UUID tenantId, UUID id) {
        Client client = clientRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> AppException.notFound("Cliente não encontrado"));

        List<Appointment> appointments = appointmentRepository.findByTenantIdAndClientIdOrderByDateAscStartTimeAsc(tenantId, id)
                .stream().sorted(Comparator.comparing(Appointment::getDate).reversed()).toList();

        Map<UUID, ServiceOffering> services = serviceOfferingRepository
                .findAllById(appointments.stream().map(Appointment::getServiceId).toList())
                .stream().collect(Collectors.toMap(ServiceOffering::getId, s -> s));
        Map<UUID, Professional> professionals = professionalRepository
                .findAllById(appointments.stream().map(Appointment::getProfessionalId).toList())
                .stream().collect(Collectors.toMap(Professional::getId, p -> p));

        List<AppointmentHistoryItem> history = appointments.stream().map(a -> {
            ServiceOffering s = services.get(a.getServiceId());
            Professional p = professionals.get(a.getProfessionalId());
            return new AppointmentHistoryItem(
                    a.getId(), a.getDate(), a.getStartTime(), a.getEndTime(), a.getStatus().getValue(), a.getPrice(), a.getNotes(),
                    s == null ? null : new ServiceRef(s.getId(), s.getName(), s.getDuration(), s.getPrice()),
                    p == null ? null : new ProfessionalRef(p.getId(), p.getName(), p.getSpecialty()));
        }).toList();

        return new ClientDetailResponse(client.getId(), client.getTenantId(), client.getName(), client.getEmail(),
                client.getPhone(), client.getEmailVerified(), client.getCreatedAt(), client.getUpdatedAt(), history);
    }

    @Transactional
    public ClientResponse create(UUID tenantId, ClientCreateRequest request) {
        com.agendepro.publicapi.PublicService.requireValidPhone(request.phone());
        Client client = clientRepository.save(Client.builder()
                .tenantId(tenantId).name(request.name()).email(request.email()).phone(request.phone()).build());
        return ClientResponse.from(client);
    }

    @Transactional
    public ClientResponse update(UUID tenantId, UUID id, ClientUpdateRequest request) {
        Client client = clientRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> AppException.notFound("Cliente não encontrado"));

        if (request.name() != null) client.setName(request.name());
        if (request.email() != null) client.setEmail(request.email());
        if (request.phone() != null) {
            com.agendepro.publicapi.PublicService.requireValidPhone(request.phone());
            client.setPhone(request.phone());
        }

        return ClientResponse.from(clientRepository.save(client));
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Client client = clientRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> AppException.notFound("Cliente não encontrado"));
        long upcoming = appointmentRepository.countUpcomingByClient(tenantId, id, java.time.LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")).toString());
        if (upcoming > 0) {
            throw new AppException("Este cliente tem " + upcoming + (upcoming == 1 ? " agendamento futuro" : " agendamentos futuros")
                    + ". Cancele ou remarque antes de excluir.", 409, "HAS_UPCOMING_APPOINTMENTS");
        }
        clientRepository.delete(client);
    }

    /**
     * Cliente do balcão: casa pelo celular (é a identidade do cliente no Nimbo) e, se não achar, pelo e-mail informado.
     * Quem já existe é reaproveitado SEM trocar nome nem celular (o dono pode digitar de outro jeito); só completa o que
     * faltava. Sem cadastro, cria um novo (e-mail é opcional).
     */
    @Transactional
    public Client findOrCreateByContact(UUID tenantId, String name, String phone, String email) {
        String cleanEmail = email == null || email.isBlank() ? null : email.trim();
        String e164 = Client.normalizePhone(phone);
        Client existing = e164 == null ? null
                : clientRepository.findFirstByTenantIdAndPhoneE164OrderByCreatedAtAsc(tenantId, e164).orElse(null);
        Client byEmail = cleanEmail == null ? null : clientRepository.findByTenantIdAndEmail(tenantId, cleanEmail).orElse(null);
        if (existing == null) existing = byEmail;

        if (existing != null) {
            boolean changed = false;
            if ((existing.getEmail() == null || existing.getEmail().isBlank()) && cleanEmail != null && byEmail == null) {
                existing.setEmail(cleanEmail);
                changed = true;
            }
            if (existing.getPhone() == null || existing.getPhone().isBlank()) {
                existing.setPhone(phone.trim());
                changed = true;
            }
            return changed ? clientRepository.save(existing) : existing;
        }
        return clientRepository.save(Client.builder()
                .tenantId(tenantId).name(name.trim()).email(cleanEmail).phone(phone.trim()).build());
    }
}

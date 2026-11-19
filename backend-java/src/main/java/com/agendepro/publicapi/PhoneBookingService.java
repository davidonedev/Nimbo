package com.agendepro.publicapi;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentRepository;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.appointment.PgAdvisoryLockService;
import com.agendepro.appointment.ScheduleService;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.catalog.ServiceOfferingRepository;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.common.AppException;
import com.agendepro.notification.WhatsappService;
import com.agendepro.professional.Professional;
import com.agendepro.professional.ProfessionalRepository;
import com.agendepro.tenant.Tenant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

import static com.agendepro.publicapi.PhoneBookingDtos.*;

/**
 * Agendamento público por celular (tela padrão de todos os tenants): Nome + Celular, código de 6 dígitos por
 * WhatsApp na primeira vez e aparelho reconhecido depois. Não usa e-mail nem senha.
 *
 * <p>O agendamento só é gravado depois que o código confere (ou direto, se o aparelho já é reconhecido
 * para aquele celular). A disponibilidade reaproveita {@link PublicService#getAvailableSlots}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PhoneBookingService {

    private static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    private static final SecureRandom RANDOM = new SecureRandom();

    static final int MAX_ADVANCE_DAYS = 60;
    static final int MAX_DAYS_PER_REQUEST = 31;
    static final Duration CODE_TTL = Duration.ofMinutes(10);
    static final Duration RESEND_COOLDOWN = Duration.ofSeconds(30);
    static final Duration DEVICE_TTL = Duration.ofDays(90);
    static final int MAX_ATTEMPTS = 5;
    static final int MAX_SENDS = 3;
    static final int MAX_CHALLENGES_PER_HOUR = 5;

    private final PublicService publicService;
    private final ProfessionalRepository professionalRepository;
    private final ServiceOfferingRepository serviceOfferingRepository;
    private final AppointmentRepository appointmentRepository;
    private final ClientRepository clientRepository;
    private final BookingChallengeRepository challengeRepository;
    private final ClientDeviceRepository deviceRepository;
    private final WhatsappService whatsappService;
    private final PgAdvisoryLockService pgAdvisoryLockService;

    private final CaptchaService captchaService;
    private final BookingAttemptLimiter attemptLimiter;

    /** Prazo (minutos) para confirmar um agendamento pendente; passou, o horário é liberado (PendingExpiryService). */
    @org.springframework.beans.factory.annotation.Value("${app.pending.confirm-minutes:120}")
    private int confirmMinutes;

    /** Horários pendentes ao mesmo tempo por celular (trava de abuso). */
    @org.springframework.beans.factory.annotation.Value("${app.booking.max-pending-per-client:3}")
    private int maxPendingPerClient;

    // ─── disponibilidade ────────────────────────────────────────────────────────

    /** Horários livres do dia para os serviços (juntos, em sequência). Sem profissional = união de todos que atendem. */
    @Transactional(readOnly = true)
    public List<String> slots(String slug, List<UUID> serviceIds, String date, UUID professionalId) {
        Tenant t = publicService.resolveTenant(slug);
        LocalDate day = parseDate(date);
        if (!t.getIsOpen() || !withinWindow(day)) return List.of();

        Set<String> times = new TreeSet<>();
        for (Professional p : eligibleProfessionals(t, serviceIds, professionalId)) {
            times.addAll(slotsFor(t, slug, p, serviceIds, day));
        }
        return List.copyOf(times);
    }

    /** Dias (yyyy-MM-dd) com ao menos um horário livre, a partir de {@code from}. */
    @Transactional(readOnly = true)
    public List<String> daysWithSlots(String slug, List<UUID> serviceIds, UUID professionalId, String from, int count) {
        Tenant t = publicService.resolveTenant(slug);
        if (!t.getIsOpen()) return List.of();
        LocalDate start = parseDate(from);
        int n = Math.max(1, Math.min(count, MAX_DAYS_PER_REQUEST));

        List<Professional> profs = eligibleProfessionals(t, serviceIds, professionalId);
        List<String> result = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            LocalDate day = start.plusDays(i);
            if (!withinWindow(day)) continue;
            for (Professional p : profs) {
                if (!slotsFor(t, slug, p, serviceIds, day).isEmpty()) {
                    result.add(day.toString());
                    break;
                }
            }
        }
        return result;
    }

    // ─── aparelho reconhecido ───────────────────────────────────────────────────

    @Transactional
    public PossessionResponse possession(String slug, String deviceToken) {
        Tenant t = publicService.resolveTenant(slug);
        Optional<ClientDevice> device = resolveDevice(t, deviceToken);
        if (device.isEmpty()) return PossessionResponse.none();

        Optional<Client> client = clientRepository.findByIdAndTenantId(device.get().getClientId(), t.getId());
        if (client.isEmpty()) return PossessionResponse.none();

        touch(device.get());
        UUID lastService = appointmentRepository
                .findByTenantIdAndClientIdOrderByDateAscStartTimeAsc(t.getId(), client.get().getId()).stream()
                .filter(a -> a.getStatus() != AppointmentStatus.CANCELLED)
                .reduce((first, second) -> second)
                .map(Appointment::getServiceId)
                .filter(id -> serviceOfferingRepository.findByIdAndTenantId(id, t.getId()).isPresent())
                .orElse(null);
        return new PossessionResponse(true, client.get().getName(), client.get().getPhone(), lastService);
    }

    // ─── pedido de agendamento ──────────────────────────────────────────────────

    /**
     * Pedido de agendamento (Nome + Celular). Três desfechos:
     * <ul>
     *   <li>aparelho já reconhecido para aquele celular → agenda direto ({@code booked});</li>
     *   <li>há WhatsApp configurado (do estabelecimento ou da plataforma) → manda o código ({@code challenge_required});</li>
     *   <li>não há (ou o envio falhou) → reserva o horário como PENDENTE, com prazo, e o cliente confirma pelo WhatsApp
     *       do estabelecimento ({@code pending_confirmation}).</li>
     * </ul>
     */
    @Transactional
    public BookResponse book(String slug, String deviceToken, BookRequest req, String clientIp) {
        Tenant t = publicService.resolveTenant(slug);
        if (!t.getIsOpen()) throw new AppException("Este estabelecimento está fechado para novos agendamentos.", 403, "CLOSED");
        captchaService.verify(req.captchaToken(), clientIp);
        attemptLimiter.check(clientIp);

        String phone = Client.normalizePhone(req.phone());
        if (phone == null || phone.length() < 12 || phone.length() > 13) {
            throw new AppException("Informe um celular válido com DDD.", 400, "INVALID_PHONE");
        }
        List<UUID> serviceIds = parseServiceIds(req.serviceIds());
        UUID professionalId = parseOptionalUuid(req.professionalId());
        LocalDate day = parseDate(req.date());
        String start = req.startTimeHHmm();

        // Falha cedo se o horário já não existe, antes de gastar um código de WhatsApp.
        boolean available = eligibleProfessionals(t, serviceIds, professionalId).stream()
                .anyMatch(p -> slotsFor(t, slug, p, serviceIds, day).contains(start));
        if (!available) throw slotTaken();

        Optional<Client> existing = clientRepository.findFirstByTenantIdAndPhoneE164OrderByCreatedAtAsc(t.getId(), phone);
        Optional<ClientDevice> device = resolveDevice(t, deviceToken);
        if (existing.isPresent() && device.isPresent() && device.get().getClientId().equals(existing.get().getId())) {
            touch(device.get());
            BookedSummary summary = bookNow(t, slug, existing.get(), serviceIds, professionalId, req.date(), start, req.notes());
            return BookResponse.booked(summary, toClient(existing.get()), null);
        }

        var whatsappConfig = new WhatsappService.TenantWhatsappConfig(t.getWhatsappApiUrl(), t.getWhatsappApiKey(), t.getWhatsappInstance());
        if (!whatsappService.isAvailable(whatsappConfig)) {
            return bookPending(t, slug, existing, req, phone, serviceIds, professionalId, start);
        }

        long recent = challengeRepository.countByTenantIdAndPhoneE164AndCreatedAtAfter(t.getId(), phone, Instant.now().minus(Duration.ofHours(1)));
        if (recent >= MAX_CHALLENGES_PER_HOUR) {
            throw new AppException("Muitos códigos pedidos para este celular. Tente novamente em alguns minutos.", 429, "TOO_MANY_CODES");
        }

        String code = newCode();
        BookingChallenge challenge = BookingChallenge.builder()
                .tenantId(t.getId()).phoneE164(phone).clientName(req.name().trim())
                .professionalId(professionalId)
                .serviceIds(serviceIds.stream().map(UUID::toString).collect(Collectors.joining(",")))
                .date(req.date()).startTime(start).notes(blankToNull(req.notes()))
                .codeHash("pending").expiresAt(Instant.now().plus(CODE_TTL)).build();
        challenge = challengeRepository.save(challenge);
        challenge.setCodeHash(hashCode(challenge.getId(), code));
        challengeRepository.save(challenge);

        if (sendCode(t, phone, code) == WhatsappService.SendResult.SENT) {
            return BookResponse.challenge(challenge.getId(), maskPhone(phone), challenge.getExpiresAt());
        }
        // O WhatsApp está configurado mas não enviou (instância desconectada, API fora do ar...): não trava o cliente,
        // segue pelo caminho de confirmação pelo WhatsApp do estabelecimento.
        log.warn("[booking] WhatsApp configurado não enviou o código ({}); seguindo com confirmação pendente", t.getSlug());
        challengeRepository.delete(challenge);
        return bookPending(t, slug, existing, req, phone, serviceIds, professionalId, start);
    }

    /** Reserva como pendente (com prazo) e devolve o necessário para o cliente confirmar pelo WhatsApp do estabelecimento. */
    private BookResponse bookPending(Tenant t, String slug, Optional<Client> existing, BookRequest req, String phone,
                                     List<UUID> serviceIds, UUID professionalId, String start) {
        Client client = existing.orElse(null);
        // Conta os que ainda aguardam o cliente (com prazo) e os que o cliente já confirmou (sem prazo, aguardando o dono).
        if (client != null
                && appointmentRepository.countByTenantIdAndClientIdAndStatusAndConfirmByIsNotNull(t.getId(), client.getId(), AppointmentStatus.PENDING)
                 + appointmentRepository.countByTenantIdAndClientIdAndStatusAndClientConfirmedAtIsNotNull(t.getId(), client.getId(), AppointmentStatus.PENDING) >= maxPendingPerClient) {
            throw new AppException("Você já tem " + maxPendingPerClient + " horários aguardando confirmação. Confirme um deles pelo WhatsApp ou aguarde.",
                    429, "TOO_MANY_PENDING");
        }
        if (client == null) {
            client = clientRepository.save(Client.builder()
                    .tenantId(t.getId()).name(req.name().trim()).phone(formatPhone(phone)).build());
        }
        // Sem telefone cadastrado no estabelecimento o cliente não tem para onde mandar a confirmação: sem prazo, o dono confirma.
        // O prazo do cliente nunca passa do horário marcado.
        Instant confirmBy = t.getPhone() == null || t.getPhone().isBlank() ? null
                : earliest(Instant.now().plus(Duration.ofMinutes(confirmMinutes)), startInstant(req.date(), start));
        BookedSummary summary = bookNow(t, slug, client, serviceIds, professionalId, req.date(), start, req.notes(), confirmBy);
        return BookResponse.pending(summary, toClient(client), confirmBy);
    }

    /**
     * O cliente tocou em "Confirmar no WhatsApp": ele cumpriu a parte dele, então o prazo some (confirm_by = null) e o
     * horário fica reservado até o dono decidir. Só vale para pendentes ainda no prazo do cliente; repetir não muda nada.
     */
    @Transactional
    public ClientConfirmedResponse clientConfirmed(String slug, List<UUID> appointmentIds) {
        Tenant t = publicService.resolveTenant(slug);
        Instant now = Instant.now();
        int confirmed = 0;
        for (Appointment a : appointmentRepository.findByTenantIdAndIdIn(t.getId(), appointmentIds)) {
            if (a.getStatus() != AppointmentStatus.PENDING) continue;
            boolean alreadyConfirmed = a.getClientConfirmedAt() != null; // repetir o toque é inofensivo
            boolean withinClientDeadline = a.getConfirmBy() != null && a.getConfirmBy().isAfter(now);
            if (!alreadyConfirmed && !withinClientDeadline) continue;
            if (!alreadyConfirmed) {
                a.setClientConfirmedAt(now);
                a.setConfirmBy(null); // sem prazo: o dono confirma quando puder
                appointmentRepository.save(a);
            }
            confirmed++;
        }
        return new ClientConfirmedResponse(confirmed);
    }

    private static Instant startInstant(String date, String hhmm) {
        return java.time.LocalDateTime.parse(date + "T" + hhmm).atZone(SAO_PAULO).toInstant();
    }

    private static Instant earliest(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    /**
     * Confere o código e cria o agendamento. O contador de tentativas precisa sobreviver ao erro (noRollbackFor);
     * por isso nenhuma escrita de "sucesso" acontece antes da checagem do código.
     */
    @Transactional(noRollbackFor = AppException.class)
    public BookResponse verify(String slug, VerifyRequest req) {
        Tenant t = publicService.resolveTenant(slug);
        BookingChallenge ch = challengeRepository.findByIdAndTenantId(req.challengeId(), t.getId())
                .orElseThrow(() -> AppException.notFound("Pedido não encontrado. Volte e escolha o horário de novo."));

        if (ch.getConsumedAt() != null) throw new AppException("Este código já foi usado.", 400, "CHALLENGE_USED");
        if (ch.getExpiresAt().isBefore(Instant.now())) {
            throw new AppException("Código expirado. Peça um novo código.", 400, "CODE_EXPIRED");
        }
        if (ch.getAttempts() >= MAX_ATTEMPTS) {
            throw new AppException("Muitas tentativas. Peça um novo código.", 429, "TOO_MANY_ATTEMPTS");
        }
        if (!codeMatches(ch, req.code())) {
            ch.setAttempts(ch.getAttempts() + 1);
            challengeRepository.save(ch);
            throw new AppException("Código incorreto.", 400, "INVALID_CODE");
        }

        Client client = clientRepository.findFirstByTenantIdAndPhoneE164OrderByCreatedAtAsc(t.getId(), ch.getPhoneE164())
                .orElseGet(() -> clientRepository.save(Client.builder()
                        .tenantId(t.getId()).name(ch.getClientName()).phone(formatPhone(ch.getPhoneE164())).build()));

        List<UUID> serviceIds = Arrays.stream(ch.getServiceIds().split(",")).map(UUID::fromString).toList();
        BookedSummary summary = bookNow(t, slug, client, serviceIds, ch.getProfessionalId(), ch.getDate(), ch.getStartTime(), ch.getNotes());

        ch.setConsumedAt(Instant.now());
        challengeRepository.save(ch);
        return BookResponse.booked(summary, toClient(client), issueDevice(t, client));
    }

    @Transactional
    public ResendResponse resend(String slug, UUID challengeId) {
        Tenant t = publicService.resolveTenant(slug);
        BookingChallenge ch = challengeRepository.findByIdAndTenantId(challengeId, t.getId())
                .orElseThrow(() -> AppException.notFound("Pedido não encontrado. Volte e escolha o horário de novo."));
        if (ch.getConsumedAt() != null) throw new AppException("Este código já foi usado.", 400, "CHALLENGE_USED");
        if (ch.getSendCount() >= MAX_SENDS) {
            throw new AppException("Limite de reenvios atingido. Volte e comece de novo.", 429, "TOO_MANY_CODES");
        }
        if (ch.getLastSentAt().plus(RESEND_COOLDOWN).isAfter(Instant.now())) {
            throw new AppException("Aguarde alguns segundos para pedir outro código.", 429, "RESEND_TOO_SOON");
        }

        String code = newCode();
        ch.setCodeHash(hashCode(ch.getId(), code));
        ch.setAttempts(0);
        ch.setSendCount(ch.getSendCount() + 1);
        ch.setLastSentAt(Instant.now());
        ch.setExpiresAt(Instant.now().plus(CODE_TTL));
        challengeRepository.save(ch);

        if (sendCode(t, ch.getPhoneE164(), code) != WhatsappService.SendResult.SENT) {
            throw new AppException("Não conseguimos enviar o código por WhatsApp agora. Tente de novo em instantes.", 502, "WHATSAPP_SEND_FAILED");
        }
        return new ResendResponse(maskPhone(ch.getPhoneE164()), ch.getExpiresAt());
    }

    // ─── criação do agendamento ─────────────────────────────────────────────────

    /** Grava os agendamentos em sequência com o primeiro profissional (ou o escolhido) que ainda tem o horário. */
    private BookedSummary bookNow(Tenant t, String slug, Client client, List<UUID> serviceIds, UUID professionalId,
                                  String date, String start, String notes) {
        return bookNow(t, slug, client, serviceIds, professionalId, date, start, notes, null);
    }

    private BookedSummary bookNow(Tenant t, String slug, Client client, List<UUID> serviceIds, UUID professionalId,
                                  String date, String start, String notes, Instant confirmBy) {
        List<ServiceOffering> found = serviceOfferingRepository.findByIdInAndTenantId(serviceIds, t.getId());
        if (found.size() != new HashSet<>(serviceIds).size()) throw AppException.notFound("Um ou mais serviços não encontrados.");
        List<ServiceOffering> ordered = publicService.orderServices(serviceIds, found);
        int totalDuration = ordered.stream().mapToInt(ServiceOffering::getDuration).sum();
        double totalPrice = ordered.stream().mapToDouble(ServiceOffering::getPrice).sum();
        LocalDate day = parseDate(date);

        for (Professional p : eligibleProfessionals(t, serviceIds, professionalId)) {
            pgAdvisoryLockService.lockProfessionalSchedule(p.getId(), date);
            if (!slotsFor(t, slug, p, serviceIds, day).contains(start)) continue;

            List<Appointment> created = publicService.createChainedAppointments(t.getId(), client.getId(), p.getId(), ordered, date, start, notes, confirmBy);
            List<BookedItem> items = new ArrayList<>();
            for (int i = 0; i < created.size(); i++) {
                Appointment a = created.get(i);
                items.add(new BookedItem(a.getId(), a.getServiceId(), ordered.get(i).getName(), a.getStartTime(), a.getEndTime(), a.getPrice()));
            }
            return new BookedSummary(date, p.getId(), p.getName(), totalDuration, totalPrice, items);
        }
        throw slotTaken();
    }

    // ─── disponibilidade (helpers) ──────────────────────────────────────────────

    /** Profissionais que fazem TODOS os serviços (e o escolhido, se houver). */
    private List<Professional> eligibleProfessionals(Tenant t, List<UUID> serviceIds, UUID professionalId) {
        Map<UUID, Professional> common = null;
        for (UUID serviceId : new LinkedHashSet<>(serviceIds)) {
            Map<UUID, Professional> forService = professionalRepository.findByTenantIdAndServiceId(t.getId(), serviceId).stream()
                    .collect(Collectors.toMap(Professional::getId, p -> p, (a, b) -> a, LinkedHashMap::new));
            if (common == null) common = forService;
            else common.keySet().retainAll(forService.keySet());
        }
        if (common == null) return List.of();
        if (professionalId != null) {
            Professional chosen = common.get(professionalId);
            if (chosen == null) throw AppException.notFound("Profissional não encontrado para estes serviços.");
            return List.of(chosen);
        }
        return new ArrayList<>(common.values());
    }

    /** Horários livres de um profissional num dia, já sem os que passaram ou estão dentro da antecedência mínima. */
    private List<String> slotsFor(Tenant t, String slug, Professional p, List<UUID> serviceIds, LocalDate day) {
        String csv = serviceIds.stream().map(UUID::toString).collect(Collectors.joining(","));
        List<String> all = publicService.getAvailableSlots(slug, p.getId(), null, csv, day.toString());
        if (!day.equals(LocalDate.now(SAO_PAULO))) return all;

        LocalTime now = LocalTime.now(SAO_PAULO);
        int earliest = now.getHour() * 60 + now.getMinute() + (t.getMinAdvanceMinutes() == null ? 0 : t.getMinAdvanceMinutes());
        return all.stream().filter(s -> ScheduleService.toMinutes(s) > earliest).toList();
    }

    private static boolean withinWindow(LocalDate day) {
        LocalDate today = LocalDate.now(SAO_PAULO);
        return !day.isBefore(today) && !day.isAfter(today.plusDays(MAX_ADVANCE_DAYS));
    }

    // ─── código e aparelho ──────────────────────────────────────────────────────

    /** Envia o código por WhatsApp e devolve o resultado; quem chama decide o que fazer se não saiu. */
    private WhatsappService.SendResult sendCode(Tenant t, String phone, String code) {
        String text = "*" + code + "* é o seu código de confirmação em *" + t.getName() + "*.\n\n"
                + "Ele vale por 10 minutos. Se você não pediu um agendamento, ignore esta mensagem.";
        var config = new WhatsappService.TenantWhatsappConfig(t.getWhatsappApiUrl(), t.getWhatsappApiKey(), t.getWhatsappInstance());
        return whatsappService.sendNow(config, phone, text);
    }

    private static String newCode() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    private static boolean codeMatches(BookingChallenge ch, String code) {
        byte[] expected = ch.getCodeHash().getBytes(StandardCharsets.UTF_8);
        byte[] actual = hashCode(ch.getId(), code.trim()).getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, actual);
    }

    private static String hashCode(UUID challengeId, String code) {
        return sha256(challengeId + ":" + code);
    }

    private Optional<ClientDevice> resolveDevice(Tenant t, String token) {
        if (token == null || token.isBlank() || token.length() > 200) return Optional.empty();
        return deviceRepository.findByTokenHashAndTenantId(sha256(token.trim()), t.getId())
                .filter(d -> d.getExpiresAt().isAfter(Instant.now()));
    }

    private void touch(ClientDevice device) {
        device.setLastUsedAt(Instant.now());
        device.setExpiresAt(Instant.now().plus(DEVICE_TTL));
        deviceRepository.save(device);
    }

    /** Cria um aparelho reconhecido e devolve o token em claro (só aqui; no banco fica o hash). */
    private String issueDevice(Tenant t, Client client) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        deviceRepository.save(ClientDevice.builder()
                .tenantId(t.getId()).clientId(client.getId()).tokenHash(sha256(token))
                .expiresAt(Instant.now().plus(DEVICE_TTL)).build());
        return token;
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ─── utilidades ─────────────────────────────────────────────────────────────

    private static AppException slotTaken() {
        return new AppException("Esse horário acabou de ser ocupado. Escolha outro.", 409, "SCHEDULE_CONFLICT");
    }

    private static BookedClient toClient(Client c) {
        return new BookedClient(c.getId(), c.getName(), c.getPhone());
    }

    private static LocalDate parseDate(String date) {
        try {
            return LocalDate.parse(date);
        } catch (DateTimeParseException e) {
            throw AppException.badRequest("Data inválida.");
        }
    }

    private static List<UUID> parseServiceIds(List<String> raw) {
        try {
            List<UUID> ids = raw.stream().map(UUID::fromString).toList();
            if (new HashSet<>(ids).size() != ids.size()) throw AppException.badRequest("Serviço repetido.");
            return ids;
        } catch (IllegalArgumentException e) {
            throw AppException.badRequest("Serviço inválido.");
        }
    }

    private static UUID parseOptionalUuid(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw AppException.badRequest("Profissional inválido.");
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** "5519981794567" → "(19) 98179-4567". */
    static String formatPhone(String e164) {
        String national = e164.startsWith("55") ? e164.substring(2) : e164;
        String ddd = national.substring(0, 2);
        String number = national.substring(2);
        int cut = number.length() - 4;
        return "(" + ddd + ") " + number.substring(0, cut) + "-" + number.substring(cut);
    }

    /** "5519981794567" → "(19) •••••-••67": mostra só o DDD e os 2 últimos dígitos. */
    static String maskPhone(String e164) {
        String national = e164.startsWith("55") ? e164.substring(2) : e164;
        return "(" + national.substring(0, 2) + ") •••••-••" + national.substring(national.length() - 2);
    }
}

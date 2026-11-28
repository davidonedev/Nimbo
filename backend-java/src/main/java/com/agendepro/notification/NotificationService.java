package com.agendepro.notification;

import com.agendepro.appointment.Appointment;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.catalog.ServiceOfferingRepository;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.notification.NotificationOutbox.Channel;
import com.agendepro.professional.Professional;
import com.agendepro.professional.ProfessionalRepository;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Enfileira os avisos do ciclo do agendamento. Só GRAVA na tabela notification_outbox, dentro da transação de quem
 * chama: o envio é do {@link NotificationDispatcher}, com nova tentativa se falhar. Por isso um provedor fora do ar
 * nunca derruba a operação, e repetir o mesmo evento não duplica a mensagem (chave de idempotência por canal).
 *
 * <p>Dono: e-mail do estabelecimento e WhatsApp do telefone cadastrado (este só sai se houver WhatsApp configurado).
 * Cliente: e-mail (se tiver) e WhatsApp do celular.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    public enum Event { NEW_REQUEST, CLIENT_REQUEST_RECEIVED, CLIENT_CANCELLED, CLIENT_RESCHEDULED, APPROVED, REFUSED, CANCELLED_BY_OWNER,
        REMINDER_24H, REMINDER_2H,
        PENDING_WARNING_OWNER, PENDING_WARNING_CLIENT, AUTO_CANCELLED_OWNER, AUTO_CANCELLED_CLIENT }

    private static final DateTimeFormatter BR_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Só WhatsApp por enquanto: com e-mail desligado nenhuma linha de e-mail entra na fila. */
    @org.springframework.beans.factory.annotation.Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    private final NotificationOutboxRepository outbox;
    private final TenantRepository tenantRepository;
    private final ClientRepository clientRepository;
    private final ProfessionalRepository professionalRepository;
    private final ServiceOfferingRepository serviceOfferingRepository;
    private final NotificationDispatcher dispatcher;

    @Value("${app.app-url}")
    private String appUrl;

    // ─── avisos ao dono ─────────────────────────────────────────────────────────

    /** Novo pedido do cliente. Os agendamentos encadeados (vários serviços) viram UMA mensagem. */
    @Transactional
    public void ownerNewRequest(List<Appointment> appointments) {
        forEachGroup(appointments, g -> notifyOwner(g, Event.NEW_REQUEST,
                "Novo pedido de agendamento: " + g.client().getName(),
                "Novo pedido de agendamento em " + g.tenant().getName() + ".", ""));
        dispatchAfterCommit();
    }

    @Transactional
    public void ownerClientCancelled(Appointment appointment) {
        forEachGroup(List.of(appointment), g -> notifyOwner(g, Event.CLIENT_CANCELLED,
                "Cliente cancelou: " + g.client().getName(),
                "O cliente cancelou o agendamento.", ""));
        dispatchAfterCommit();
    }

    /** {@code oldDate}/{@code oldStart}: horário anterior (yyyy-MM-dd e HH:mm), se conhecido. */
    @Transactional
    public void ownerClientRescheduled(Appointment appointment, String oldDate, String oldStart) {
        forEachGroup(List.of(appointment), g -> notifyOwner(g, Event.CLIENT_RESCHEDULED,
                "Cliente remarcou: " + g.client().getName(),
                "O cliente remarcou o agendamento para o horário abaixo.",
                oldDate == null ? "" : "Horário anterior: " + br(oldDate) + " às " + oldStart + "\n"));
        dispatchAfterCommit();
    }

    /**
     * 24 h antes do horário: o pedido segue pendente e será cancelado sozinho se ninguém decidir. Avisa o dono (para
     * aprovar ou recusar) e o cliente (para saber que ainda aguarda). Uma mensagem por reserva, uma vez só.
     */
    @Transactional
    public void pendingExpiryWarning(List<Appointment> appointments) {
        forEachGroup(appointments, g -> {
            notifyOwner(g, Event.PENDING_WARNING_OWNER,
                    "Pedido ainda pendente: " + g.client().getName(),
                    "Este pedido ainda não foi aprovado nem recusado e falta cerca de 1 dia para o horário. "
                            + "Se ninguém decidir, ele será cancelado automaticamente logo depois do horário marcado.", "", true);
            notifyClient(g, Event.PENDING_WARNING_CLIENT,
                    g.tenant().getName() + ": aguardando confirmação",
                    "Olá, " + firstName(g.client().getName()) + "! Seu pedido em " + g.tenant().getName() + " (" + g.services()
                            + ", " + br(g.date()) + " às " + g.start() + ") ainda aguarda a confirmação do estabelecimento. "
                            + "Se não for confirmado até o horário, será cancelado automaticamente. "
                            + "Para acompanhar ou cancelar: " + appUrl + "/" + g.tenant().getSlug() + "/meus-agendamentos");
        });
        dispatchAfterCommit();
    }

    /** O pedido ficou pendente até o horário passar e foi cancelado sozinho: avisa o dono e o cliente. */
    @Transactional
    public void pendingAutoCancelled(List<Appointment> appointments) {
        forEachGroup(appointments, g -> {
            notifyOwner(g, Event.AUTO_CANCELLED_OWNER,
                    "Pedido cancelado automaticamente: " + g.client().getName(),
                    "O pedido abaixo foi cancelado automaticamente: o horário passou sem que fosse aprovado ou recusado.", "", false);
            notifyClient(g, Event.AUTO_CANCELLED_CLIENT,
                    g.tenant().getName() + ": pedido cancelado",
                    "Olá, " + firstName(g.client().getName()) + ". Seu pedido de " + br(g.date()) + " às " + g.start()
                            + " em " + g.tenant().getName() + " não foi confirmado a tempo e foi cancelado automaticamente. "
                            + "Para escolher outro horário: " + appUrl + "/" + g.tenant().getSlug());
        });
        dispatchAfterCommit();
    }

    // ─── avisos ao cliente ──────────────────────────────────────────────────────

    /** O cliente fez o pedido (código do WhatsApp validado): confirma o recebimento e avisa que falta o estabelecimento aprovar. */
    @Transactional
    public void clientRequestReceived(List<Appointment> appointments) {
        forEachGroup(appointments, g -> notifyClient(g, Event.CLIENT_REQUEST_RECEIVED,
                g.tenant().getName() + ": recebemos o seu pedido",
                "Olá, " + firstName(g.client().getName()) + "! Recebemos o seu pedido em " + g.tenant().getName() + ": "
                        + g.services() + " com " + g.professional() + ", " + br(g.date()) + " às " + g.start() + ".\n"
                        + "Ele ainda precisa ser aprovado pelo estabelecimento. Assim que for, você recebe a confirmação aqui no WhatsApp.\n"
                        + "Para acompanhar ou cancelar: " + appUrl + "/" + g.tenant().getSlug() + "/meus-agendamentos"));
        dispatchAfterCommit();
    }

    /** Aprovação pelo dono. Recebe vários (confirmação em massa) e agrupa por cliente, dia e profissional. */
    @Transactional
    public void clientApproved(List<Appointment> appointments) {
        forEachGroup(appointments, g -> notifyClient(g, Event.APPROVED,
                g.tenant().getName() + ": horário confirmado",
                "Olá, " + firstName(g.client().getName()) + "! Seu horário em " + g.tenant().getName()
                        + " está confirmado: " + g.services() + " com " + g.professional() + ", "
                        + br(g.date()) + " às " + g.start() + "."
                        + (blank(g.tenant().getAddress()) ? "" : " Endereço: " + g.tenant().getAddress().trim() + ".")
                        + "\nPara ver, remarcar ou cancelar: " + appUrl + "/" + g.tenant().getSlug() + "/meus-agendamentos"));
        dispatchAfterCommit();
    }

    /** O dono recusou um pedido que ainda estava pendente. */
    @Transactional
    public void clientRefused(Appointment appointment) {
        forEachGroup(List.of(appointment), g -> notifyClient(g, Event.REFUSED,
                g.tenant().getName() + ": horário não confirmado",
                "Olá, " + firstName(g.client().getName()) + ". Não conseguimos atender " + br(g.date()) + " às " + g.start()
                        + " em " + g.tenant().getName() + ". Escolha outro horário: " + appUrl + "/" + g.tenant().getSlug()));
        dispatchAfterCommit();
    }

    /** O dono cancelou um horário que já estava confirmado (ou marcado como falta). */
    @Transactional
    public void clientCancelledByOwner(Appointment appointment) {
        forEachGroup(List.of(appointment), g -> notifyClient(g, Event.CANCELLED_BY_OWNER,
                g.tenant().getName() + ": horário cancelado",
                "Olá, " + firstName(g.client().getName()) + ". Seu horário de " + br(g.date()) + " às " + g.start()
                        + " em " + g.tenant().getName() + " foi cancelado. Para reagendar: " + appUrl + "/" + g.tenant().getSlug()));
        dispatchAfterCommit();
    }

    /**
     * Lembrete de 24 h ou 2 h antes. A chave é por agendamento: enfileirar de novo não duplica. Devolve false quando o
     * cliente não tem e-mail nem celular (nada a enviar).
     */
    @Transactional
    public boolean clientReminder(Appointment appointment, Tenant tenant, Client client, Event event, String text) {
        String phone = !blank(client.getPhoneE164()) ? client.getPhoneE164() : client.getPhone();
        if (blank(phone) && (!emailEnabled || blank(client.getEmail()))) return false;
        String subject = tenant.getName() + ": lembrete do seu horário";
        String key = event + ":" + appointment.getId() + ":" + appointment.getDate() + "T" + appointment.getStartTime();
        if (emailEnabled) enqueue(tenant, appointment.getId(), event, key, Channel.EMAIL, client.getEmail(), subject, text);
        enqueue(tenant, appointment.getId(), event, key, Channel.WHATSAPP, phone, subject, text);
        return true;
    }

    // ─── envio imediato ─────────────────────────────────────────────────────────

    /**
     * Pede o envio das mensagens recém-enfileiradas assim que a transação de quem chamou der commit (antes disso a
     * linha nem existe para outras conexões). Sem transação ativa, dispara na hora.
     */
    private void dispatchAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatcher.dispatchNow();
                }
            });
        } else {
            dispatcher.dispatchNow();
        }
    }

    // ─── montagem ───────────────────────────────────────────────────────────────

    /** Agendamentos seguidos do mesmo cliente, dia e profissional (uma reserva com vários serviços). */
    private record Group(Tenant tenant, Client client, List<Appointment> appointments, String services,
                         String professional, String date, String start) {
        UUID firstId() {
            return appointments.get(0).getId();
        }
    }

    private void forEachGroup(List<Appointment> appointments, java.util.function.Consumer<Group> action) {
        if (appointments == null || appointments.isEmpty()) return;
        try {
            Tenant tenant = tenantRepository.findById(appointments.get(0).getTenantId()).orElse(null);
            if (tenant == null) return;

            Map<UUID, Client> clients = clientRepository.findAllById(
                    appointments.stream().map(Appointment::getClientId).distinct().toList())
                    .stream().collect(Collectors.toMap(Client::getId, c -> c));
            Map<UUID, Professional> professionals = professionalRepository.findAllById(
                    appointments.stream().map(Appointment::getProfessionalId).distinct().toList())
                    .stream().collect(Collectors.toMap(Professional::getId, p -> p));
            Map<UUID, ServiceOffering> services = serviceOfferingRepository.findAllById(
                    appointments.stream().map(Appointment::getServiceId).distinct().toList())
                    .stream().collect(Collectors.toMap(ServiceOffering::getId, s -> s));

            Map<String, List<Appointment>> grouped = new LinkedHashMap<>();
            for (Appointment a : appointments) {
                grouped.computeIfAbsent(a.getClientId() + "|" + a.getDate() + "|" + a.getProfessionalId(), k -> new ArrayList<>()).add(a);
            }
            for (List<Appointment> list : grouped.values()) {
                list.sort(Comparator.comparing(Appointment::getStartTime));
                Appointment first = list.get(0);
                Client client = clients.get(first.getClientId());
                if (client == null) continue;
                Professional professional = professionals.get(first.getProfessionalId());
                String serviceNames = list.stream()
                        .map(a -> services.get(a.getServiceId()))
                        .filter(Objects::nonNull).map(ServiceOffering::getName)
                        .collect(Collectors.joining(" + "));
                action.accept(new Group(tenant, client, list, serviceNames.isEmpty() ? "seu atendimento" : serviceNames,
                        professional == null ? "a equipe" : professional.getName(), first.getDate(), first.getStartTime()));
            }
        } catch (RuntimeException ex) {
            // Falha ao montar a mensagem não pode impedir a operação principal (aprovar, cancelar...).
            log.error("[notificacoes] Não foi possível enfileirar o aviso: {}", ex.toString());
        }
    }

    private void notifyOwner(Group g, Event event, String subject, String intro, String extraLine) {
        notifyOwner(g, event, subject, intro, extraLine, true);
    }

    /** {@code withAction}: inclui o link para aprovar ou recusar (não faz sentido num aviso de pedido já cancelado). */
    private void notifyOwner(Group g, Event event, String subject, String intro, String extraLine, boolean withAction) {
        String body = intro + "\n\n"
                + "Cliente: " + g.client().getName() + "\n"
                + "Celular: " + (blank(g.client().getPhone()) ? "não informado" : g.client().getPhone()) + "\n"
                + "Serviço: " + g.services() + "\n"
                + "Quando: " + br(g.date()) + " às " + g.start() + "\n"
                + "Profissional: " + g.professional() + "\n"
                + extraLine
                + (withAction ? "\nAprovar ou recusar: " + appUrl + "/admin/appointments" : "");
        String key = event == Event.CLIENT_RESCHEDULED
                ? event + ":" + g.firstId() + ":" + g.date() + "T" + g.start()
                : event + ":" + g.firstId();
        Tenant t = g.tenant();
        if (emailEnabled) enqueue(t, g.firstId(), event, key, Channel.EMAIL, t.getEmail(), subject, body);
        enqueue(t, g.firstId(), event, key, Channel.WHATSAPP, ownerPhone(t), subject, body);
    }

    private void notifyClient(Group g, Event event, String subject, String text) {
        // Data e hora entram na chave: depois de remarcar, a nova aprovação é outra mensagem (não repetida)
        String key = event + ":" + g.firstId() + ":" + g.date() + "T" + g.start();
        Tenant t = g.tenant();
        if (emailEnabled) enqueue(t, g.firstId(), event, key, Channel.EMAIL, g.client().getEmail(), subject, text);
        String phone = !blank(g.client().getPhoneE164()) ? g.client().getPhoneE164() : g.client().getPhone();
        enqueue(t, g.firstId(), event, key, Channel.WHATSAPP, phone, subject, text);
    }

    private void enqueue(Tenant tenant, UUID appointmentId, Event event, String dedupeKey, Channel channel,
                         String recipient, String subject, String body) {
        if (blank(recipient)) return; // sem destino não há o que enviar
        String text = body.length() > 4000 ? body.substring(0, 4000) : body;
        outbox.insertIfAbsent(UUID.randomUUID(), tenant.getId(), appointmentId, event.name(), channel.name(),
                recipient.trim(), subject, text, dedupeKey);
    }

    /** Telefone do estabelecimento para o WhatsApp do dono; só com dígitos suficientes para ser um número. */
    private String ownerPhone(Tenant tenant) {
        String phone = tenant.getPhone();
        if (blank(phone)) return null;
        String digits = phone.replaceAll("\\D", "");
        if (digits.length() < 10) return null;
        return digits.startsWith("55") && digits.length() >= 12 ? digits : "55" + digits; // mesma regra de WhatsappService.normalizePhone
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String firstName(String name) {
        String trimmed = name == null ? "" : name.trim();
        int space = trimmed.indexOf(' ');
        return space < 0 ? trimmed : trimmed.substring(0, space);
    }

    private static String br(String isoDate) {
        return LocalDate.parse(isoDate).format(BR_DATE);
    }
}

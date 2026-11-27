package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.appointment.PendingExpiryService;
import com.agendepro.client.Client;
import com.agendepro.notification.NotificationOutbox.Channel;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pedido pendente: aviso 24 h antes ("segue pendente, será cancelado sozinho") e aviso do cancelamento automático,
 * para o dono e para o cliente. Usa um "agora" fixo em 2016 (nenhum outro teste usa esse ano) para não cruzar com dados de outros testes.
 */
class PendingExpiryNotificationsTest extends AuditBase {

    // 12:00 em Brasília (UTC-3) de 2016-06-10
    private static final Instant NOW = Instant.parse("2016-06-10T15:00:00Z");

    @Autowired private PendingExpiryService service;

    private Appointment pending(Ctx c, Client client, String day, String start, boolean clientDeadline) {
        Appointment a = appt(c, client, day, start, "23:59", AppointmentStatus.PENDING);
        if (clientDeadline) {
            a.setConfirmBy(NOW.plusSeconds(3600)); // ainda no prazo do cliente: ele nunca confirmou
            a = appointmentRepository.save(a);
        }
        return a;
    }

    @Test
    void warnsOwnerAndClientOnce_whenLessThan24HoursLeft_andOnlyForRequestsTheClientConfirmed() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment in22h = pending(c, client, "2016-06-11", "10:00", false);
        Appointment in25h = pending(c, client, "2016-06-11", "13:00", false);
        Appointment today = pending(c, client, "2016-06-10", "14:00", false);
        Appointment neverConfirmed = pending(c, client, "2016-06-11", "09:00", true); // prazo do cliente: número não provado
        Appointment confirmed = appt(c, client, "2016-06-11", "11:00", "11:30", AppointmentStatus.CONFIRMED);

        assertThat(service.warnBeforeExpiry(NOW)).isEqualTo(2);

        assertThat(reload(in22h).getExpiryWarnedAt()).isNotNull();
        assertThat(reload(today).getExpiryWarnedAt()).isNotNull();
        assertThat(reload(in25h).getExpiryWarnedAt()).isNull();
        assertThat(reload(neverConfirmed).getExpiryWarnedAt()).isNull();
        assertThat(reload(confirmed).getExpiryWarnedAt()).isNull();

        // o dono (e-mail e WhatsApp) e o cliente (WhatsApp) recebem; cada reserva gera uma mensagem
        assertThat(outboxOf(c.tenant, "PENDING_WARNING_OWNER", Channel.EMAIL)).hasSize(2);
        var toOwner = outboxOf(c.tenant, "PENDING_WARNING_OWNER", Channel.WHATSAPP);
        assertThat(toOwner).hasSize(2);
        assertThat(toOwner.get(0).getBody()).contains("cancelado automaticamente").contains("Aprovar ou recusar");
        var toClient = outboxOf(c.tenant, "PENDING_WARNING_CLIENT", Channel.WHATSAPP);
        assertThat(toClient).hasSize(2);
        assertThat(toClient).allMatch(n -> n.getRecipient().equals(e164(client.getPhone())));
        assertThat(toClient.get(0).getBody()).contains("cancelado automaticamente").contains("/meus-agendamentos");

        // repetir a rodada não reenvia
        assertThat(service.warnBeforeExpiry(NOW.plusSeconds(60))).isZero();
        assertThat(outboxOf(c.tenant, "PENDING_WARNING_CLIENT", Channel.WHATSAPP)).hasSize(2);
    }

    @Test
    void doesNotWarnAboutAnAppointmentThatAlreadyStarted() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment started = pending(c, client, "2016-06-10", "11:00", false);

        assertThat(service.warnBeforeExpiry(NOW)).isZero();
        assertThat(reload(started).getExpiryWarnedAt()).isNull();
    }

    @Test
    void bookingInsideTheWindowIsStampedAtCreation_soNoWarningFollowsRightAway() {
        Instant now = Instant.parse("2016-06-10T15:00:00Z");
        assertThat(PendingExpiryService.warnedStampFor("2016-06-11", "10:00", now)).isEqualTo(now);   // 22 h
        assertThat(PendingExpiryService.warnedStampFor("2016-06-11", "12:00", now)).isEqualTo(now);   // exatamente 24 h
        assertThat(PendingExpiryService.warnedStampFor("2016-06-11", "12:01", now)).isNull();         // 24 h e 1 min
        assertThat(PendingExpiryService.warnedStampFor("2016-07-01", "10:00", now)).isNull();
    }

    @Test
    void autoCancelNotifiesOwnerAndClient_whenTheClientHadConfirmed() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment stale = pending(c, client, "2016-06-10", "11:30", false); // 30 min atrás, sem prazo (cliente confirmou)

        assertThat(service.expirePastStart(NOW)).isGreaterThanOrEqualTo(1); // a busca é global: pode pegar pendentes antigos de outros testes

        assertThat(reload(stale).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        var toClient = outboxOf(c.tenant, "AUTO_CANCELLED_CLIENT", Channel.WHATSAPP);
        assertThat(toClient).hasSize(1);
        assertThat(toClient.get(0).getRecipient()).isEqualTo(e164(client.getPhone()));
        assertThat(toClient.get(0).getBody()).contains("cancelado automaticamente").contains("10/06/2016").contains("11:30");
        var toOwner = outboxOf(c.tenant, "AUTO_CANCELLED_OWNER", Channel.WHATSAPP);
        assertThat(toOwner).hasSize(1);
        assertThat(toOwner.get(0).getBody()).doesNotContain("Aprovar ou recusar");
        assertThat(outboxOf(c.tenant, "AUTO_CANCELLED_OWNER", Channel.EMAIL)).hasSize(1);
    }

    @Test
    void severalEstablishmentsInTheSameRound_eachGetsItsOwnMessages() {
        Ctx a = ctx();
        Ctx b = ctx();
        Client clientA = clientWithPhone(a.tenant, uniquePhone());
        Client clientB = clientWithPhone(b.tenant, uniquePhone());
        pending(a, clientA, "2016-06-10", "11:00", false);
        pending(b, clientB, "2016-06-10", "11:00", false);
        pending(a, clientA, "2016-06-11", "10:00", false); // faltam 22 h
        pending(b, clientB, "2016-06-11", "10:00", false);

        service.warnBeforeExpiry(NOW);
        service.expirePastStart(NOW);

        for (Ctx c : new Ctx[]{a, b}) {
            Client who = c == a ? clientA : clientB;
            var warn = outboxOf(c.tenant, "PENDING_WARNING_CLIENT", Channel.WHATSAPP);
            assertThat(warn).hasSize(1);
            assertThat(warn.get(0).getRecipient()).isEqualTo(e164(who.getPhone()));
            assertThat(warn.get(0).getBody()).contains(c.tenant.getName());
            var cancelled = outboxOf(c.tenant, "AUTO_CANCELLED_CLIENT", Channel.WHATSAPP);
            assertThat(cancelled).hasSize(1);
            assertThat(cancelled.get(0).getBody()).contains(c.tenant.getName());
            assertThat(outboxOf(c.tenant, "AUTO_CANCELLED_OWNER", Channel.WHATSAPP)).hasSize(1);
        }
    }

    @Test
    void autoCancelIsSilent_forAnUnprovenNumberThatNeverConfirmed() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment ghost = pending(c, client, "2016-06-10", "11:30", true); // ainda com prazo do cliente: nunca confirmou

        assertThat(service.expirePastStart(NOW)).isGreaterThanOrEqualTo(1); // a busca é global: pode pegar pendentes antigos de outros testes

        assertThat(reload(ghost).getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(outboxOf(c.tenant)).isEmpty(); // o dono nunca soube do pedido e o número do cliente não foi provado
    }
}

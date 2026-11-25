package com.agendepro.appointment;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Agendamento por celular sem código nasce "pendente" com prazo (confirm_by, 2 h por padrão). Se ninguém confirmou
 * até lá, o horário é liberado (vira cancelado) para não prender a agenda com pedidos que não foram confirmados.
 *
 * <p>Também cancela o pendente cujo horário já passou (inclusive o que o cliente confirmou, sem prazo, e o dono nunca
 * respondeu): passada a folga ({@code app.pending.past-grace-minutes}, 15 min) ele não vale mais nada.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PendingExpiryService {

    private static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");

    private final AppointmentRepository appointmentRepository;

    @Value("${app.pending.expiry-enabled:true}")
    private boolean enabled;

    /** Quanto tempo depois do início um pendente ainda é tolerado antes de ser cancelado. */
    @Value("${app.pending.past-grace-minutes:15}")
    private int pastGraceMinutes;

    // @Transactional aqui também: expire() é chamado de dentro da classe (sem passar pelo proxy) e o UPDATE exige transação.
    @Scheduled(fixedDelayString = "${app.pending.expiry-check-ms:60000}")
    @Transactional
    public void expireOnSchedule() {
        if (!enabled) return;
        Instant now = Instant.now();
        expire(now);
        expirePastStart(now);
    }

    @Transactional
    public int expire(Instant now) {
        int released = appointmentRepository.expireUnconfirmed(now);
        if (released > 0) log.info("[pendentes] {} horário(s) liberado(s) por falta de confirmação", released);
        return released;
    }

    /** Cancela os pendentes cujo início (Brasília) passou há mais que a folga. Devolve quantos foram cancelados. */
    @Transactional
    public int expirePastStart(Instant now) {
        ZonedDateTime cutoff = now.minus(Duration.ofMinutes(pastGraceMinutes)).atZone(SAO_PAULO);
        int cancelled = appointmentRepository.expirePastStart(now, cutoff.format(DATE_FMT), cutoff.format(TIME_FMT));
        if (cancelled > 0) log.info("[pendentes] {} pedido(s) pendente(s) cancelado(s): o horário já passou", cancelled);
        return cancelled;
    }
}

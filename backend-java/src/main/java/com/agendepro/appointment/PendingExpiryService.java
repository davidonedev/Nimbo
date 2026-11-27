package com.agendepro.appointment;

import com.agendepro.notification.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Agendamento por celular sem código nasce "pendente" com prazo (confirm_by, 2 h por padrão). Se ninguém confirmou
 * até lá, o horário é liberado (vira cancelado) para não prender a agenda com pedidos que não foram confirmados.
 *
 * <p>Também cancela o pendente cujo horário já passou (inclusive o que o cliente confirmou, sem prazo, e o dono nunca
 * respondeu): passada a folga ({@code app.pending.past-grace-minutes}, 15 min) ele não vale mais nada. Nesse caso o
 * dono e o cliente são avisados do cancelamento, e 24 h antes do horário os dois já recebem um aviso de que o pedido
 * segue pendente e será cancelado sozinho.
 *
 * <p>O pedido que o cliente nunca confirmou (celular digitado, sem código nem WhatsApp) é liberado em silêncio: o número
 * não foi provado, então nenhuma mensagem sai para ele e o dono nunca soube do pedido.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PendingExpiryService {

    private static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");

    /** Antecedência do aviso de cancelamento automático. */
    static final Duration WARN_BEFORE = Duration.ofHours(24);

    private final AppointmentRepository appointmentRepository;
    private final NotificationService notificationService;

    @Value("${app.pending.expiry-enabled:true}")
    private boolean enabled;

    /** Quanto tempo depois do início um pendente ainda é tolerado antes de ser cancelado. */
    @Value("${app.pending.past-grace-minutes:15}")
    private int pastGraceMinutes;

    // @Transactional aqui também: os métodos abaixo são chamados de dentro da classe (sem passar pelo proxy).
    @Scheduled(fixedDelayString = "${app.pending.expiry-check-ms:60000}")
    @Transactional
    public void expireOnSchedule() {
        if (!enabled) return;
        Instant now = Instant.now();
        expire(now);
        warnBeforeExpiry(now);
        expirePastStart(now);
    }

    @Transactional
    public int expire(Instant now) {
        int released = appointmentRepository.expireUnconfirmed(now);
        if (released > 0) log.info("[pendentes] {} horário(s) liberado(s) por falta de confirmação", released);
        return released;
    }

    /**
     * Cancela os pendentes cujo início (Brasília) passou há mais que a folga e avisa dono e cliente. Só quem sabia do
     * pedido é avisado (o cliente o confirmou pelo WhatsApp ou pelo código); o pedido sem prazo é o que o dono já viu.
     * Devolve quantos foram cancelados.
     */
    @Transactional
    public int expirePastStart(Instant now) {
        ZonedDateTime cutoff = now.minus(Duration.ofMinutes(pastGraceMinutes)).atZone(SAO_PAULO);
        List<Appointment> past = appointmentRepository.findPendingPastStart(cutoff.format(DATE_FMT), cutoff.format(TIME_FMT));
        if (past.isEmpty()) return 0;
        past.forEach(a -> a.setStatus(AppointmentStatus.CANCELLED));
        appointmentRepository.saveAll(past);
        // o aviso monta a mensagem com os dados de UM estabelecimento: o agendador mistura vários, então agrupa
        past.stream().filter(a -> a.getConfirmBy() == null).collect(Collectors.groupingBy(Appointment::getTenantId))
                .values().forEach(notificationService::pendingAutoCancelled);
        log.info("[pendentes] {} pedido(s) pendente(s) cancelado(s): o horário já passou", past.size());
        return past.size();
    }

    /**
     * Avisa o dono e o cliente, uma vez, quando falta 24 h ou menos para um pedido que segue pendente. Só entram os
     * pedidos que o cliente já deixou nas mãos do estabelecimento (sem prazo do cliente). Devolve quantos foram avisados.
     */
    @Transactional
    public int warnBeforeExpiry(Instant now) {
        LocalDate today = LocalDate.ofInstant(now, SAO_PAULO);
        List<String> dates = List.of(today.toString(), today.plusDays(1).toString());
        List<Appointment> due = new ArrayList<>();
        for (Appointment a : appointmentRepository.findByStatusAndConfirmByIsNullAndExpiryWarnedAtIsNullAndDateIn(AppointmentStatus.PENDING, dates)) {
            Instant start = startInstant(a.getDate(), a.getStartTime());
            if (!start.isAfter(now) || Duration.between(now, start).compareTo(WARN_BEFORE) > 0) continue;
            a.setExpiryWarnedAt(now);
            due.add(a);
        }
        if (due.isEmpty()) return 0;
        appointmentRepository.saveAll(due);
        due.stream().collect(Collectors.groupingBy(Appointment::getTenantId)).values().forEach(notificationService::pendingExpiryWarning);
        log.info("[pendentes] {} pedido(s) pendente(s) avisado(s): faltam 24 h ou menos", due.size());
        return due.size();
    }

    /**
     * Um pedido marcado para dentro da janela de 24 h não precisa do aviso (acabou de ser pedido). Quem cria ou remarca
     * grava o carimbo na hora para o aviso não sair logo em seguida.
     */
    public static Instant warnedStampFor(String date, String startTime, Instant now) {
        return Duration.between(now, startInstant(date, startTime)).compareTo(WARN_BEFORE) <= 0 ? now : null;
    }

    private static Instant startInstant(String date, String startTime) {
        return LocalDateTime.parse(date + "T" + startTime).atZone(SAO_PAULO).toInstant();
    }
}

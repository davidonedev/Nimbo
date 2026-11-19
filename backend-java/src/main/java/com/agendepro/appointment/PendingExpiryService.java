package com.agendepro.appointment;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Agendamento por celular sem código nasce "pendente" com prazo (confirm_by, 2 h por padrão). Se ninguém confirmou
 * até lá, o horário é liberado (vira cancelado) para não prender a agenda com pedidos que não foram confirmados.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PendingExpiryService {

    private final AppointmentRepository appointmentRepository;

    @Value("${app.pending.expiry-enabled:true}")
    private boolean enabled;

    // @Transactional aqui também: expire() é chamado de dentro da classe (sem passar pelo proxy) e o UPDATE exige transação.
    @Scheduled(fixedDelayString = "${app.pending.expiry-check-ms:60000}")
    @Transactional
    public void expireOnSchedule() {
        if (enabled) expire(Instant.now());
    }

    @Transactional
    public int expire(Instant now) {
        int released = appointmentRepository.expireUnconfirmed(now);
        if (released > 0) log.info("[pendentes] {} horário(s) liberado(s) por falta de confirmação", released);
        return released;
    }
}

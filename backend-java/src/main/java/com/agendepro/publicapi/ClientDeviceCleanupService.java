package com.agendepro.publicapi;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/** Apaga, uma vez por dia, os aparelhos reconhecidos que já expiraram (90 dias sem uso). */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClientDeviceCleanupService {

    private final ClientDeviceRepository deviceRepository;

    @Value("${app.devices.cleanup-enabled:true}")
    private boolean enabled;

    @Scheduled(initialDelayString = "${app.devices.cleanup-initial-delay-ms:300000}",
            fixedDelayString = "${app.devices.cleanup-interval-ms:86400000}")
    @Transactional // a auto-chamada abaixo não passa pelo proxy: sem isto o DELETE em lote falhava toda vez
    public void cleanOnSchedule() {
        if (enabled) deleteExpired(Instant.now());
    }

    @Transactional
    public int deleteExpired(Instant now) {
        int removed = deviceRepository.deleteExpired(now);
        if (removed > 0) log.info("[aparelhos] {} aparelho(s) expirado(s) apagado(s)", removed);
        return removed;
    }
}

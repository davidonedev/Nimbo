package com.agendepro.notification;

import com.agendepro.notification.NotificationOutbox.Channel;
import com.agendepro.notification.NotificationOutbox.Status;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Envia o que {@link NotificationService} enfileirou. Em três passos curtos, para não segurar uma conexão do pool
 * (são só 5 no Render) durante a chamada ao SMTP ou ao WhatsApp:
 * <ol>
 *   <li>reserva um lote (SELECT … FOR UPDATE SKIP LOCKED) e adia a próxima tentativa em 2 min — se o processo
 *       morrer no meio do envio, a mensagem volta sozinha;</li>
 *   <li>envia, fora de transação;</li>
 *   <li>grava o resultado: enviada, ignorada (canal indisponível, sem destino) ou nova tentativa com espera crescente.</li>
 * </ol>
 * As mensagens ficam no banco, então o serviço dormindo no Render só atrasa o envio; na volta o lote pendente sai.
 */
@Slf4j
@Service
public class NotificationDispatcher {

    static final int BATCH = 10;
    static final int MAX_BATCHES_PER_RUN = 5;
    static final Duration LEASE = Duration.ofMinutes(2);
    /** Espera depois da 1ª, 2ª, 3ª e 4ª falha; a última tentativa que falhar encerra a mensagem como FAILED. */
    static final List<Duration> BACKOFF = List.of(Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(15), Duration.ofHours(1));

    private final NotificationOutboxRepository outbox;
    private final TenantRepository tenantRepository;
    private final EmailService emailService;
    private final WhatsappService whatsappService;
    private final TransactionTemplate tx;

    @Value("${app.notifications.enabled:true}")
    private boolean enabled;

    @Value("${app.notifications.max-attempts:5}")
    private int maxAttempts;

    public NotificationDispatcher(NotificationOutboxRepository outbox, TenantRepository tenantRepository,
                                  EmailService emailService, WhatsappService whatsappService,
                                  PlatformTransactionManager transactionManager) {
        this.outbox = outbox;
        this.tenantRepository = tenantRepository;
        this.emailService = emailService;
        this.whatsappService = whatsappService;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Scheduled(fixedDelayString = "${app.notifications.check-interval-ms:15000}")
    public void runOnSchedule() {
        if (enabled) run(Instant.now());
    }

    /** Processa as mensagens devidas em {@code now}; devolve quantas foram tentadas. */
    public int run(Instant now) {
        Map<UUID, Tenant> tenants = new HashMap<>();
        int attempted = 0;
        for (int i = 0; i < MAX_BATCHES_PER_RUN; i++) {
            List<NotificationOutbox> batch = claim(now);
            if (batch.isEmpty()) break;
            for (NotificationOutbox row : batch) {
                process(row, now, tenants);
            }
            attempted += batch.size();
            if (batch.size() < BATCH) break;
        }
        return attempted;
    }

    private List<NotificationOutbox> claim(Instant now) {
        return tx.execute(status -> {
            List<UUID> ids = outbox.lockDueIds(now, BATCH);
            List<NotificationOutbox> rows = outbox.findAllById(ids);
            for (NotificationOutbox row : rows) {
                row.setAttempts(row.getAttempts() + 1);
                row.setNextAttemptAt(now.plus(LEASE));
            }
            return outbox.saveAll(rows);
        });
    }

    private enum Outcome { SENT, SKIPPED, FAILED }

    private record Result(Outcome outcome, String detail) {
    }

    private void process(NotificationOutbox row, Instant now, Map<UUID, Tenant> tenants) {
        Result result;
        try {
            result = send(row, tenants);
        } catch (RuntimeException ex) {
            log.error("[notificacoes] Erro inesperado ao enviar {} ({}): {}", row.getEvent(), row.getChannel(), ex.toString());
            result = new Result(Outcome.FAILED, ex.toString());
        }
        try {
            finish(row.getId(), result, now);
        } catch (RuntimeException ex) {
            // Não grava o resultado: a reserva (lease) expira e a mensagem volta para a fila.
            log.error("[notificacoes] Não foi possível gravar o resultado de {}: {}", row.getId(), ex.toString());
        }
    }

    private Result send(NotificationOutbox row, Map<UUID, Tenant> tenants) {
        if (row.getRecipient() == null || row.getRecipient().isBlank()) {
            return new Result(Outcome.SKIPPED, "sem destinatário");
        }
        if (row.getChannel() == Channel.EMAIL) {
            EmailService.SendResult sent = emailService.sendNow(row.getRecipient(), row.getSubject(), row.getBody());
            if (sent == null) return new Result(Outcome.FAILED, "e-mail sem resposta do serviço de envio");
            return switch (sent) {
                case SENT -> new Result(Outcome.SENT, null);
                case NOT_CONFIGURED -> new Result(Outcome.SKIPPED, "SMTP não configurado");
                case FAILED -> new Result(Outcome.FAILED, "falha no envio do e-mail");
            };
        }

        Tenant tenant = tenants.computeIfAbsent(row.getTenantId(), id -> tenantRepository.findById(id).orElse(null));
        if (tenant == null) return new Result(Outcome.SKIPPED, "estabelecimento não encontrado");
        var config = new WhatsappService.TenantWhatsappConfig(tenant.getWhatsappApiUrl(), tenant.getWhatsappApiKey(), tenant.getWhatsappInstance());
        if (!whatsappService.isAvailable(config)) return new Result(Outcome.SKIPPED, "WhatsApp não configurado");
        WhatsappService.SendResult sent = whatsappService.sendNow(config, row.getRecipient(), row.getBody());
        if (sent == null) return new Result(Outcome.FAILED, "WhatsApp sem resposta do serviço de envio");
        return switch (sent) {
            case SENT -> new Result(Outcome.SENT, null);
            case NOT_CONFIGURED -> new Result(Outcome.SKIPPED, "WhatsApp não configurado");
            case FAILED -> new Result(Outcome.FAILED, "falha no envio pelo WhatsApp");
        };
    }

    private void finish(UUID id, Result result, Instant now) {
        tx.executeWithoutResult(status -> outbox.findById(id).ifPresent(row -> {
            switch (result.outcome()) {
                case SENT -> {
                    row.setStatus(Status.SENT);
                    row.setSentAt(Instant.now());
                    row.setLastError(null);
                }
                case SKIPPED -> {
                    row.setStatus(Status.SKIPPED);
                    row.setLastError(result.detail());
                }
                case FAILED -> {
                    row.setLastError(result.detail());
                    if (row.getAttempts() >= maxAttempts) {
                        row.setStatus(Status.FAILED);
                    } else {
                        row.setStatus(Status.PENDING);
                        row.setNextAttemptAt(now.plus(BACKOFF.get(Math.min(row.getAttempts(), BACKOFF.size()) - 1)));
                    }
                }
            }
            outbox.save(row);
        }));
    }
}

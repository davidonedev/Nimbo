package com.agendepro.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface NotificationOutboxRepository extends JpaRepository<NotificationOutbox, UUID> {

    /**
     * Grava a mensagem; se já existe uma com a mesma (tenant, dedupe_key, canal) não faz nada.
     * Devolve 1 se gravou e 0 se era repetida. Nunca lança por duplicata, então não derruba a operação principal.
     */
    @Modifying
    @Query(value = """
            INSERT INTO notification_outbox (id, tenant_id, appointment_id, event, channel, recipient, subject, body, dedupe_key)
            VALUES (:id, :tenantId, :appointmentId, :event, :channel, :recipient, :subject, :body, :dedupeKey)
            ON CONFLICT (tenant_id, dedupe_key, channel) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(@Param("id") UUID id, @Param("tenantId") UUID tenantId, @Param("appointmentId") UUID appointmentId,
                       @Param("event") String event, @Param("channel") String channel, @Param("recipient") String recipient,
                       @Param("subject") String subject, @Param("body") String body, @Param("dedupeKey") String dedupeKey);

    /** Ids das mensagens devidas, travadas para este processo (outro dispatcher pula as travadas). Exige transação. */
    @Query(value = """
            SELECT id FROM notification_outbox
            WHERE status = 'PENDING' AND next_attempt_at <= :now
            ORDER BY next_attempt_at
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<UUID> lockDueIds(@Param("now") Instant now, @Param("limit") int limit);

    List<NotificationOutbox> findByTenantIdOrderByCreatedAtAsc(UUID tenantId);
}

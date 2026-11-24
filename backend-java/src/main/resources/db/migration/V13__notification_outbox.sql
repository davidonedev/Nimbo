-- ─── Fila de notificações (outbox) ──────────────────────────────────────────────
-- Idempotente. Quem muda o agendamento só grava aqui (na mesma transação); o envio acontece depois, em segundo
-- plano, com nova tentativa se falhar. Assim um provedor fora do ar não derruba a operação e nada se perde
-- enquanto o serviço dorme.

CREATE TABLE IF NOT EXISTS notification_outbox (
    id              UUID PRIMARY KEY,
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    appointment_id  UUID,
    event           VARCHAR(40)  NOT NULL,                 -- NEW_REQUEST, APPROVED, REFUSED...
    channel         VARCHAR(20)  NOT NULL,                 -- EMAIL | WHATSAPP
    recipient       VARCHAR(255),                          -- e-mail ou telefone
    subject         VARCHAR(255),
    body            TEXT         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING', -- PENDING | SENT | SKIPPED | FAILED
    attempts        INTEGER      NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_error      TEXT,
    dedupe_key      VARCHAR(120) NOT NULL,                 -- ex.: APPROVED:<id do agendamento>
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    CONSTRAINT uq_notification_outbox_dedupe UNIQUE (tenant_id, dedupe_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_due ON notification_outbox(status, next_attempt_at);

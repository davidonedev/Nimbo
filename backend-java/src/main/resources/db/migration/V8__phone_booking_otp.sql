-- ─── Agendamento público por celular (Nome + Celular + código por WhatsApp) ───
-- Idempotente. Cliente novo do portal não tem e-mail nem senha: a identidade é o celular
-- confirmado por código; o aparelho fica "reconhecido" por um token guardado (só o hash vai ao banco).

-- Cliente sem e-mail (criado pelo agendamento por celular). A UNIQUE (tenant_id, email) continua
-- valendo e aceita vários NULL no PostgreSQL.
ALTER TABLE clients ALTER COLUMN email DROP NOT NULL;

-- Celular normalizado (somente dígitos com DDI 55), mesmo formato de WhatsappService.normalizePhone.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(20);

UPDATE clients
SET phone_e164 = CASE
        WHEN regexp_replace(phone, '\D', '', 'g') ~ '^55.{10,}$' THEN regexp_replace(phone, '\D', '', 'g')
        ELSE '55' || regexp_replace(phone, '\D', '', 'g')
    END
WHERE phone IS NOT NULL
  AND phone_e164 IS NULL
  AND length(regexp_replace(phone, '\D', '', 'g')) >= 10;

CREATE INDEX IF NOT EXISTS idx_clients_tenant_phone_e164 ON clients(tenant_id, phone_e164);

-- ═══════════════════════════════════════════════════════════════════════════
-- booking_challenges — pedido de agendamento aguardando o código enviado por WhatsApp.
-- O agendamento só é criado depois que o código confere.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS booking_challenges (
    id              UUID PRIMARY KEY,
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_e164      VARCHAR(20)  NOT NULL,
    client_name     VARCHAR(150) NOT NULL,
    professional_id UUID,                      -- NULL = qualquer profissional (escolhido na confirmação)
    service_ids     TEXT         NOT NULL,     -- UUIDs separados por vírgula, na ordem escolhida
    date            VARCHAR(10)  NOT NULL,     -- yyyy-MM-dd (Brasília, como appointments.date)
    start_time      VARCHAR(5)   NOT NULL,     -- HH:mm
    notes           VARCHAR(500),
    code_hash       VARCHAR(64)  NOT NULL,     -- SHA-256 de "<id>:<código>"; o código nunca é guardado
    attempts        INTEGER      NOT NULL DEFAULT 0,
    send_count      INTEGER      NOT NULL DEFAULT 1,
    last_sent_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ  NOT NULL,
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_challenges_phone ON booking_challenges(tenant_id, phone_e164, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- client_devices — aparelho reconhecido (agenda sem pedir código de novo).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS client_devices (
    id           UUID PRIMARY KEY,
    tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    token_hash   VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 do token; o token só existe no aparelho
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_devices_client ON client_devices(client_id);

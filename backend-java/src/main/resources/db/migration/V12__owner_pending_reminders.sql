-- Aviso ao dono de agendamento que o cliente já confirmou pelo WhatsApp mas ele ainda não confirmou:
-- 2 h antes do horário e, se continuar pendente, 1 h antes. Os carimbos evitam avisar duas vezes.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS owner_remind_2h_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS owner_remind_1h_at TIMESTAMPTZ;

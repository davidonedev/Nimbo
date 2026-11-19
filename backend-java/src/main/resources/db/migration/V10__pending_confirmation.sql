-- Agendamento por celular sem código: nasce "pendente" e o cliente confirma mandando uma mensagem pelo WhatsApp do
-- estabelecimento. confirm_by = prazo para alguém confirmar; passou e continua pendente, o horário é liberado.
-- NULL = sem prazo (agendamentos criados pelo painel, pela tela antiga ou por estabelecimento sem telefone).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirm_by TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_appointments_confirm_by ON appointments(confirm_by) WHERE confirm_by IS NOT NULL;

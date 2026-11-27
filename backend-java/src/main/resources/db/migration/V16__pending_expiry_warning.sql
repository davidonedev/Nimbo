-- Aviso "este pedido ainda está pendente e será cancelado sozinho se ninguém decidir": sai 24 h antes do horário,
-- uma vez só. O carimbo evita repetir o aviso.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS expiry_warned_at TIMESTAMPTZ;

-- Pendente por celular: o cliente tem poucas horas para tocar em "Confirmar no WhatsApp"; depois que toca, o dono tem
-- um prazo maior (24 h) para confirmar. client_confirmed_at = quando o cliente disse que mandou a mensagem.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_confirmed_at TIMESTAMPTZ;

-- Intervalo diário do profissional (almoço): não aparece como horário livre para o cliente.
-- Os dois nulos = sem intervalo. Formato HH:mm, igual a working_hours_start/end.
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS break_start VARCHAR(5);
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS break_end   VARCHAR(5);

-- A foto do profissional é enviada pelo painel como imagem em data URL (base64), que passa de 2000 caracteres;
-- com VARCHAR(2000) o PATCH /api/admin/professionals/{id} falhava ao salvar qualquer foto real (e a tela mostrava
-- "Registro duplicado"). Mesmo ajuste que o V9 fez para o logo e o banner do estabelecimento.
ALTER TABLE professionals ALTER COLUMN photo_url TYPE TEXT;

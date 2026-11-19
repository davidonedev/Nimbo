-- Logo e banner do estabelecimento são enviados pelo painel como imagem em data URL (base64), que passa de
-- centenas de KB; com VARCHAR(500) o PATCH /api/admin/settings falhava ao salvar qualquer imagem.
ALTER TABLE tenants ALTER COLUMN logo_url   TYPE TEXT;
ALTER TABLE tenants ALTER COLUMN banner_url TYPE TEXT;

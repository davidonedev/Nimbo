-- ─── Reparo: profissional e serviço sem nenhum vínculo ──────────────────────────
-- O vínculo professional_services só nascia no formulário do profissional. Quem cadastrou o profissional sem marcar
-- serviço, ou criou o serviço depois, ficou com um estabelecimento em que o cliente não consegue agendar ("Nenhum
-- profissional faz todos esses serviços"). Idempotente: só mexe em quem está sem nenhum vínculo.

-- Profissional sem nenhum serviço: passa a atender todos os serviços do estabelecimento.
INSERT INTO professional_services (professional_id, service_id)
SELECT p.id, s.id
FROM professionals p
JOIN services s ON s.tenant_id = p.tenant_id
WHERE NOT EXISTS (SELECT 1 FROM professional_services l WHERE l.professional_id = p.id)
ON CONFLICT DO NOTHING;

-- Serviço sem nenhum profissional: passa a ser feito por todos os profissionais do estabelecimento.
INSERT INTO professional_services (professional_id, service_id)
SELECT p.id, s.id
FROM services s
JOIN professionals p ON p.tenant_id = s.tenant_id
WHERE NOT EXISTS (SELECT 1 FROM professional_services l WHERE l.service_id = s.id)
ON CONFLICT DO NOTHING;

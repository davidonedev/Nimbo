# Checklist de produção (Render + Vercel + Supabase)

Marque cada item antes de colocar um barbeiro real. Nenhum valor secreto aparece aqui: o repositório é público.

## 1. Contas e senhas
- [ ] Autenticação em dois fatores ligada em **GitHub, Render, Supabase e Vercel**.
- [ ] `JWT_SECRET` no Render é **novo, forte (32+ caracteres aleatórios) e nunca usado antes**. Trocar derruba as sessões abertas, é esperado.
- [ ] Não existem contas de demonstração no banco. No SQL Editor do Supabase:
  ```sql
  select email, role from users
  where email like '%@agendepro.com' or email like '%@barber-kings.com' or email like '%@navalha.com' or email like '%@vintage.com';
  ```
  Tem de voltar **vazio**. Se vier alguma linha, apague a conta ou troque a senha na hora.
- [ ] Existe um Super Admin **real**, com senha forte: `select email from users where role = 'super_admin';`

## 2. Variáveis no Render (nomes exatos; valores só no painel)
| Variável | Obrigatória | Observação |
|---|---|---|
| `JWT_SECRET` | sim | veja acima |
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | sim | Session pooler do Supabase |
| `CORS_ALLOWED_ORIGINS` | sim | a URL do front (ou o domínio novo), sem barra no final |
| `APP_URL` | sim | a URL pública do front: ela vai dentro das mensagens de WhatsApp |
| `WHATSAPP_DEFAULT_API_URL`, `WHATSAPP_DEFAULT_API_KEY`, `WHATSAPP_DEFAULT_INSTANCE` | sim | número **dedicado** ao Nimbo, não o pessoal |
| `TURNSTILE_SECRET_KEY` | **sim** | sem ela o agendamento fica aberto a robôs que gastam o seu WhatsApp (par: `VITE_TURNSTILE_SITE_KEY` na Vercel) |
| `SEED_ENABLED` | não | deixe **sem definir** ou `false` |
| `EMAIL_ENABLED` | não | deixe **sem definir** (só WhatsApp por enquanto) |
| `CLIENT_IP_PROXY_HOPS` | depois de testar | veja a seção 4 |

## 3. Variáveis na Vercel
- [ ] `VITE_API_URL` aponta para o backend (com ou sem `/api`).
- [ ] `VITE_TURNSTILE_SITE_KEY` definida.
- [ ] Em Preview, não apontar para o banco de produção.

## 4. Limites de tentativas e o IP real
Os limites (login, código de WhatsApp, agendamento) contam por IP. Atrás do proxy da hospedagem o IP vem no cabeçalho `X-Forwarded-For`, e só o que o **proxy da hospedagem** acrescenta é confiável.
1. Entre como Super Admin e chame `GET /api/super/diagnostics/client-ip` (o painel de rede do navegador mostra a resposta; use o seu token).
2. Olhe `xForwardedFor`: o IP real do seu celular/computador é o **último** valor da lista? Então defina `CLIENT_IP_PROXY_HOPS=1`. Se o último for um IP da hospedagem/CDN e o seu IP for o penúltimo, use `2`.
3. Repita a chamada depois do deploy: `ipUsedForLimits` tem de ser o **seu** IP.

Enquanto `CLIENT_IP_PROXY_HOPS` for 0, quem forja o cabeçalho escapa dos limites.

## 5. Servidor acordado e alerta
- [ ] UptimeRobot (ou similar) chamando **`/health/deep`** a cada 5 min: mantém o Render acordado (lembretes e cancelamentos automáticos só rodam acordado), mantém o Supabase ativo e **avisa no seu e-mail/celular** se o banco cair. Veja `docs/KEEP_ALIVE_RENDER.md`.
- [ ] Teste: confirme um agendamento para daqui a ~2 h e veja o lembrete chegar sem ninguém abrir o site.

## 6. Backup
- [ ] Rotina diária ativa e restauração testada: `docs/BACKUP_E_RESTAURACAO.md`.

## 7. Antes do primeiro cliente do barbeiro
- [ ] Plano do estabelecimento ajustado (o padrão BASIC limita a 3 serviços e 2 profissionais): Super Admin → estabelecimento → plano.
- [ ] WhatsApp do estabelecimento (telefone) cadastrado: é para ele que vai o aviso de pedido novo.
- [ ] Horário de funcionamento, almoço, serviços e profissionais cadastrados e um agendamento de teste feito do início ao fim no celular.
- [ ] O barbeiro sabe: o pedido fica **pendente até ele aprovar**, o aviso chega no WhatsApp dele, e a senha esquecida se resolve pelo "Preciso de ajuda para entrar".

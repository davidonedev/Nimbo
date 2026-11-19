# Domínio próprio (.com) no lugar de `nimbo-dusky.vercel.app`

Passo a passo para o site passar a abrir em `https://seudominio.com` (exemplo; troque pelo seu) e o que muda
em cada integração. Foi montado auditando o código desta branch e conferindo a documentação atual da Vercel e da
Cloudflare (fontes no fim). Marque as caixas conforme for fazendo.

> **Resumo da ordem segura:** registrar o domínio → ligar na Vercel (DNS + certificado) → liberar o domínio novo no
> CORS do backend (mantendo o antigo) → trocar `APP_URL` → ajustar Google/Turnstile/e-mail → redeploy → testar.
> O domínio antigo continua funcionando durante todo o processo; nada fica fora do ar.

---

## 1. Pré-requisitos

- [ ] **Escolher e registrar um domínio `.com` em nome do usuário.** `nimbo.com`, `nimbo.com.br`, `nimbo.app`,
      `usenimbo.com`, `getnimbo.com` e `nimboapp.com` já têm servidores DNS ativos (ou seja, pertencem a terceiros).
      Procure uma variação livre (ex.: `nimboagenda.com`, `usenimbo.com.br`, `nimbo.agenda...`) num registrador
      (Registro.br para `.com.br`; Cloudflare Registrar, Namecheap, GoDaddy, Vercel Domains para `.com`).
- [ ] Ter acesso ao **painel de DNS** desse domínio (no registrador ou onde os nameservers apontarem).
- [ ] Ter acesso ao **projeto na Vercel** (frontend), ao **serviço na Render** (backend), ao **Google Cloud Console**
      (login com Google) e ao **painel da Cloudflare** (Turnstile), se esses dois últimos estiverem em uso.
- [ ] Dica: **1 dia antes**, baixe o TTL dos registros DNS atuais do domínio para **60 s** (se ele já tinha site), assim
      a troca é rápida e uma reversão também ([Vercel – DNS best practices](https://vercel.com/docs/domains/working-with-dns)).

---

## 2. Vercel (frontend)

Em **Project → Settings → Domains** ([passo a passo oficial](https://vercel.com/docs/domains/working-with-domains/add-a-domain)):

- [ ] **Add Existing** → digitar `seudominio.com` (apex). A Vercel sugere adicionar também o `www`: **aceite**.
- [ ] Configurar o DNS no registrador com **os valores que a própria tela de Domains mostra para o seu projeto**
      (são os valores válidos para você). Os valores de referência da documentação (consultada em 2026-11-19):

  | Host | Tipo | Valor (referência) |
  |---|---|---|
  | `@` (apex, `seudominio.com`) | **A** | `76.76.21.21` |
  | `www` | **CNAME** | valor **exclusivo do projeto**, no formato `d1d4fc829fe7bc7c.vercel-dns-017.com` (exemplo da doc). Exemplos mais antigos usam `cname.vercel-dns-0.com`. **Copie o que a tela mostrar.** |

  - A documentação diz que o apex usa **A** e o subdomínio usa **CNAME** (CNAME não é permitido no apex). Se o seu
    registrador for a **Cloudflare**, crie os registros com a nuvem **cinza (somente DNS)**: a Vercel tem um guia
    próprio para quem coloca um proxy na frente ([Vercel – proxies](https://vercel.com/kb/guide/can-i-use-a-proxy-on-top-of-my-vercel-deployment)),
    e o caminho sem proxy é o mais simples e o que a documentação de domínios descreve. *(Não li o guia de proxy
    inteiro; a recomendação "nuvem cinza" é por simplicidade, não por uma regra que eu tenha confirmado.)*
  - **Apague registros `AAAA`** do apex/`www`: a Vercel **não suporta IPv6** ([Vercel – DNS](https://vercel.com/docs/domains/working-with-dns)).
  - Se houver registro **CAA** no domínio, permita `letsencrypt.org` (é a autoridade que a Vercel usa).
  - A propagação pode levar de minutos até 24–48 h.
- [ ] Aguardar o status do domínio ficar **Valid Configuration** (certificado HTTPS é emitido sozinho).
- [ ] **Domínio principal e redirecionamento.** Em **Domains → Edit** no domínio que *não* será o principal, use
      **Redirect to** ([doc](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting)).
  - *Opção pedida:* **apex principal** (`seudominio.com`) e `www.seudominio.com` → redireciona para o apex.
  - *Observação:* a Vercel **recomenda o contrário** (`www` principal e o apex redirecionando), porque dá mais controle
    ao CDN; o apex como principal também funciona (usa Anycast com o registro A). Escolha um e **use o mesmo endereço**
    em `VITE_SITE_URL` e `APP_URL`.
- [ ] (Opcional, recomendado) No domínio `nimbo-dusky.vercel.app` listado em Domains, usar **Edit → Redirect to**
      `seudominio.com` para mandar os visitantes antigos ao endereço novo. *Não confirmei na documentação que o
      `.vercel.app` do projeto oferece essa opção; se não aparecer, ele continua servindo o site normalmente, só que na
      origem antiga (veja as consequências na seção 5).*
- [ ] Em **Settings → Environment Variables** (ambiente *Production*):
  - `VITE_SITE_URL=https://seudominio.com` (sem barra no final; variável introduzida neste PR).
  - `VITE_API_URL` **não muda** (continua apontando para a API na Render).
  - `VITE_TURNSTILE_SITE_KEY` e `VITE_GOOGLE_CLIENT_ID` continuam iguais.
- [ ] **Redeploy** do projeto (variável `VITE_*` só entra no build novo).

---

## 3. Render (backend)

Em **Environment** do serviço da API:

- [ ] **Primeiro** acrescentar o domínio novo em `CORS_ALLOWED_ORIGINS`, **mantendo** o antigo:

  ```
  CORS_ALLOWED_ORIGINS=https://seudominio.com,https://www.seudominio.com,https://nimbo-dusky.vercel.app,https://nimbo-*.vercel.app
  ```

  Regras do `CorsConfig` (`backend-java/src/main/java/com/agendepro/security/CorsConfig.java`): origem exata ou padrão
  com curinga de prefixo/sufixo do seu projeto; barra final e caminho são descartados; um curinga que libere qualquer
  site é ignorado. Liste apex **e** `www` (o navegador só envia o que está na barra de endereço; durante a propagação
  do DNS ou sem o redirecionamento, os dois podem aparecer).
- [ ] **Depois** trocar `APP_URL` pelo endereço principal, **sem barra no final** (o código concatena
      `appUrl + "/..."`):

  ```
  APP_URL=https://seudominio.com
  ```

  Todos os links enviados por e-mail e WhatsApp nascem dessa variável (lista na seção 4.4).
- [ ] Salvar e esperar o backend reiniciar. Conferir no log da subida a linha `CORS: origens exatas=[...]` com o
      domínio novo.
- [ ] **Manter `https://nimbo-dusky.vercel.app` no CORS por tempo indeterminado** (não só "alguns dias"): quem já usou o
      site antigo pode continuar com o service worker antigo rodando naquela origem (seção 5). O padrão de preview
      `https://nimbo-*.vercel.app` também deve ficar.

---

## 4. Integrações que dependem da origem (auditadas no código)

### 4.1 Login com Google
- Código: `frontend/src/lib/googleAuth.ts:2` lê `VITE_GOOGLE_CLIENT_ID`; `frontend/src/App.tsx:216` monta o
  `GoogleOAuthProvider`; o backend valida o token em `PublicService.googleAuthPublicClient`.
- [ ] No **Google Cloud Console → APIs e serviços → Credenciais → seu ID de cliente OAuth (Aplicativo da Web)**:
      em **Origens JavaScript autorizadas** adicionar `https://seudominio.com` (e `https://www.seudominio.com` se o
      `www` servir o site). **Não remova** a origem antiga enquanto ela estiver em uso. Sem isso o botão falha com
      `origin_mismatch`.

### 4.2 Cloudflare Turnstile (captcha do agendamento público)
- Código: `frontend/src/components/booking/Turnstile.tsx` (usa `VITE_TURNSTILE_SITE_KEY`) e
  `backend-java/src/main/java/com/agendepro/publicapi/CaptchaService.java` (`TURNSTILE_SECRET_KEY`).
- [ ] No painel da Cloudflare → **Turnstile** → seu widget → **Settings → Hostname Management → Add Hostnames** →
      `seudominio.com`. Um hostname vale para ele mesmo **e para seus subdomínios** (`www`), mas **não** para o domínio
      pai ([doc oficial](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)).
      Todo widget precisa de ao menos 1 hostname; o plano gratuito aceita até 10 por widget.
- As chaves de **teste** da Cloudflare funcionam em qualquer hostname; só as chaves reais exigem o hostname cadastrado.
- Observação: o backend só confere `success` na resposta da Cloudflare, não o hostname. A trava de hostname é a do widget.

### 4.3 Mercado Pago (Pix)
- Código: `backend-java/src/main/java/com/agendepro/payment/MercadoPagoService.java:50`
  → `"notification_url", appUrl + "/api/webhooks/mercadopago"`. O código **não** define URLs de retorno (`back_urls`).
- [ ] Se usar Mercado Pago, **não há mais nada para trocar no painel** além do `APP_URL`; **mas veja o risco R1**
      (essa URL aponta para o endereço do *front*, não da API).

### 4.4 E-mail e WhatsApp (links e remetente)
Links montados a partir de `APP_URL` (todos precisam do domínio novo no `APP_URL`):

| Fluxo | Arquivo:linha |
|---|---|
| Redefinir senha | `account/PasswordResetService.java:79` → `/reset-password?token=` |
| Confirmar troca de e-mail | `account/EmailChangeService.java:68` → `/confirm-email-change?token=` |
| Verificação do cliente (e-mail/WhatsApp) | `publicapi/PublicService.java:549` → `/{slug}/verify-email?token=` |
| Lembrete ao cliente (24 h / 2 h) | `reminder/ReminderService.java:123` → `/{slug}/my-appointments` |
| Aviso ao dono (pendente sem confirmar) | `appointment/OwnerPendingReminderService.java:100` → `/admin/appointments` |

- [ ] **Remetente (`SMTP_FROM`)**: o padrão em `application.yml:76` é `Nimbo <noreply@agendepro.com>` e o
      `.env.example:31` traz `AgendePro <noreply@agendepro.com>`. Defina `SMTP_FROM` com um endereço **do seu domínio novo**
      (ex.: `Nimbo <noreply@seudominio.com>`).
- [ ] Configure **SPF e DKIM** do domínio novo no provedor de e-mail que enviar as mensagens (os registros TXT/CNAME
      saem do painel do provedor). Sem isso os e-mails caem no spam. **Atenção:** o SMTP padrão do projeto é o do Gmail
      (`smtp.gmail.com`); o Gmail comum **reescreve o remetente** para a conta autenticada. Para enviar de
      `noreply@seudominio.com` use um provedor transacional (Brevo, Resend, SES, Postmark) ou Google Workspace.
- [ ] Caixas **`suporte@`** e **`privacidade@`**: as páginas de Termos e Privacidade citam
      `suporte@agendepro.com` e `privacidade@agendepro.com` (`frontend/src/pages/TermsPage.tsx:53`,
      `PrivacyPage.tsx:53`). Crie essas caixas no domínio novo (ou um encaminhamento) e atualize os textos.

### 4.5 PWA / service worker
- Código: `frontend/vite.config.ts` (`VitePWA`): `start_url: '/login'`, `scope: '/'`, `display: 'standalone'`,
  `registerType: 'prompt'`, `navigateFallback: '/index.html'`. Todos os caminhos são **relativos**, então o manifesto
  funciona em qualquer domínio sem mudança.
- Mas service worker, cache e instalação são **por origem**: veja a seção 5.

---

## 5. O que muda para as pessoas (efeitos da troca de origem)

O navegador guarda `localStorage`, `sessionStorage`, cache e service worker **por endereço**. Um domínio novo é uma
origem nova e começa "vazia":

- [ ] **(a) Donos e profissionais precisam entrar de novo** no domínio novo (a sessão fica em `sessionStorage`, chave
      `agendepro_session`, e é por origem). Avise antes.
- [ ] **(b) O app instalado a partir de `nimbo-dusky.vercel.app` não migra.** É um app diferente do que será instalado
      no domínio novo: quem instalou precisa **instalar de novo** pelo domínio novo e pode remover o antigo.
- [ ] **(c) Clientes perdem o "aparelho reconhecido"** (`localStorage`, chave `nimbo_device_<slug>`): o próximo
      agendamento volta a exigir a confirmação (código ou mensagem no WhatsApp do estabelecimento), uma vez.
- [ ] **(d) Links antigos.** Os endereços `.vercel.app` **continuam funcionando enquanto o projeto existir na Vercel**.
      Se o redirecionamento do `.vercel.app` para o domínio novo estiver configurado (seção 2), os links já enviados
      por WhatsApp/e-mail com o endereço antigo levam ao endereço novo. Há um limite importante:
  - **Service worker na origem antiga:** quem já visitou o site antigo tem o service worker antigo, que responde às
    navegações com o `index.html` guardado (`navigateFallback`) **sem passar pelo redirecionamento da Vercel**. Essas
    pessoas continuam vendo a versão antiga **naquela origem** até aceitarem o aviso "Nova versão disponível"
    (`registerType: 'prompt'`). Por isso o `nimbo-dusky.vercel.app` **precisa continuar no CORS** (seção 3).
- [ ] Links "do agendamento" que o dono copia no painel são montados com `window.location.origin`
      (`AgendaPage.tsx:86`, `Dashboard.tsx:28`, `SettingsView.tsx:238`, `TenantDetailView.tsx:185`): o link copiado
      reflete o endereço **em que o dono está logado naquele momento**. Depois da troca, oriente os donos a usar o
      domínio novo (ou use `VITE_SITE_URL`, se esse PR já estiver aplicado) para não copiar o link antigo.

---

## 6. Verificação depois da troca

Troque `seudominio.com` e a URL da API (`API=https://nimbo-api-duyl.onrender.com`, valor de exemplo do `.env.example`).

```bash
API=https://nimbo-api-duyl.onrender.com
SITE=https://seudominio.com

# 1) Home no ar, com HTTPS válido (esperado: HTTP/2 200)
curl -sI $SITE | head -5

# 2) www redireciona para o apex (esperado: 307/308 e location: https://seudominio.com/)
curl -sI https://www.seudominio.com | grep -iE "^HTTP|^location"

# 3) .vercel.app antigo redireciona (só se configurou o Redirect to; senão responde 200)
curl -sI https://nimbo-dusky.vercel.app | grep -iE "^HTTP|^location"

# 4) Preflight CORS da API com a origem NOVA (esperado: access-control-allow-origin: https://seudominio.com)
curl -s -i -X OPTIONS "$API/api/public/login-data" \
  -H "Origin: $SITE" -H "Access-Control-Request-Method: GET" | grep -iE "^HTTP|access-control"

# 5) Preflight do agendamento público, com o cabeçalho do aparelho reconhecido
curl -s -i -X OPTIONS "$API/api/public/seu-slug/book" \
  -H "Origin: $SITE" -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-device-token" | grep -iE "^HTTP|access-control"

# 6) Saúde do backend (esperado: {"status":"UP"})
curl -s $API/actuator/health

# 7) Manifesto do PWA no domínio novo (esperado: start_url /login, display standalone)
curl -s $SITE/manifest.webmanifest

# 8) DNS: A do apex e CNAME do www
dig +short seudominio.com
dig +short cname www.seudominio.com
```

Checagem manual (celular e computador): abrir `seudominio.com`; agendar numa página `seudominio.com/<slug>`
(captcha aparece e valida); pedir "Esqueci a senha" e **abrir o link do e-mail** (deve apontar para o domínio novo);
testar "Continuar com Google" (se usado); instalar o app a partir do domínio novo.

---

## 7. Plano de reversão

A troca é aditiva (o domínio antigo nunca foi removido), então reverter é simples:

1. [ ] Render: voltar `APP_URL` para `https://nimbo-dusky.vercel.app` (os links dos e-mails voltam ao antigo).
       Pode deixar o domínio novo no `CORS_ALLOWED_ORIGINS` (não atrapalha).
2. [ ] Vercel: em Domains, tirar o **Redirect to** do `nimbo-dusky.vercel.app` e/ou definir de novo o `.vercel.app`
       como principal; remover `VITE_SITE_URL` (ou apontar para o antigo) e fazer redeploy.
3. [ ] Se o problema for o DNS/certificado: voltar os registros ao valor anterior (por isso o TTL baixo antes).
4. [ ] Google/Turnstile: **não precisa desfazer**; manter os dois endereços cadastrados é seguro.
5. [ ] Avisar donos/profissionais que voltaram a entrar pelo endereço antigo (precisam logar de novo, pela mesma
       razão da seção 5).

---

## 8. Riscos e pontos duvidosos encontrados na auditoria

- **R1 — Webhook do Mercado Pago aponta para o endereço do front, não da API.**
  `MercadoPagoService.java:50` monta `notification_url = appUrl + "/api/webhooks/mercadopago"`, mas a rota existe só no
  backend (`PaymentController.java:111`) e o `frontend/vercel.json` só tem a regra de SPA
  (`/(.*)` → `/index.html`), **sem proxy de `/api` para a Render**. Com `APP_URL` = endereço da Vercel, as notificações
  do Mercado Pago caem no front (que responde o HTML do app) e **nunca chegam ao backend**: o status do Pix não é
  atualizado pelo webhook. Isso **independe da troca de domínio** (já é assim hoje) e trocar o `APP_URL` não resolve.
  Correção sugerida (fora do escopo deste documento): uma propriedade própria para a URL pública da API
  (ex.: `API_PUBLIC_URL`) usada no `notification_url`, ou um rewrite de `/api/*` na Vercel para a Render.
- **R2 — `APP_URL` com valor errado quebra links de e-mail.** O padrão é `http://localhost:5173`
  (`application.yml:74`): se a variável não estiver definida em produção, os e-mails saem com link para `localhost`.
  Barra no final também gera link com `//`. Sempre `https://seudominio.com`, sem barra.
- **R3 — Textos e e-mails ainda com o nome antigo.** `agendepro.com` aparece em `SignupPage.tsx` (prefixo do link do
  estabelecimento, linhas 133, 305, 307, 360), `FeatureTabs.tsx:17`, `TermsPage.tsx:53`, `PrivacyPage.tsx:53`,
  `application.yml:76` e `.env.example:31` (remetente). Quem for cadastrar um negócio vê um endereço que não é o seu.
- **R4 — `og:url` e imagem de compartilhamento são placeholders.** `frontend/index.html:26-27` e `:34` ainda têm
  `[INSERIR URL DO SITE]` / `[INSERIR URL DA IMAGEM OG]`: ao compartilhar o link em redes/WhatsApp a prévia fica sem
  endereço nem imagem. Precisa do domínio final.
- **R5 — Cache do service worker segura a origem antiga** (seção 5-d): por isso manter o `.vercel.app` no CORS e não
  esperar que o redirecionamento atinja quem já tem o site em cache.
- **R6 — Turnstile não é validado por hostname no backend** (`CaptchaService` só confere `success`). Se o widget for
  criado sem restrição de hostname adequada, o token vale em qualquer site; a proteção é só a lista de hostnames do widget.
- **R7 — Contas de demonstração na tela de login.** `frontend/src/pages/LoginPage.tsx:44-50` tem fixo no código o bloco
  "Super Admin" com `super@agendepro.com` / `super123`, exibido também em produção (recolhível). Não tem relação com
  o domínio, mas é uma credencial pública no bundle; vale remover ou condicionar a ambiente de desenvolvimento.
  *(Só é perigoso se essa conta existir no banco de produção; o seed fica desligado por padrão.)*
- **R8 — Dúvida em aberto:** não confirmei que o domínio `.vercel.app` do projeto aceita **Redirect to** nas
  configurações da Vercel (a doc descreve o recurso para domínios do projeto em geral). Teste no painel; se não houver,
  o `.vercel.app` segue servindo o site (sem redirecionar) e vale o que está na seção 5-d.

---

## Fontes consultadas (em 2026-11-19)

- Vercel — [Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
  (apex → registro **A**; subdomínio → **CNAME** exclusivo do projeto, ex.: `d1d4fc829fe7bc7c.vercel-dns-017.com`).
- Vercel — [Working with DNS](https://vercel.com/docs/domains/working-with-dns)
  (`76.76.21.21`; `cname.vercel-dns-0.com` em exemplos antigos; **IPv6 não suportado**; TTL de 60 s; propagação 24–48 h).
- Vercel — [Deploying & Redirecting Domains](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting)
  (**Redirect to** em Domains; recomendação de `www` como principal).
- Cloudflare — [Turnstile: Hostname management](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
  (hostname vale para ele e subdomínios; mínimo de 1 por widget; 10 no plano gratuito).

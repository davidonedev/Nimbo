# Relatório de auditoria: fluxo do cliente no Nimbo (agendamento → aprovação → atendimento)

Data: 2026-11-23 · Branch: `chore/auditoria-fluxo-agendamento` (a partir da `main` 6091fa3)
Método: leitura de código (front e back) + 60 testes de integração no backend (Testcontainers/PostgreSQL descartável, WhatsApp e e-mail mockados) + 22 testes de tela (API falsa) + 38 verificações Playwright com a API interceptada. Nada real foi enviado e nenhum banco de dev ou produção foi tocado. Nenhum código de produção foi alterado.
Testes: `backend-java/src/test/java/com/agendepro/audit/` e `frontend/src/audit/`. Os testes `gap_*` **passam documentando a lacuna**; ao corrigir cada item, inverta a assertiva.
Resultados na máquina: backend 185/185 (125 antigos + 60 novos); frontend 432/432 (410 antigos + 22 novos).

---

## 1. Resumo executivo

**O fluxo funciona de ponta a ponta? Parcial.** O cliente consegue agendar, o horário fica bloqueado, o admin consegue aprovar/recusar/concluir/marcar falta e o lembrete de 24 h e 2 h sai uma vez. Mas **ninguém é avisado nos momentos que importam**: o admin não recebe aviso de pedido novo e o cliente não recebe aviso de aprovação ou recusa. O ciclo pós-atendimento (pagamento, comissão, avaliação) praticamente não existe.

**Nota de prontidão para uso real: 45%.** Para um barbeiro real, o sistema agenda e registra, mas ele precisaria ficar com o painel aberto o dia inteiro e avisar cada cliente por conta própria.

**Os 10 maiores problemas, em ordem:**
1. 🔴 **Vazamento de dados no `/book`:** sem WhatsApp configurado, quem digita o celular de outra pessoa recebe de volta o id, o nome e o telefone cadastrados. Com esse id dá para listar e cancelar a agenda da vítima (`PhoneBookingService.java:175,217,234`; `PublicService.java:336-341,389`).
2. 🔴 **Admin não é notificado de nova solicitação** por WhatsApp nem e-mail. Só o sino, com o painel aberto (`useAppointmentNotifications.ts:189-191`).
3. 🔴 **Cliente não é notificado ao ser aprovado, recusado ou cancelado pelo dono** (`AppointmentService.java:133-169` não chama nenhum notificador).
4. 🟠 **Status sem máquina de estados:** o backend aceita qualquer troca (`AppointmentService.java:146`). Reabrir um cancelado cria dois agendamentos no mesmo horário.
5. 🟠 **Fluxos legados sem proteção** (`POST /{slug}/booking`, `/register-and-book`): sem captcha, sem limite, aceitam data passada e madrugada, criam PENDING que **nunca expira**, e `/booking` sobrescreve nome e telefone de cliente existente (`PublicService.java:196-222,252-259,477-521`).
6. 🟠 **Lembretes frágeis:** marcados como enviados mesmo quando o envio falha, sem retry, sem catch-up com o Render dormindo, ignoram o WhatsApp padrão da plataforma, saem também para pendentes e não pedem confirmação de presença (`ReminderService.java:72-74,93-95,136-139`).
7. 🟠 **Datas sem validação** no `/book` (aceita ontem e +200 dias), no cadastro pelo admin e no reagendamento do cliente (que ainda mantém o status confirmado e não avisa o dono).
8. 🟠 **Cancelar, reagendar e `my-appointments` só exigem o `clientId`** (UUID), sem prova de posse (`PublicController.java:171-189`).
9. 🟠 **Sem "recusado" com motivo, sem remarcação pelo admin, sem "em atendimento"**, e sem pagamento registrado, comissão, caixa, recibo ou avaliação. O webhook do Pix aponta para a URL do frontend e nunca chega ao backend (`MercadoPagoService.java:50`).
10. 🟠 **Render free:** sem keep-alive, os `@Scheduled` param quando o serviço dorme. Sem backup e sem monitoramento no repositório. SMTP não configurado derruba todos os e-mails.

---

## 2. Fluxo real versus fluxo alvo

```
FLUXO ALVO                                     FLUXO REAL HOJE
-----------------------------------------      -------------------------------------------------
1 Cliente escolhe e solicita          ------>  OK  (/book: 3 telas + código OU pendente)
2 Nasce PENDENTE, horário bloqueado   ------>  OK  (lock por profissional/dia; 4 disputas -> 1 vence)
3 ADMIN notificado (WhatsApp + painel) ----->  X   só sino com painel aberto (polling 30 s)
4 Admin APROVA / RECUSA / sugere hora ------>  ~   aprova e "recusa" (= cancelled, sem motivo);
                                                   sem sugerir/remarcar
5 CLIENTE notificado (confirmação/recusa) -->  X   nada é enviado (nem WhatsApp, nem e-mail)
6 Lembrete 24 h e 2 h + pedir presença --->  ~   sai 1x, mas sem retry/catch-up, sem pedir presença
7 Inicia -> CONCLUÍDO / FALTA          ------>  ~   sem "em atendimento"; concluir/falta OK;
                                                   cancelar OK (cliente: >= 60 min)
8 Pagamento, comissão, histórico, avaliação ->  X   só o preço copiado no agendamento e o histórico
                                                   de agendamentos; sem comissão/caixa/recibo/avaliação
```

Legenda: OK funciona · ~ parcial · X não existe.

---

## 3. Tabela de testes

Legenda: ✅ correto · ❌ lacuna/bug (teste `gap_`) · ⚠️ funciona com ressalva. As siglas dos testes são: **F** = `FluxoFelizAuditTest`, **A** = `AlternativosAuditTest`, **B** = `BordaSegurancaAuditTest`, **R** = `ReminderRealWhatsappAuditTest`, **T** = `WhatsappTimeoutAuditTest`.
### A. Caminho feliz

| Cenário | Esperado | Obtido | Status | Teste → código |
|---|---|---|---|---|
| Cliente novo agenda (sem WhatsApp) | PENDENTE, horário bloqueado, cliente no tenant certo | `pending_confirmation`, PENDING, cliente criado no tenant; 2º pedido do mesmo slot → 409 | ✅ | F:36 → PhoneBookingService.java:155-235 |
| Cliente agenda com código | Reservado | `booked`, agendamento PENDING sem `confirmBy` (aguarda o admin) | ✅ | F:61 → PhoneBookingService.java:292-301 |
| Admin vê a solicitação | Aparece em Pendentes | Aparece em `GET /api/admin/appointments?status=PENDING` | ✅ | F:77 |
| Filtro `?status=` | Mesmo formato do corpo | `?status=pending` → 400; só `PENDING` funciona (corpo usa minúsculas) | ⚠️ | F:91 → AppointmentController.java:36 |
| **Admin notificado (WhatsApp/e-mail)** | Sim | **Nada enviado** | ❌ | F:102 |
| Admin aprova | CONFIRMED e telas refletem | CONFIRMED; Painel, lista do dia e agenda do profissional mostram | ✅ | F:118 → AppointmentService.java:133-149 |
| **Cliente notificado da aprovação** | WhatsApp | **Nada enviado** | ❌ | F:145 → AppointmentService.java:146-148 |
| Lembrete 24 h / 2 h | 1x, sem duplicar | 1x cada; 2ª rodada não repete; fuso de São Paulo | ✅ | F:162,178,192 → ReminderService.java:62-100 |
| Janela perdida (serviço dormindo) | Lembrete ainda sai | **Nunca sai** (janelas de 2 h e 1h30) | ❌ | F:205 → AppointmentRepository.java:128-148 |
| Lembrete a pendentes / pede presença | Só aprovados; pede confirmação | Sai para PENDING também; não pede resposta | ❌ | F:221 → WhatsappService.java:22-46 |
| Cliente sem telefone | Registrar/avisar | Marca como enviado sem enviar | ❌ | F:239 → ReminderService.java:106-109 |
| Provedor responde 500 | Retry e log | 1 tentativa, erro só logado, marcado como enviado | ❌ | R:55 → WhatsappService.java:161-173 |
| Tenant sem WhatsApp próprio | Usar o padrão da plataforma | Lembretes ignoram `WHATSAPP_DEFAULT_*` | ❌ | R:88 → ReminderService.java:136-139 |
| Concluir: valor e histórico | Valor e histórico | `price` copiado; aparece no histórico como `completed` | ✅ | F:254 |
| Pagamento, comissão, totais | Registrados | **Inexistentes** (sem forma/valor pago, comissão, total gasto, faltas) | ❌ | F:274 |
| Iniciar atendimento | "Em atendimento" | `in_progress` → 400 | ❌ | F:295 → AppointmentStatus.java:8-12 |

### B. Alternativos

| Cenário | Esperado | Obtido | Status | Teste → código |
|---|---|---|---|---|
| Admin recusa | Cancelado e horário liberado | CANCELLED; slot volta à lista | ✅ | A:51 |
| Recusa com motivo e aviso | Motivo e aviso ao cliente | Sem status "recusado"; `reason` é descartado; ninguém é avisado | ❌ | A:65 → AppointmentDtos.java:53 |
| Admin remarca / sugere horário | Existe | Sem endpoint; só o cliente reagenda | ❌ | A:83 |
| Cliente cancela (≥ 1 h) e < 1 h | Libera / bloqueia | Libera; < 1 h → 400 | ✅ | A:102,114 → PublicService.java:359,404 |
| Admin avisado do cancelamento | Sim | Nada enviado | ❌ | A:125 |
| Cliente reagenda | Move e zera lembretes | Move, zera `reminder_*_sent_at`, libera o antigo; horário bloqueado → 409 | ✅ | A:141,160 |
| Reagendamento: status e aviso | Volta a PENDENTE / avisa admin | CONFIRMED permanece, admin não é avisado | ❌ | A:170 → PublicService.java:375-381 |
| Reagendar valida expediente/data | Sim | Aceita 03:00 e ontem | ❌ | A:185 → PublicService.java:371 |
| Falta e Painel | Registrada e contada | `noShow=1`, `cancelled=1`; histórico do cliente | ✅ | A:202 → DashboardSummaryService.java:70-73 |
| Pendente que o cliente não confirma | Libera | Expira em 3 h → CANCELLED, slot livre | ✅ | A:226 → PendingExpiryService.java:33-38 |
| Cliente confirmou e o dono não responde | Lembrete ao dono / liberação | Nunca expira; só e-mail 2 h e 1 h antes | ⚠️ | A:239 → OwnerPendingReminderService.java:58-106 |
| Tenant sem telefone cadastrado | Prazo para o cliente | `confirmBy` nulo: pedido nunca expira e trava o horário | ❌ | A:265 → PhoneBookingService.java:231-232 |
| Cliente recorrente (mesmo aparelho) | Direto, sem 2º código, sem duplicar | `booked` direto, 1 cliente, histórico com 2 | ✅ | A:280 |
| Outro aparelho, mesmo celular | Pede código | `challenge_required` | ✅ | A:301 |

### C. Borda e segurança

| Cenário | Esperado | Obtido | Status | Teste → código |
|---|---|---|---|---|
| 4 clientes no mesmo horário (`/book`) | 1 vence | 1×200 e 3×409 | ✅ | B:103 → PgAdvisoryLockService.java:82 |
| 4 criações do admin no mesmo horário | 1 vence | 1×201 e 3×409 | ✅ | B:119 |
| `/book`: expediente, folga, bloqueio, hoje já passou | Rejeitar | 409 em todos | ✅ | B:140,157 |
| `/book`: data passada / > 60 dias | Rejeitar | **Aceita** ontem e +200 dias | ❌ | B:168 → PhoneBookingService.java:394 |
| Legados `/booking`, `/register-and-book` | Mesmas regras | Aceitam passado, madrugada, folga | ❌ | B:181 → PublicService.java:196-222 |
| Criação pelo admin/profissional | Validar passado/expediente | Aceita ontem e 03:00 | ❌ | B:201 → AppointmentService.java:92-96 |
| Vários serviços (30+45 min) | Encadeia e bloqueia | 10:00–10:30 e 10:30–11:15, R$ 100 | ✅ | B:216 → PublicService.java:235-250 |
| Fuso / horário de verão | São Paulo correto | jan/2027 UTC-3; nov/2018 UTC-2 (último horário de verão) | ✅ | B:239 |
| Provedor devolve falha | Agendamento segue | Cai para pendente, 200 | ✅ | B:250 → PhoneBookingService.java:204-211 |
| Exceção inesperada do provedor | Agendamento segue | **500 e nada salvo** | ❌ | B:262 → PhoneBookingService.java:402-407 |
| Provedor trava | Timeout | **Sem timeout**: thread HTTP presa | ❌ | T:24 → WhatsappService.java:66 |
| Transições inválidas | Rejeitar | Backend aceita todas | ❌ | B:276 → AppointmentService.java:146 |
| Reabrir cancelado com horário retomado | Rejeitar | 2 agendamentos ativos no mesmo horário | ❌ | B:290 |
| Admin do tenant B mexe no A | 404 | 404 em tudo | ✅ | B:307 |
| Cancelar/reagendar com cliente ou slug errado | 404 | 404 | ✅ | B:331 |
| `my-appointments?clientId=` sem autenticação | Exigir posse | 200 com nome, e-mail, telefone e agenda | ❌ | B:352 → PublicController.java:173-177 |
| `/book` sem WhatsApp: cliente existente | Não revelar | **Devolve id e nome reais**; dá para cancelar a agenda da vítima | ❌ | B:367 |
| `/book` com WhatsApp | Não revelar | `challenge_required`, sem id | ✅ | B:393 |
| `/booking` com e-mail de cliente existente | Não alterar | Sobrescreve nome e telefone | ❌ | B:407 → PublicService.java:252-259 |
| Profissional vs. colega | Só o próprio | 403 / só os próprios | ✅ | B:422 |
| Sem token / papel errado | 401 / 403 | 401 e 403 | ✅ | B:449 → SecurityConfig.java:63-66 |
| Limite de pendentes por celular | Limitar | 4º → 429 | ✅ | B:469 |
| Spam no `/booking` legado | Captcha/limite | 8 reservas seguidas sem limite, PENDING sem prazo | ❌ | B:478 |
| Validação de entrada do `/book` | Rejeitar | Telefone, nome, data, serviço, observação: rejeitados, nada salvo | ✅ | B:497 |
| Telefone do estabelecimento | Validar | Aceita texto livre | ❌ | B:531 → TenantDtos.java:81 |

### D. Telas (mobile, desktop, claro e escuro)

| Cenário | Obtido | Status | Evidência |
|---|---|---|---|
| Agenda: Aceitar / Confirmar / Concluir / Falta / Cancelar | Chamam os endpoints certos e a lista reflete | ✅ | `AgendaView.tsx:331-372`; `appointmentFilters.ts:56-65` |
| Confirmação em massa com modal de aviso | Nada é enviado antes do "Sim" | ✅ | `TenantContext.tsx:218-223` |
| **Falha da API ao Aceitar/Recusar na Agenda** | **Nenhuma mensagem de erro** e promessa rejeitada no console | ❌ | `AgendaView.tsx:364-366,617,659-665` |
| Rótulo de falta | "Faltou" em umas telas, "Não compareceu" em outras | ⚠️ | `statusStyle.ts:9` × `Dashboard.tsx:20` |
| Painel "pendentes" | Conta só os de hoje | ⚠️ | `Dashboard.tsx:32-35` |
| Sino | Avisa só com o painel aberto; não avisa agendamento que já nasce confirmado; no profissional a chave `apn_v1` é fixa | ⚠️ | `useAppointmentNotifications.ts:189`; `ProfessionalLayout.tsx:31` |
| Fluxo público de 5 telas | Completo (código, pendente, aparelho reconhecido) | ✅ | `public-booking.audit` |
| Esforço do cliente | 7 interações com código, 6 no modo pendente, 3 com aparelho reconhecido | ✅ | — |
| Overflow horizontal (390 e 1280 px, claro e escuro) | **Nenhum** em 38 verificações | ✅ | `audit-results.json` |
| Tema | Agendamento público é **sempre escuro** (escolha de design); admin funciona nos dois | ⚠️ | `booking.css:7-24` |
| Contraste (WCAG AA) no admin | "Aceitar" 3,3:1; "Recusar" 3,6:1; "Cancelar" no escuro 2,0:1 | ❌ | `AgendaView.tsx:364,368` |
| Alvos de toque | Caixas de seleção de 16 px no admin; telefone do rodapé público 21 px | ⚠️ | `audit-results.json` |
| Servidor acordando | Só "Carregando…"; no 503, culpa a conexão do cliente | ⚠️ | `api.ts:16`; `PublicTenantContext.tsx:101` |
| Confirmação do cliente | Promete "Cancelamento até 1 h antes" mas não há link para cancelar ou reagendar | ⚠️ | `StepContact.tsx:164`; `StepDone.tsx` |

**Nota:** as capturas de tela (`audit-shots\`) e os dados brutos do Playwright ficaram na pasta temporária da sessão e não foram commitados. Os testes que reproduzem as tabelas estão versionados em `backend-java/src/test/java/com/agendepro/audit/` e `frontend/src/audit/`.

---

## 4. Auditoria do WhatsApp (Fase 3)

**1. Cliente agenda notifica o admin por WhatsApp? Não.** Nenhum código envia mensagem ao dono. O `WhatsappService` só é chamado em três lugares, todos para o **cliente**: OTP (`PhoneBookingService.java:402-406`), link de verificação (`PublicService.java:552-564`) e lembrete (`ReminderService.java:139`). O único aviso externo ao dono é o **e-mail** "falta confirmar" (`OwnerPendingReminderService.java:99`), e só vale para pendentes que o cliente já confirmou, 2 h e 1 h antes.

**2. Admin aprova notifica o cliente por WhatsApp? Não.** `AppointmentService.updateStatus` (`:133-149`) e `bulkConfirm` (`:157-169`) só gravam o status. Teste F:145 prova que nada é enviado.

**3. Outras mensagens:**

| Evento | WhatsApp | E-mail | Sino |
|---|---|---|---|
| Novo agendamento → admin | ❌ | ❌ | ⚠️ só com painel aberto |
| Aprovação → cliente | ❌ | ❌ | — |
| Recusa → cliente | ❌ | ❌ | — |
| Remarcação (cliente ou admin) | ❌ | ❌ | ❌ |
| Cancelamento (cliente ou admin) | ❌ | ❌ | ⚠️ detecta a mudança, se aberto |
| Lembrete 24 h e 2 h → cliente | ✅ | ❌ | — |
| "Falta confirmar" → dono | ❌ | ✅ | ⚠️ só com painel aberto |
| Agradecimento / avaliação | ❌ | ❌ | ❌ |

**4. Integração em uso:** só a **Evolution API** (não oficial; `WhatsappService.java:14,150-159`, endpoint `/message/sendText/{instance}`). Configuração por tenant (`tenants.whatsapp_api_url`, `whatsapp_api_key`, `whatsapp_instance`, `V1__init.sql:26-29`) ou da plataforma (`WHATSAPP_DEFAULT_API_URL`, `WHATSAPP_DEFAULT_API_KEY`, `WHATSAPP_DEFAULT_INSTANCE`, `application.yml:79-84`). O envio é `@Async` e engole erros (`WhatsappService.java:161-173`), com `sendNow` síncrono para o OTP (`:128-141`). **Não há** API oficial da Meta, fila/outbox, retry, log de envio, webhook de status de entrega nem consentimento/opt-out. O único webhook do projeto é o do Mercado Pago. Sem WhatsApp configurado, só se registra em log (`logUnsent`, `:143-148`), o que serve de sink nos testes.

**5. Arquitetura recomendada**

*Comparativo de opções* [CONFIRMAR todos os valores e regras antes de decidir]:

| Opção | Custo | Risco | Esforço |
|---|---|---|---|
| **API oficial (Meta Cloud API)** com templates aprovados | Cobrança por mensagem de template; confirmar tabela atual por país e categoria. Mensagens de lembrete/confirmação entram em "utilidade" | Baixo risco de banimento; exige conta Business, número verificado e templates aprovados; fora da janela de 24 h só vale template | M–G |
| **Não oficial** (Evolution, Z-API, Baileys) | Mensalidade baixa ou servidor próprio; precisa de um número/chip pareado por QR | **Alto**: bloqueio do número, queda de sessão, contra os termos do WhatsApp | P (já existe) |
| **Fallback `wa.me`** com texto pré-preenchido | Zero | Manual: o dono toca para enviar; nada automático | P |

*Recomendação por fases:*
- **Agora (custo zero, resolve o essencial):** avisar o **admin** por e-mail + sino + push web, com botão `wa.me` pré-preenchido; avisar o **cliente** por e-mail e por link `wa.me` na tela de confirmação. Isso respeita a decisão anterior de não depender de chip.
- **Depois (automação):** API oficial da Meta com **número da plataforma Nimbo** (ou do tenant, via cadastro incorporado) usando templates de utilidade. Cada tenant poderia ter o seu número no plano pago. [CONFIRMAR se um número virtual ou fixo serve para o cadastro.]

*Camada de abstração:* interface `NotificationChannel { SendResult send(Notification n); }` com implementações `EvolutionChannel`, `MetaCloudChannel`, `EmailChannel`, `InAppChannel`, `WaMeLinkChannel`. Um `NotificationService` decide o canal por tenant e por evento.

*Outbox e confiabilidade:* tabela `notification_outbox` (id, tenant_id, appointment_id, evento, canal, destino, payload, status `PENDING|SENT|FAILED|SKIPPED`, tentativas, próxima_tentativa, erro, custo, criado_em, enviado_em). Gravada **na mesma transação** da mudança de status; um job lê com `FOR UPDATE SKIP LOCKED`, aplica backoff exponencial e grava o erro. Chave única `(appointment_id, evento, canal)` para idempotência. Webhook de status do provedor atualiza `entregue/lido/falhou`. O job faz catch-up de tudo que ficou pendente quando o serviço acorda.

*Modelos de mensagem (PT-BR):*

| Evento (destinatário) | Texto |
|---|---|
| Nova solicitação (admin) | `Nova solicitação em {{estabelecimento}}: {{cliente}} quer {{servico}} com {{profissional}} em {{data}} às {{hora}}. Aprovar ou recusar: {{link_painel}}` |
| Aprovação (cliente) | `Olá, {{nome}}! Seu horário está confirmado: {{servico}} com {{profissional}}, {{data}} às {{hora}}. {{endereco}}. Reagendar ou cancelar: {{link}}` |
| Recusa (cliente) | `Olá, {{nome}}. Não conseguimos atender {{data}} às {{hora}}. Motivo: {{motivo}}. Escolha outro horário: {{link}}` |
| Remarcação (cliente) | `{{estabelecimento}} sugeriu {{nova_data}} às {{nova_hora}}. Aceitar: {{link}}` |
| Cancelamento | `Seu horário de {{data}} às {{hora}} foi cancelado. Reagendar: {{link}}` |
| Lembrete 24 h | `Lembrete: amanhã, {{hora}}, {{servico}} com {{profissional}}. Responda 1 para confirmar presença ou 2 para cancelar.` |
| Lembrete 2 h | `Daqui a 2 horas: {{servico}} às {{hora}}, {{endereco}}.` |
| Pós-atendimento | `Obrigado pela visita, {{nome}}! Como foi? Avalie em 1 toque: {{link}}` |

*Número, LGPD e horário:* consentimento registrado no momento do agendamento (hoje a tela só informa); opção de sair (`SAIR`) honrada por tenant; mensagens transacionais apenas entre 07:00 e 21:00 no fuso do tenant (exceto confirmação imediata); guardar só o necessário e permitir exclusão do cliente.

*Painel e push como complemento:* o sino precisa de contador persistente (hoje depende do painel aberto, só por polling de 30 s) e de push web para o celular do dono; ele também é o **fallback** quando o WhatsApp falha.

*Como testar sem enviar:* `NotificationChannel` com implementação `FakeChannel` (grava em memória) no perfil de teste, o `logUnsent` atual em dev, e sandbox do provedor em homologação. Os testes `audit` já usam `@MockBean WhatsappService` e podem ser reaproveitados.

---

## 5. Bugs e lacunas por gravidade

### 🔴 Bloqueiam o uso
| # | Sintoma | Causa raiz | Correção sugerida |
|---|---|---|---|
| 1 | `/book` sem WhatsApp devolve id, nome e telefone do dono do celular; com o id lê-se e cancela a agenda dele | `bookPending` devolve `toClient(client)` do cliente existente sem prova de posse (`PhoneBookingService.java:175,217,234,464`); cancelar e `my-appointments` só pedem `clientId` (`PublicService.java:336-341,389`) | Nunca devolver id/nome de cliente existente sem token de aparelho; usar sempre dados que o próprio cliente enviou; exigir token de aparelho (ou código) em cancelar, reagendar e listar |
| 2 | Dono não é avisado de pedido novo | Nenhum envio no fluxo de criação | Item 3 do backlog (outbox + e-mail/push/sino) |
| 3 | Cliente não é avisado de aprovação, recusa ou cancelamento | `AppointmentService.java:133-169` não chama notificador | Idem |

### 🟠 Quebram parte do fluxo
| # | Sintoma | Causa raiz | Correção |
|---|---|---|---|
| 4 | Qualquer troca de status; reabrir cria horário duplicado | `AppointmentService.java:146` | Máquina de estados + checagem de conflito ao reativar |
| 5 | Fluxos legados sem captcha/limite, aceitam passado, PENDING eterno, sobrescrevem cadastro | `PublicController.java:74`; `PublicService.java:196-222,252-259,477-521` | Remover os endpoints e os componentes órfãos que os chamam (`BookingFlow.tsx` e `BookingAuthGate.tsx` não têm rota em `App.tsx`; `/:slug/booking` já redireciona para o fluxo novo), ou fazê-los usar as regras do `/book` |
| 6 | Lembrete marcado como enviado sem enviar; perdido com serviço dormindo; ignora WhatsApp da plataforma; sai para pendentes | `ReminderService.java:72-74,93-95,106-109,136-139`; `AppointmentRepository.java:128-148` | Marcar só se `SENT`; janela aberta até o horário; `effectiveConfig`; só confirmados; outbox |
| 7 | `/book` aceita ontem e +200 dias; admin e reagendamento aceitam passado e madrugada | `PhoneBookingService.java:394` não usada em `book`; `AppointmentService.java:92-96`; `PublicService.java:371` | Validar passado, janela e expediente em todos os pontos de criação |
| 8 | Reagendar mantém CONFIRMED sem avisar o dono | `PublicService.java:375-381` | Voltar a PENDENTE ou notificar |
| 9 | Pedido pendente nunca expira se o tenant não tem telefone | `PhoneBookingService.java:231-232` | Exigir telefone válido para ativar o link público (ou expirar por padrão) |
| 10 | Exceção do provedor derruba o agendamento (500) | `PhoneBookingService.java:402-407` | Capturar tudo no envio e cair para pendente |
| 11 | Provedor travado prende a thread | `WhatsappService.java:66` (`RestClient.create()` sem timeout) | Timeouts de conexão e leitura (~5 s) |
| 12 | Webhook do Pix nunca chega | `MercadoPagoService.java:50` usa a URL do frontend; `vercel.json` não faz proxy | Usar a URL pública do backend; validar assinatura; não reabrir cancelado/concluído (`PaymentController.java:149-150`) |
| 13 | Aceitar/Recusar com falha não mostra nada na Agenda | `AgendaView.tsx:364-366,617,659-665` sem `catch` | Tratar o erro como `AppointmentsView.tsx:108-109` |

### 🟡 Experiência ruim
| # | Item | Local |
|---|---|---|
| 14 | Sem "recusado" nem motivo; sem remarcar/sugerir horário pelo admin; sem "em atendimento" | `AppointmentDtos.java:53`; `AppointmentStatus.java:8-12` |
| 15 | Confirmação não tem link para cancelar/reagendar, mas a tela promete "cancelamento até 1 h antes" | `StepContact.tsx:164`; `StepDone.tsx` |
| 16 | Sem aviso de "servidor acordando"; o 503 culpa a conexão do cliente | `api.ts:16`; `PublicTenantContext.tsx:101` |
| 17 | Sino só com painel aberto; não avisa agendamento que nasce confirmado; chave fixa no profissional | `useAppointmentNotifications.ts:189`; `ProfessionalLayout.tsx:31` |
| 18 | Telefone do estabelecimento aceita texto livre | `TenantDtos.java:81` |
| 19 | Sem comissão, caixa, recibo, total gasto, avaliação | `PaymentController.java`; `ClientService.java:54-64` |
| 20 | Painel conta pendentes só de hoje; "Cancelamentos e faltas" usa `updated_at` (qualquer edição muda a data) | `Dashboard.tsx:32-35`; `DashboardSummaryService.java:70-73` |

### 🟢 Detalhes
Contraste do "Aceitar" 3,3:1, "Recusar" 3,6:1 e "Cancelar" no escuro 2,0:1; rótulo "Faltou" × "Não compareceu"; alvos de toque de 16–21 px; horário aparece duas vezes em "Falta só um passo"; agendamento público sempre escuro; comentário em `ReminderService.java:38-40` cita `pg_advisory_xact_lock` que não existe; `?status=pending` retorna 400.

---

## 6. Funcionalidades e melhorias recomendadas

- **Central de pendências** com aprovação em um toque, inclusive pelo link recebido no WhatsApp ou e-mail do dono (token de uso único).
- **Expiração e escalonamento:** pedido sem resposta do dono → aviso por e-mail/push e, no fim, liberação automática com mensagem ao cliente.
- **Confirmação de presença** no lembrete (1 = vou, 2 = cancelar) e liberação do horário quando cancelar.
- **Link único de gestão** (cancelar, reagendar, adicionar ao calendário) na confirmação e nos lembretes.
- **Fechamento do atendimento:** valor pago, forma de pagamento (Pix, dinheiro, cartão), desconto, gorjeta, comissão por profissional, fechamento de caixa do dia e recibo.
- **Histórico do cliente:** total gasto, visitas, faltas, última visita, serviço preferido; reativação de inativos.
- **Avaliação pós-atendimento** em 1 toque, com resposta e filtro no painel.
- **Fila de espera e encaixes** quando o horário está cheio.
- **UX do cliente:** aviso "estamos acordando o servidor" após ~3 s de espera, mensagens de erro que distinguem fora do ar × sem internet, indicador que conte as etapas reais (hoje diz "3/3" e ainda vêm código e confirmação).
- **UX do dono:** sino com contador persistente, push no celular, aprovação rápida na própria notificação, erros visíveis em todas as ações.

---

## 7. Backlog priorizado e checklist de pronto para uso real

Esforço: P (≤ 1 dia), M (2–4 dias), G (> 1 semana). Dependências indicadas.

### P0: bloqueadores
| # | Item | Esforço | Depende de | Está pronto quando... |
|---|---|---|---|---|
| 1 | Fechar o vazamento do `/book` e exigir prova de posse em cancelar, reagendar e `my-appointments` | M | — | `/book` nunca devolve id/nome de cliente existente sem token de aparelho; os testes `gap_c7_*` invertidos passam; um UUID sozinho não lê nem cancela nada |
| 2 | Máquina de estados em `updateStatus` + conflito ao reativar | P | — | Transições inválidas retornam 409; reabrir cancelado com horário ocupado retorna 409 |
| 3 | Notificações do ciclo (admin: novo pedido e cancelamento; cliente: aprova, recusa, cancela) via outbox com e-mail + sino + `wa.me` | G | #6 SMTP, decisão de canal | Cada evento da tabela da seção 4 gera uma linha na outbox e é entregue, com retry e log; falha de envio não derruba a operação |
| 4 | Remover ou proteger `/booking` e `/register-and-book` | P | — | Os endpoints deixam de existir (ou usam as mesmas regras do `/book`); `gap_c9_*` invertidos |
| 5 | Validar passado/janela/expediente em `/book`, admin e reagendar | P | — | Todos rejeitam data passada e fora do expediente; reagendar confirmado volta a PENDENTE ou avisa o dono |
| 6 | Lembretes confiáveis: marcar só se enviado, retry, catch-up, só confirmados, WhatsApp padrão | M | #3 | Provedor falho gera nova tentativa; lembrete não se perde por serviço dormindo; testes `gap_*` de lembrete invertidos |
| 7 | Keep-alive do Render (ping externo em `/health`) ou plano que não durma | P | — | Com 15 min sem tráfego, o serviço continua rodando os agendadores [NÃO VERIFICADO] |
| 8 | Timeouts no `WhatsappService` e captura de qualquer exceção no envio | P | — | Provedor travado não segura a requisição por mais de ~5 s; exceção cai para pendente |
| 9 | Exigir telefone válido do estabelecimento para ativar o link público | P | — | Sem telefone, o link público avisa o dono; telefone inválido é rejeitado |

### P1: essenciais
| # | Item | Esforço | Depende de | Está pronto quando... |
|---|---|---|---|---|
| 10 | Status "recusado" com motivo e aviso ao cliente | M | #3 | O motivo é gravado e enviado; o horário é liberado |
| 11 | Remarcação/sugestão de horário pelo admin com aceite do cliente | M | #3 | O cliente aceita pelo link; o horário antigo é liberado |
| 12 | Status "em atendimento" (iniciar) | P | #2 | Botão e transição validados no backend |
| 13 | Pagamento ao concluir (valor pago, forma, desconto) + comissão por profissional | G | — | O fechamento do dia fecha com o somatório do caixa |
| 14 | Corrigir o webhook do Pix e validar a assinatura | P | — | Pagamento de teste chega ao backend e não altera cancelado/concluído |
| 15 | Tratar erro visível na Agenda | P | — | Falha de API mostra aviso e não gera erro no console |
| 16 | Link de cancelar/reagendar na confirmação | P | #1 | Link funciona só com token de aparelho |
| 17 | Confirmação de presença no lembrete | M | #3 | Resposta 1/2 atualiza o agendamento |
| 18 | Push web e sino persistente com contador | M | — | O dono recebe aviso com o painel fechado |
| 19 | Backup do banco e monitoramento (uptime e erros) | M | — | Restauração testada; alerta chega no celular |
| 20 | SMTP real configurado e e-mail de verificação funcionando | P | decisão do dono | E-mail de teste chega fora do spam |

### P2: diferenciais
Avaliação pós-atendimento · recibo · fila de espera · reativação de inativos · pacotes e assinaturas · relatórios de comissão · API oficial da Meta com templates · aviso "servidor acordando" · acessibilidade (contraste e alvos de toque) · tema claro no agendamento público.

### Checklist de pronto para uso real (barbeiro real, clientes reais)
- [ ] #1 vazamento do `/book` corrigido e testado
- [ ] #2 transições validadas
- [ ] #3 admin e cliente recebem os avisos essenciais
- [ ] #4 e #5 fluxos legados fechados e datas validadas
- [ ] #6 lembretes confiáveis
- [ ] #7 serviço não dorme (ou agendadores rodam de outra forma)
- [ ] Telefone do estabelecimento cadastrado e validado
- [ ] SMTP configurado (`SMTP_USER`, `SMTP_PASS`) e testado
- [ ] `TURNSTILE_SECRET_KEY` e `VITE_TURNSTILE_SITE_KEY` configurados
- [ ] `APP_URL` correto em produção
- [ ] Backup do banco antes de rodar as migrações V8–V12 e rotina de backup
- [ ] Monitoramento de uptime e de erros
- [ ] Cadastro real do estabelecimento (serviços, profissionais, horários) revisado pelo dono
- [ ] Teste real em celular com um número do próprio dono antes de abrir ao público

---

## 8. Itens [NÃO VERIFICADO] e o que preciso de você

**Não verificado (e como validar):**
- Produção (Render e Vercel): variáveis, logs e comportamento real do sono do serviço. Validar parando o tráfego por 15 min e conferindo se `PendingExpiryService` e `ReminderService` rodam ao acordar.
- Envio real por WhatsApp, e-mail e SMS: tudo foi mockado por regra da tarefa.
- Existência de ping externo no Render: não há nada no repositório, o que não prova que não exista.
- Duas instâncias simultâneas: duplicidade de lembretes é uma dedução por leitura (`ReminderService.java:38-40` cita um lock que não existe). Validar subindo 2 instâncias.
- Valores atuais de preço, categorias e regras da API oficial da Meta [CONFIRMAR na documentação atual antes de decidir].
- Rate limit por IP do `/book` via HTTP: o perfil de teste eleva o limite; a lógica tem teste unitário em `PhoneBookingIntegrationTest`.
- Contraste e toque foram medidos por script nas capturas; vale uma revisão visual.

**O que preciso de você:**
1. **Canal de aviso ao dono:** e-mail + sino + push + link `wa.me` (custo zero) como primeiro passo, ou já partir para a API oficial da Meta?
2. **Número do WhatsApp:** da plataforma Nimbo, ou de cada estabelecimento? Se for da plataforma, é preciso um número que possa ser verificado (não precisa ser o seu pessoal).
3. **SMTP:** conta e senha de aplicativo para o envio de e-mail.
4. **Política de cancelamento:** manter 60 min fixos ou configurar por estabelecimento?
5. **Recusa:** posso criar o status "recusado" com motivo obrigatório?
6. **Render:** aceita um ping externo gratuito (UptimeRobot ou similar) ou prefere migrar para um plano que não durma?
7. **Comissão:** percentual por profissional, por serviço, ou os dois?
8. **Fluxos legados:** posso removê-los de vez? Nenhuma rota atual do app os chama; só dois componentes órfãos (`BookingFlow.tsx`, `BookingAuthGate.tsx`) e um método do `PublicTenantContext` que não achei consumidor público.

# Teste de ponta a ponta: do cliente à finalização do serviço

Data: 2026-11-24 · Branch: `chore/teste-e2e-fluxo` (a partir da `main`, com as PRs #31 a #36 já mescladas)
Escopo: cliente agenda → dono e profissional decidem → mensagem automática ao cliente → lembretes → atendimento concluído, falta ou cancelamento → números nas telas. **Pagamento ficou de fora** (ainda não existe).
Método: navegador real (Chrome, Playwright) + backend real (Java 21, jar da `main`) + banco PostgreSQL real e descartável + um servidor falso da Evolution API que **grava** cada mensagem que o backend tenta enviar. Nada real foi enviado. O banco e o backend de desenvolvimento (portas 5433 e 3334) ficaram intocados (confirmado: nenhum estabelecimento `e2e-*` existe lá e o backend de desenvolvimento segue respondendo).
Duas rodadas completas, do zero, com estabelecimento novo em cada uma: **desktop (1280×900)** e **celular (390×844)**. Nenhum código do sistema foi alterado.

---

## 1. Resumo executivo

**O fluxo funciona de ponta a ponta.** Em cada rodada, **78 verificações passaram, 2 falharam e 4 são ressalvas** (84 no total). Os dois aparelhos deram **o mesmo resultado**, sem nenhum erro de página no navegador e **sem nenhum ERROR ou WARN no log do backend**. Do pedido do cliente até o serviço concluído, o que foi testado funcionou, incluindo a parte nova (modal de segurança e confirmação automática pelo WhatsApp).

**Nota de prontidão do fluxo testado: 80/100** (julgamento meu, para operar com o WhatsApp configurado). Os pontos que impedem uma nota maior estão na seção 3: o `/book` aceita data inválida, o aviso de novo pedido chega sem o nome do cliente, o cliente não tem como gerenciar o próprio agendamento no fluxo novo, remarcar mantém "confirmado" e cancelar depende só de um UUID.

**O que foi provado de ponta a ponta**
- O dono se cadastra e configura tudo **pela interface**: cadastro, login, integração WhatsApp, serviço, profissional com foto e antecedência mínima (com a prévia em palavras).
- O cliente agenda pela página pública, no celular e no desktop: validações, **código de 6 dígitos que chega ao WhatsApp**, código errado recusado, aparelho reconhecido na 2ª reserva sem novo código, dois serviços viram dois agendamentos seguidos com o mesmo profissional, antecedência mínima respeitada, horário bloqueado some, portal pausado.
- Estabelecimento **sem WhatsApp**: tela "Falta só um passo!" com o `wa.me` do estabelecimento, prazo para o cliente confirmar, dois clientes no mesmo horário (só um vence), pedido sem confirmação que **vence e libera o horário**, e quem já tocou em "Confirmar no WhatsApp" **não vence**.
- **Modal de segurança**: "Voltar" não muda nada, "Sim, confirmar" confirma, para o dono e para o profissional.
- **Confirmação automática**: a mensagem chegou ao WhatsApp falso **em cerca de 0,1 s** depois do "Sim", com o texto certo. Aprovação, recusa e cancelamento pelo dono (e a recusa pelo profissional) enviam cada uma a mensagem certa.
- **WhatsApp fora do ar**: o agendamento é confirmado do mesmo jeito, a tela mostra o botão "Avisar X no WhatsApp" como reserva, a fila guarda o erro e **reenviou sozinha 68 s depois** que o WhatsApp voltou.
- **Sem WhatsApp** (dono pela tela): o modal avisa que não é automático e, depois de confirmar, aparece o botão de reserva e o link "Ativar o envio automático".
- **Lembretes**: o confirmado a ~2 h e o confirmado a ~24 h ("amanhã") recebem **uma única vez**; o pedido ainda pendente não recebe.
- **Finalização**: concluir (dono e profissional) e marcar falta funcionam; estados finais não voltam atrás (409 com mensagem explicando na tela).
- **Números batem com o banco** no Painel (receita, cancelamentos e faltas), em Agendamentos (contagem de cada status), em Relatórios (receita do ano) e em "Meu faturamento" do profissional.
- **Isolamento**: o profissional vê só os pedidos dele e não mexe no do colega (403); não acessa rotas do dono (403); o dono de outro estabelecimento não vê nem altera nada alheio.

---

## 2. Como ler a tabela

✅ passou · ❌ falhou (problema do sistema) · ⚠️ funciona com ressalva, ou lacuna conhecida que continua aberta · — não aplicável. A evidência vem do banco, do servidor falso de WhatsApp ou da tela. Capturas de tela ficam em `e2e/screenshots/` (não versionadas).

| ID | Verificação | Desktop | Celular | Evidência (desktop) |
|---|---|:-:|:-:|---|
| | **A. Preparação do estabelecimento** | | | |
| A1 | Cadastro do dono pela tela /signup | ✅ | ✅ | slug e2e-d-w5irb |
| A2 | Login do dono leva ao painel | ✅ | ✅ | http://localhost:5199/admin/dashboard |
| A3 | Painel vazio sem rolagem horizontal | ✅ | ✅ | overflowX=0; captura screenshots/A3-painel-vazio-d-w5irb.png |
| A4 | API de login devolve token e tenant | ✅ | ✅ | status 200 |
| A5 | Integração WhatsApp salva pela tela e reconhecida pelo backend | ✅ | ✅ | salvo=true; banco=http://127.0.0.1:4599; whatsappAuto=true |
| A6 | Serviço criado pela tela aparece na lista | ✅ | ✅ |  |
| A6b | Três serviços cadastrados (Corte, Barba, Combo) | ✅ | ✅ | ["Barba E2E","Corte + Barba E2E","Corte E2E"] |
| A7 | Profissional criado pela tela, com foto e sem "Registro duplicado" | ✅ | ✅ | foto 775 caracteres; alerta duplicado=0 |
| A7b | Profissional criado sem marcar serviços atende todos os 3 | ✅ | ✅ | vínculos=3 |
| A8 | Segundo profissional (só Corte, com login) criado | ✅ | ✅ | status 201 |
| A9 | Antecedência de 1 hora salva pela tela, com prévia em palavras | ✅ | ✅ | banco=60; prévia=Agora são 18:00: o primeiro horário que o cliente consegue marcar é hoje às 19:00. Antece |
| | **B. Cliente agenda pela página pública** | | | |
| B1 | Página pública lista os 3 serviços sem rolagem horizontal | ✅ | ✅ | serviços=3; overflowX=0; screenshots/B1-servicos-d-w5irb.png |
| B2 | Formulário vazio mostra erro e não envia | ✅ | ✅ |  |
| B2b | Telefone inválido não avança | ✅ | ✅ | http://localhost:5199/e2e-d-w5irb/dados?s=f095f6a8-c108-481e-b835-ca8b681c6ef9&d=2026-11-24&t=20%3A45 |
| B3 | Reserva com WhatsApp pede o código e o backend o envia ao WhatsApp | ✅ | ✅ | na tela de código=true; código recebido=064981 |
| B3b | Código errado é recusado com aviso | ✅ | ✅ | na tela de código=true; aviso=true |
| B3c | Código certo conclui a reserva; agendamento nasce PENDENTE no banco | ✅ | ✅ | linhas=["195b559d-8a39-48bb-8c01-0dbc1f6b7b25","pending","2026-11-24","20:45","21:15","Ana Cliente irb","Corte E2E","Marcos E2E"] |
| B4 | Aparelho reconhecido: 2ª reserva sai direto, com dados preenchidos e sem novo código | ✅ | ✅ | preenchido="Ana Cliente irb"; novo código=false |
| B5 | Dois serviços viram 2 agendamentos seguidos com o mesmo profissional | ✅ | ✅ | [["Corte E2E","20:15","20:45","Ronald E2E"],["Barba E2E","20:45","21:15","Ronald E2E"]] |
| B6 | Antecedência de 1 h: nenhum horário de hoje antes de agora + 60 min | ✅ | ✅ | horários hoje=14; antes do limite=0; limite 19:00 |
| B7 | Bloqueio do dono tira o horário do profissional, mas outro profissional ainda atende | ✅ | ✅ | bloqueio 201; Ronald tem 10:00=false; "qualquer" tem 10:00=true |
| B8 | Com o estabelecimento fechado a página mostra "Agendamentos pausados" | ✅ | ✅ |  |
| | **C. Dono recebe o pedido, confirma e o cliente é avisado** | | | |
| C1 | Novo pedido: o dono recebe aviso no WhatsApp do estabelecimento | ✅ | ✅ | Novo pedido de agendamento em Barbearia E2E d-w5irb. \| \| Cliente: Dani irb \| Celular: (11) 95303-0008 \| Serviço: Corte E2E \|  |
| C1b | O aviso ao dono passou pela fila (WhatsApp enviado; e-mail ignorado por falta de SMTP) | ✅ | ✅ | [["EMAIL","SKIPPED","SMTP não configurado","1"],["WHATSAPP","SENT","","1"]] |
| C1c | 6 clientes reservaram com código e os agendamentos estão PENDENTES | ✅ | ✅ | pending,pending,pending,pending,pending,pending |
| C2 | Agendamentos mostra os pendentes no resumo e na caixa "Aguardando confirmação" | ✅ | ✅ | pendentes no banco=10; resumo="4 Hoje 10 Pendentes 10 Próx. 7 dias"; caixa="Aguardando confirmação 10 Recolher" |
| C2b | Sino do painel indica um pedido que chega com a tela aberta (consulta a cada 30 s) | ✅ | ✅ | rótulo do sino="Notificações (1 novas)" |
| C2c | O aviso de novo pedido (sino e aviso flutuante) mostra o nome do cliente | ❌ | ❌ | sem o nome; texto do aviso="Novo agendamento" |
| C3 | Confirmar abre o modal de segurança com cliente e aviso do envio automático | ✅ | ✅ | Confirmar agendamento? Dani irb · Corte E2E 26/11/2026 às 00:45 Ao confirmar, a mensagem de confirmação é enviada automaticamente  |
| C3b | "Voltar" fecha o modal e nada muda no banco | ✅ | ✅ | status=pending |
| C3c | "Sim, confirmar" muda para CONFIRMADO e a mensagem sai sozinha ao cliente | ✅ | ✅ | latência até o WhatsApp ≈ 0s; texto="Olá, Dani! Seu horário em Barbearia E2E d-w5irb está confirmado: Corte E2E com Ronald E2E, 26 |
| C3d | A tela mostra "Confirmação enviada para X pelo WhatsApp" (sem botão de reserva) | ✅ | ✅ |  |
| C3e | Fila: aprovação ao cliente com WhatsApp ENVIADO | ✅ | ✅ | [["WHATSAPP","SENT","","1"]] |
| C4 | WhatsApp fora do ar: o agendamento é confirmado e a tela oferece o link "Avisar X" como reserva | ✅ | ✅ | confirmado=true; link=true; fila=[["WHATSAPP","PENDING","falha no envio pelo WhatsApp","1"]] |
| C4b | Fila guarda o erro e a mensagem continua PENDENTE para nova tentativa | ✅ | ✅ | [["WHATSAPP","PENDING","falha no envio pelo WhatsApp","1"]] |
| C5 | Confirmação em massa: modal de aviso, 2 confirmados e 1 mensagem para cada cliente | ✅ | ✅ | confirmados=true; msgs=true,true |
| C6 | Recusar um pendente: vira CANCELADO e o cliente recebe a mensagem de recusa com o link para reagendar | ✅ | ✅ | cancelado=true; texto="Olá, Hugo. Não conseguimos atender 26/11/2026 às 06:45 em Barbearia E2E d-w5irb. Escolha outro horário: htt |
| C7 | Dono cancela um confirmado: CANCELADO e o cliente é avisado do cancelamento | ✅ | ✅ | texto="Olá, Dani. Seu horário de 26/11/2026 às 00:45 em Barbearia E2E d-w5irb foi cancelado. Para reagendar: http://localhost:5199 |
| C8 | Confirmar algo já decidido: o servidor recusa (409), o banco não muda e a tela explica o erro | ✅ | ✅ | alerta="Este agendamento está cancelado e não pode passar para confirmado. Atualize a tela." |
| | **D. Profissional aceita e recusa só os pedidos dele** | | | |
| D1 | Profissional entra pelo login e cai no portal dele | ✅ | ✅ | http://localhost:5199/professional/dashboard |
| D2 | Profissional vê os pedidos dele e NENHUM do colega | ✅ | ✅ | vê os dele=true; vê do colega=false |
| D2b | Minha Agenda sem rolagem horizontal | ✅ | ✅ | overflowX=0 |
| D3 | Aceitar abre o modal de segurança também para o profissional | ✅ | ✅ | Confirmar agendamento? Ju irb · Corte E2E 26/11/2026 às 06:00 Ao confirmar, a mensagem de confirmação é enviada automaticamente ao |
| D3b | "Voltar" não confirma | ✅ | ✅ |  |
| D3c | Profissional confirma: CONFIRMADO, mensagem automática ao cliente e aviso na tela dele | ✅ | ✅ | confirmado=true; msg=true; faixa=true |
| D4 | Profissional recusa (com confirmação): CANCELADO e o cliente recebe a recusa | ✅ | ✅ | modal=true; cancelado=true; msg=true |
| D5 | Profissional não consegue mexer no agendamento do colega (403) | ✅ | ✅ | status 403 |
| D6 | Profissional não acessa as rotas do dono (403) | ✅ | ✅ | status 403 |
| | **E. Atendimento, finalização, lembretes e conferência dos números** | | | |
| E1 | Dono conclui o atendimento: COMPLETED, sem mensagem desnecessária ao cliente | ✅ | ✅ | status=completed; mensagens ao cliente=0 |
| E2 | Dono marca falta: NO_SHOW | ✅ | ✅ | status=no_show |
| E3 | Concluído não volta (409) nem cancela (409); falta não volta a confirmado (409) | ✅ | ✅ | concluído→confirmado 409; concluído→cancelado 409; falta→confirmado 409 |
| E4 | Profissional conclui o atendimento dele: COMPLETED | ✅ | ✅ | status=completed |
| E5 | Lembrete de 2 h: o confirmado recebe uma única vez | ✅ | ✅ | recebeu=true; vezes=1; texto="Olá Remi irb! 🔔 Daqui a pouco é o seu horário em *Barbearia E2E d-w5irb*! 🕐 *Horário:* 19:15 ✂️ *P |
| E5b | Lembrete de 24 h: o confirmado recebe uma única vez, com "amanhã" | ✅ | ✅ | recebeu=true; vezes=1; texto="Olá Cris irb! 👋 Lembrete: você tem um agendamento *amanhã* em *Barbearia E2E d-w5irb*! 📅 *Data:* Q |
| E5c | Pedido ainda PENDENTE não recebe lembrete | ✅ | ✅ | lembretes=0 |
| E6 | Painel: "Receita Total" = soma dos concluídos no banco | ✅ | ✅ | banco=R$ 90,00 |
| E6b | Painel: cancelamentos + faltas dos últimos 7 dias batem com o banco | ✅ | ✅ | banco=5; card="Cancelamentos e faltas recentes últimos 7 dias 5 4 cancelados 1 falta" |
| E6c | Agendamentos: contagem de cada status no filtro = banco | ✅ | ✅ | banco={"Pendentes":7,"Confirmados":4,"Concluídos":2,"Faltas":1,"Cancelados":4}; tela=["Todos (18)","Pendentes (7)","Confirmados (4 |
| E6d | Relatórios (Ano): receita = soma dos concluídos do ano no banco | ✅ | ✅ | banco=R$ 90,00 |
| E6e | Faturamento do profissional (mês) = concluídos dele no banco | ✅ | ✅ | banco=R$ 45,00 |
| E7 | Depois que o WhatsApp volta, a fila reenvia a confirmação que tinha falhado (C4) | ✅ | ✅ | entregue 60 s após o WhatsApp voltar |
| E8 | Pedido sem confirmação vence e o horário volta a ficar livre | ✅ | ✅ | linhas=[["cancelled"]]; horário livre=true |
| E8b | Quem já tocou em "Confirmar no WhatsApp" (Caio) NÃO vence: segue pendente aguardando o dono | ✅ | ✅ | status=pending |
| | **F. Cliente cancela e reagenda** | | | |
| F1 | Cliente consulta os próprios agendamentos pelo id devolvido no cadastro | ✅ | ✅ | status 200 |
| F2 | Cliente remarca: o horário muda e o dono é avisado | ✅ | ✅ | resposta 200; novo horário=00:00; status depois=pending; aviso ao dono=true |
| F3 | Cliente cancela: CANCELADO, o dono é avisado e o horário volta a ficar livre | ✅ | ✅ | resposta 200; aviso ao dono=true; horário livre=true |
| F4 | Cliente não tem caminho de "Meus agendamentos" no fluxo novo (a rota antiga pede login/cadastro) | ⚠️ | ⚠️ | BE Barbearia E2E d-w5irb Rua dos Testes, 100, Centro, São Paulo Entrar Faça login para ver seus agendamentos. Barbearia E2E d-w5ir |
| F5 | Remarcado pelo cliente, o agendamento continua CONFIRMADO no novo horário sem o dono aprovar | ⚠️ | ⚠️ | status depois=confirmed; novo horário=00:00; dono avisado=true |
| | **G. Regressão de problemas conhecidos (só observação)** | | | |
| G1 | Pedido pendente não devolve nome/telefone/id do cliente já cadastrado | ✅ | ✅ | resposta={"id":null,"name":"Atacante","phone":null} |
| G2 | Cancelar/reagendar exige só o id (UUID) do cliente, sem token nem código (lacuna conhecida) | ⚠️ | ⚠️ | qualquer posse do UUID cancela o agendamento |
| G3 | Reserva pública rejeita data passada e data além de 60 dias | ❌ | ❌ | ontem=200; +250 dias=200; gravados no banco=[["2026-11-23","cancelled"],["2026-11-23","cancelled"],["2026-11-23","cancelled"],["20 |
| G4 | Endpoint antigo /booking não existe mais | ✅ | ✅ | status 404 |
| G5 | O backend aceita agendamento do admin em data passada (a tela bloqueia, a API não) | ⚠️ | ⚠️ | status 201 |
| G6 | Dono de outro estabelecimento não vê nem altera agendamentos alheios | ✅ | ✅ | alterar=404; lista contém o alheio=false |
| G7 | Sem login as rotas do dono respondem 401/403 | ✅ | ✅ | status 401 |
| | **N. Estabelecimento sem WhatsApp (pedido pendente)** | | | |
| N1 | Segundo estabelecimento criado (sem WhatsApp configurado) | ✅ | ✅ | cadastro 201 |
| N2 | Sem WhatsApp configurado o backend informa whatsappAuto=false | ✅ | ✅ | {"whatsappAuto":false} |
| N3 | Sem WhatsApp: tela "Falta só um passo!" com botão para o WhatsApp do estabelecimento | ✅ | ✅ | link=https://wa.me/5511977770001?text=Olá! Sou Caio Pendente irb e confirmo meu horário: Corte Pendente com Pro Pendente, terça-fe |
| N4 | Pedido nasce PENDENTE com prazo para o cliente confirmar | ✅ | ✅ | status=pending; prazo=t |
| N5 | Ao tocar em "Confirmar no WhatsApp" o servidor registra a confirmação do cliente | ✅ | ✅ | client_confirmed_at=t; confirm_by=f |
| N6 | Dois pedidos simultâneos para o mesmo horário: um é aceito e o outro recebe conflito (409) | ✅ | ✅ | respostas=[200,409]; horário 00:45 |
| N7a | Pedido para teste de vencimento criado (será conferido na fase E) | ✅ | ✅ | status 200 |
| N8 | Profissional sem serviço vinculado: mensagem clara, sem o erro "serviços juntos" | ✅ | ✅ | aviso=1; mensagem antiga=0 |
| N9 | Sem WhatsApp: modal avisa que não é automático; depois de confirmar aparece o botão "Avisar" (wa.me) e o caminho para ativar | ✅ | ✅ | modal="Confirmar agendamento? Dora irb · Corte Pendente 26/11/2026 às 03:45 O envio automático pelo WhatsApp não está"; confirmado |


---

## 3. Problemas encontrados (do mais grave ao menos grave)

Severidade: **Alta** = pode causar dano ou perda de confiança no uso real; **Média** = atrapalha o uso ou abre risco; **Baixa** = detalhe.

### 3.1 Alta: a reserva pública aceita data passada e data a mais de 60 dias (G3)
- **O que acontece:** `POST /api/public/{slug}/book` aceitou `ontem` e `daqui a 250 dias` (HTTP 200). O banco gravou os dois como PENDENTES (ex.: cliente "Passado" em `2026-11-23` e "Longe" em `2027-08-01`). Eles acabam cancelados quando o prazo de confirmação vence; até lá ocupam a agenda e **o dono recebe aviso de "novo pedido"** de algo impossível.
- **Causa provável:** `PhoneBookingService.withinWindow` (linha 412) só é usada na listagem de dias e horários (linhas 90 e 111). O método `book` (linhas 156 a 213) não a chama e também não confere se o horário pedido está entre os horários oferecidos nem respeita a antecedência mínima.
- **Reproduzir:** `e2e/flow.mjs`, fase G, cenário G3.
- **Sugestão:** validar no `book` a data (hoje até +60 dias), que o horário esteja na lista de horários livres e a antecedência mínima.

### 3.2 Média: o aviso de novo pedido chega sem o nome do cliente (C2c)
- **O que acontece:** com o painel aberto, quando um cliente novo reserva, o aviso flutuante "Novo agendamento!", o sino e a notificação do navegador mostram **"— · Corte E2E às 09:45"**, sem quem pediu. Reproduzido nos dois aparelhos (captura `C3d-faixa-enviada-*`, canto inferior, e `C2c-sino-aberto-*`).
- **Causa provável:** `useAppointmentNotifications.ts` (linhas 132 e 180) procura o cliente na lista carregada quando a tela abriu e, se o cliente é novo, cai em `'—'`. É justamente o aviso mais importante do dono.
- **Sugestão:** quando o cliente não estiver na lista, recarregar os clientes antes de montar o aviso, ou o servidor já devolver o nome junto do agendamento.

### 3.3 Média: o cliente não tem como ver, cancelar ou remarcar no fluxo novo (F4)
A tela de confirmação só oferece "Fazer outro agendamento". `/{slug}/my-appointments` é a rota antiga e pede login ou cadastro ("Faça login para ver seus agendamentos"). Cancelar e remarcar **existem na API** (testados em F1 a F3 e funcionam: o dono é avisado e o horário volta a ficar livre), mas não há caminho na tela para o cliente. Já era a pendência "link de cancelar/remarcar na confirmação".

### 3.4 Média: remarcar um agendamento já confirmado o mantém confirmado (F5)
Quando o cliente remarca um agendamento que o dono tinha confirmado, ele continua **CONFIRMADO** no novo horário **sem o dono aprovar**. O dono é avisado (testado), mas nada o obriga a olhar. Um agendamento ainda pendente continua pendente (F2).

### 3.5 Média: cancelar e remarcar só exigem o UUID do cliente (G2)
`PATCH /api/public/{slug}/appointments/{id}/cancel` com `{clientId}` funcionou sem token e sem código. O UUID não é adivinhável, mas quem o obtiver cancela ou remarca o agendamento. Sugestão: exigir o token do aparelho (`X-Device-Token`) ou um código novo, junto com a tela do item 3.3.

### 3.6 Média (risco): limite de login por IP pode barrar uma barbearia inteira
Durante o teste, depois de alguns logins seguidos pelo mesmo IP o backend passou a devolver **429**. A configuração é de 10 logins por 15 minutos por IP (`application.yml`, `login-capacity: 10`; e `auth-capacity: 20`). Numa barbearia com a equipe no mesmo Wi-Fi, ou em redes de operadora que dividem um IP (CGNAT), vários logins legítimos podem bater nesse teto. Para rodar o teste eu elevei esses limites; a configuração de produção não foi alterada. Vale revisar o limite por IP ou passar a contar por e-mail.

### 3.7 Baixa: o backend aceita agendamento do admin em data passada (G5)
A tela do admin bloqueia, mas `POST /api/admin/appointments` aceitou uma data de dois dias atrás (201). Só alguém logado como dono consegue, então o risco é baixo; ainda assim vale validar no servidor.

### 3.8 Observações (não são defeitos)
- **Pedido pendente cujo horário já passou fica pendente para sempre** (sem prazo, só o dono resolve). Ele continua somando em "Pendentes" no resumo, mas **sai da caixa "Aguardando confirmação"**, que só mostra horários futuros: numa rodada repetida o resumo mostrava 14 e a caixa 13 (o 14º era um pedido retroativo de 22/11). O dono precisa achá-lo pelo filtro "Pendentes". Considere resolver sozinho (por exemplo, marcar como não realizado) depois que o horário passa.
- **Pedido que o cliente confirmou pelo WhatsApp nunca vence** e segue reservando o horário até o dono decidir (E8b). É o desenho combinado, mas, se o dono ignorar, o horário fica preso. Considere um limite (por exemplo, liberar depois do horário do atendimento).
- **E-mail sempre "ignorado"** sem SMTP: todos os avisos de novo pedido por e-mail foram marcados como ignorados. Funciona como previsto, só lembra que o e-mail ao dono ainda não existe.
- **Caixa de pendentes do profissional mostra 2 por vez** ("Ver todos (N)"): não é problema, mas o teste precisou expandir.

---

## 4. Números medidos

| Medida | Resultado |
|---|---|
| Clique em "Sim, confirmar" até a mensagem no WhatsApp | ≈ 0,1 s |
| WhatsApp volta depois de ficar fora do ar até o reenvio da fila | 68 s (espera de 1 min da fila + agendador de 15 s) |
| Lembretes de 2 h e de 24 h | entregues dentro dos 70 s que o teste espera, depois de confirmados (agendador a cada 15 s no teste; em produção é a cada 5 min) |
| Pedido sem confirmação (prazo de 3 min no teste) | cancelado e horário liberado em até ~4,5 min |
| Fila de mensagens ao final (somando todas as rodadas feitas neste banco, inclusive ajustes do teste) | nenhuma presa: 33 aprovações, 13 recusas, 4 cancelamentos pelo dono, 8 cancelamentos e 4 remarcações do cliente, 79 avisos ao dono, 4 lembretes de 2 h e 4 de 24 h enviados; só ficaram "ignorados" o e-mail (sem SMTP) e o WhatsApp do estabelecimento sem integração |

---

## 5. O que este teste NÃO cobre

- **Pagamento** (Pix, Mercado Pago, comissão, caixa), por decisão.
- **WhatsApp real:** o servidor é falso, então não foram testados pareamento por QR, número bloqueado, mensagem recusada pela Meta nem entrega no aparelho.
- **E-mail real (SMTP)** e **notificação push**.
- **Captcha (Turnstile)**, que fica desligado sem a chave.
- **Produção:** Vercel, Render dormindo (cerca de 107 s para acordar), atualização do PWA ("Nova versão disponível").
- **Lembretes ao dono** (2 h e 1 h antes de um pedido pendente) e o webhook do Pix.
- Concorrência acima de 2 pedidos simultâneos e a virada da meia-noite.
- O horário de atendimento foi configurado como 24 h só para o teste não depender da hora em que roda.

---

## 6. Como repetir

```bash
# 1) jar do backend (a partir da main, sem mexer no seu ambiente de desenvolvimento)
git worktree add --detach /tmp/be-wt origin/main
(cd /tmp/be-wt/backend-java && ./mvnw -DskipTests package)

# 2) sobe a pilha isolada: Postgres 5434, backend 3399, frontend 5199, WhatsApp falso 4599
cd e2e && npm install
node stack.mjs up --jar /tmp/be-wt/backend-java/target/agendepro-backend.jar

# 3) roda o roteiro (cada rodada leva cerca de 10 minutos, por causa dos lembretes e do vencimento do pedido)
node flow.mjs desktop      # 1280x900
node flow.mjs mobile       # 390x844
node make-report-table.mjs # tabela de resultados

# 4) desmonta tudo
node stack.mjs down
```
Mais detalhes em `e2e/README.md`.

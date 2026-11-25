# Teste de ponta a ponta: do cliente à finalização do serviço

Data: 2026-11-24 · Branch: `chore/teste-e2e-fluxo` (a partir da `main`, com as PRs #31 a #36 já mescladas)
Escopo: cliente agenda → dono e profissional decidem → mensagem automática ao cliente → lembretes → atendimento concluído, falta ou cancelamento → números nas telas. **Pagamento ficou de fora** (ainda não existe).
Método: navegador real (Chrome, Playwright) + backend real (Java 21, jar da `main`) + banco PostgreSQL real e descartável + um servidor falso da Evolution API que **grava** cada mensagem que o backend tenta enviar. Nada real foi enviado. O banco e o backend de desenvolvimento (portas 5433 e 3334) ficaram intocados (confirmado: nenhum estabelecimento `e2e-*` existe lá e o backend de desenvolvimento segue respondendo).
Duas rodadas completas, do zero, com estabelecimento novo em cada uma: **desktop (1280×900)** e **celular (390×844)**. O teste em si não alterou o sistema.

> **Atualização (2026-11-25):** todos os problemas da seção 3 foram corrigidos na branch `fix/problemas-teste-e2e` e as duas rodadas foram refeitas do zero: **108 verificações ok, 0 falhas, 0 ressalvas em cada aparelho** (seção 7). A seção 3 fica como registro do que foi encontrado.

---

## 1. Resumo executivo

**O fluxo funciona de ponta a ponta.** Na primeira rodada (antes das correções): 78 verificações ok, 2 falhas e 4 ressalvas em cada aparelho. Depois das correções (seção 7): **108 ok, 0 falhas, 0 ressalvas** nos dois aparelhos, sem erro de página no navegador e sem ERROR ou WARN inesperado no log do backend (o único ERROR é a falha de WhatsApp simulada de propósito). Do pedido do cliente até o serviço concluído, o que foi testado funcionou, incluindo a parte nova (modal de segurança e confirmação automática pelo WhatsApp).

**Nota de prontidão do fluxo testado: 80/100 antes das correções; 90/100 depois** (julgamento meu, para operar com o WhatsApp configurado). O que ainda separa de uma nota maior: o pagamento não existe, e as observações da seção 3.8 e da seção 7 continuam como decisões de produto.

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
| A1 | Cadastro do dono pela tela /signup | ✅ | ✅ | slug e2e-d-3gfjt |
| A2 | Login do dono leva ao painel | ✅ | ✅ | http://localhost:5199/admin/dashboard |
| A3 | Painel vazio sem rolagem horizontal | ✅ | ✅ | overflowX=0; captura screenshots/A3-painel-vazio-d-3gfjt.png |
| A4 | API de login devolve token e tenant | ✅ | ✅ | status 200 |
| A5 | Integração WhatsApp salva pela tela e reconhecida pelo backend | ✅ | ✅ | salvo=true; banco=http://127.0.0.1:4599; whatsappAuto=true |
| A6 | Serviço criado pela tela aparece na lista | ✅ | ✅ |  |
| A6b | Três serviços cadastrados (Corte, Barba, Combo) | ✅ | ✅ | ["Barba E2E","Corte + Barba E2E","Corte E2E"] |
| A7 | Profissional criado pela tela, com foto e sem "Registro duplicado" | ✅ | ✅ | foto 775 caracteres; alerta duplicado=0 |
| A7b | Profissional criado sem marcar serviços atende todos os 3 | ✅ | ✅ | vínculos=3 |
| A8 | Segundo profissional (só Corte, com login) criado | ✅ | ✅ | status 201 |
| A9 | Antecedência de 1 hora salva pela tela, com prévia em palavras | ✅ | ✅ | banco=60; prévia=Agora são 08:23: o primeiro horário que o cliente consegue marcar é hoje às 09:23. Antece |
| | **B. Cliente agenda pela página pública** | | | |
| B1 | Página pública lista os 3 serviços sem rolagem horizontal | ✅ | ✅ | serviços=3; overflowX=0; screenshots/B1-servicos-d-3gfjt.png |
| B2 | Formulário vazio mostra erro e não envia | ✅ | ✅ |  |
| B2b | Telefone inválido não avança | ✅ | ✅ | http://localhost:5199/e2e-d-3gfjt/dados?s=8f36e6f1-0a5a-4819-8958-729c31773b41&d=2026-11-25&t=11%3A00 |
| B3 | Reserva com WhatsApp pede o código e o backend o envia ao WhatsApp | ✅ | ✅ | na tela de código=true; código recebido=703489 |
| B3b | Código errado é recusado com aviso | ✅ | ✅ | na tela de código=true; aviso=true |
| B3c | Código certo conclui a reserva; agendamento nasce PENDENTE no banco | ✅ | ✅ | linhas=["479d721f-7596-4a5b-834f-57ebfd1fd8a8","pending","2026-11-25","11:00","11:30","Ana Cliente fjt","Corte E2E","Marcos E2E"] |
| B4 | Aparelho reconhecido: 2ª reserva sai direto, com dados preenchidos e sem novo código | ✅ | ✅ | preenchido="Ana Cliente fjt"; novo código=false |
| B5 | Dois serviços viram 2 agendamentos seguidos com o mesmo profissional | ✅ | ✅ | [["Corte E2E","10:30","11:00","Ronald E2E"],["Barba E2E","11:00","11:30","Ronald E2E"]] |
| B6 | Antecedência de 1 h: nenhum horário de hoje antes de agora + 60 min | ✅ | ✅ | horários hoje=53; antes do limite=0; limite 09:24 |
| B7 | Bloqueio do dono tira o horário do profissional, mas outro profissional ainda atende | ✅ | ✅ | bloqueio 201; Ronald tem 10:00=false; "qualquer" tem 10:00=true |
| B8 | Com o estabelecimento fechado a página mostra "Agendamentos pausados" | ✅ | ✅ |  |
| | **C. Dono recebe o pedido, confirma e o cliente é avisado** | | | |
| C1 | Novo pedido: o dono recebe aviso no WhatsApp do estabelecimento | ✅ | ✅ | Novo pedido de agendamento em Barbearia E2E d-3gfjt. \| \| Cliente: Dani fjt \| Celular: (11) 95497-0008 \| Serviço: Corte E2E \|  |
| C1b | O aviso ao dono passou pela fila (WhatsApp enviado; e-mail ignorado por falta de SMTP) | ✅ | ✅ | [["EMAIL","SKIPPED","SMTP não configurado","1"],["WHATSAPP","SENT","","1"]] |
| C1c | 6 clientes reservaram com código e os agendamentos estão PENDENTES | ✅ | ✅ | pending,pending,pending,pending,pending,pending |
| C2 | Agendamentos mostra os pendentes no resumo e na caixa "Aguardando confirmação" | ✅ | ✅ | pendentes no banco=10; resumo="4 Hoje 10 Pendentes 10 Próx. 7 dias"; caixa="Aguardando confirmação 10 Recolher" |
| C2b | Sino do painel indica um pedido que chega com a tela aberta (consulta a cada 30 s) | ✅ | ✅ | rótulo do sino="Notificações (1 novas)" |
| C2c | O aviso de novo pedido (sino e aviso flutuante) mostra o nome do cliente | ✅ | ✅ | nome presente |
| C2d | Contador "Pendentes" do resumo é igual ao número da caixa "Aguardando confirmação" (mesma regra) | ✅ | ✅ | resumo=10; caixa=10; banco=10 |
| C3 | Confirmar abre o modal de segurança com cliente e aviso do envio automático | ✅ | ✅ | Confirmar agendamento? Dani fjt · Corte E2E 27/11/2026 às 00:45 Ao confirmar, a mensagem de confirmação é enviada automaticamente  |
| C3b | "Voltar" fecha o modal e nada muda no banco | ✅ | ✅ | status=pending |
| C3c | "Sim, confirmar" muda para CONFIRMADO e a mensagem sai sozinha ao cliente | ✅ | ✅ | latência até o WhatsApp ≈ 0.1s; texto="Olá, Dani! Seu horário em Barbearia E2E d-3gfjt está confirmado: Corte E2E com Ronald E2E,  |
| C3d | A tela mostra "Confirmação enviada para X pelo WhatsApp" (sem botão de reserva) | ✅ | ✅ |  |
| C3e | Fila: aprovação ao cliente com WhatsApp ENVIADO | ✅ | ✅ | [["WHATSAPP","SENT","","1"]] |
| C4 | WhatsApp fora do ar: o agendamento é confirmado e a tela oferece o link "Avisar X" como reserva | ✅ | ✅ | confirmado=true; link=true; fila=[["WHATSAPP","PENDING","falha no envio pelo WhatsApp","1"]] |
| C4b | Fila guarda o erro e a mensagem continua PENDENTE para nova tentativa | ✅ | ✅ | [["WHATSAPP","PENDING","falha no envio pelo WhatsApp","1"]] |
| C5 | Confirmação em massa: modal de aviso, 2 confirmados e 1 mensagem para cada cliente | ✅ | ✅ | confirmados=true; msgs=true,true |
| C6 | Recusar um pendente: vira CANCELADO e o cliente recebe a mensagem de recusa com o link para reagendar | ✅ | ✅ | cancelado=true; texto="Olá, Hugo. Não conseguimos atender 27/11/2026 às 06:45 em Barbearia E2E d-3gfjt. Escolha outro horário: htt |
| C7 | Dono cancela um confirmado: CANCELADO e o cliente é avisado do cancelamento | ✅ | ✅ | texto="Olá, Dani. Seu horário de 27/11/2026 às 00:45 em Barbearia E2E d-3gfjt foi cancelado. Para reagendar: http://localhost:5199 |
| C8 | Confirmar algo já decidido: o servidor recusa (409), o banco não muda e a tela explica o erro | ✅ | ✅ | alerta="Este agendamento está cancelado e não pode passar para confirmado. Atualize a tela." |
| | **D. Profissional aceita e recusa só os pedidos dele** | | | |
| D1 | Profissional entra pelo login e cai no portal dele | ✅ | ✅ | http://localhost:5199/professional/dashboard |
| D2 | Profissional vê os pedidos dele e NENHUM do colega | ✅ | ✅ | vê os dele=true; vê do colega=false |
| D2b | Minha Agenda sem rolagem horizontal | ✅ | ✅ | overflowX=0 |
| D3 | Aceitar abre o modal de segurança também para o profissional | ✅ | ✅ | Confirmar agendamento? Ju fjt · Corte E2E 27/11/2026 às 06:00 Ao confirmar, a mensagem de confirmação é enviada automaticamente ao |
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
| E5 | Lembrete de 2 h: o confirmado recebe uma única vez | ✅ | ✅ | recebeu=true; vezes=1; texto="Olá Remi fjt! 🔔 Daqui a pouco é o seu horário em *Barbearia E2E d-3gfjt*! 🕐 *Horário:* 09:30 ✂️ *P |
| E5b | Lembrete de 24 h: o confirmado recebe uma única vez, com "amanhã" | ✅ | ✅ | recebeu=true; vezes=1; texto="Olá Cris fjt! 👋 Lembrete: você tem um agendamento *amanhã* em *Barbearia E2E d-3gfjt*! 📅 *Data:* Q |
| E5c | Pedido ainda PENDENTE não recebe lembrete | ✅ | ✅ | lembretes=0 |
| E6 | Painel: "Receita Total" = soma dos concluídos no banco | ✅ | ✅ | banco=R$ 90,00 |
| E6b | Painel: cancelamentos + faltas dos últimos 7 dias batem com o banco | ✅ | ✅ | banco=5; card="Cancelamentos e faltas recentes últimos 7 dias 5 4 cancelados 1 falta" |
| E6c | Agendamentos: contagem de cada status no filtro = banco | ✅ | ✅ | banco={"Pendentes":7,"Confirmados":4,"Concluídos":2,"Faltas":1,"Cancelados":4}; tela=["Todos (18)","Pendentes (7)","Confirmados (4 |
| E6d | Relatórios (Ano): receita = soma dos concluídos do ano no banco | ✅ | ✅ | banco=R$ 90,00 |
| E6e | Faturamento do profissional (mês) = concluídos dele no banco | ✅ | ✅ | banco=R$ 45,00 |
| E7 | Depois que o WhatsApp volta, a fila reenvia a confirmação que tinha falhado (C4) | ✅ | ✅ | entregue 66 s após o WhatsApp voltar |
| E8 | Pedido sem confirmação vence e o horário volta a ficar livre | ✅ | ✅ | linhas=[["cancelled"]]; horário livre=true |
| E8b | Quem já tocou em "Confirmar no WhatsApp" (Caio) NÃO vence: segue pendente aguardando o dono | ✅ | ✅ | status=pending |
| | **F. Cliente cancela e reagenda** | | | |
| F0b | Confirmação por código devolve o X-Device-Token do aparelho (prova de posse) | ✅ | ✅ | token=43 caracteres |
| F1 | Listar "meus agendamentos": sem token 403 DEVICE_REQUIRED; com o token do aparelho 200 (por clientId e por /book/my-appointments) | ✅ | ✅ | sem token=403/DEVICE_REQUIRED; /book sem token=403; com token=200; /book com token=200 |
| F2 | Cliente remarca (com o token, sem clientId): o horário muda e o dono é avisado; sem token é 403 | ✅ | ✅ | sem token=403; com token=200; novo horário=00:00; status depois=pending; aviso ao dono=true |
| F2a | Remarcar para ontem ou para daqui a 250 dias é recusado (400 INVALID_DATE) e o agendamento não muda | ✅ | ✅ | ontem=400/INVALID_DATE; +250=400/INVALID_DATE; no banco=2026-11-28 09:00 |
| F3 | Cliente cancela (com o token): CANCELADO, o dono é avisado e o horário volta a ficar livre; sem token é 403 | ✅ | ✅ | sem token=403; com token=200; aviso ao dono=true; horário livre=true |
| F4 | GET /book/my-appointments com o token de um cliente lista os agendamentos dele e não os de outro | ✅ | ✅ | status=200; ids=1; tem o de outro cliente=false |
| F5 | Remarcar um CONFIRMADO: volta a PENDENTE (confirm_by nulo, client_confirmed_at preenchido) e o dono é avisado | ✅ | ✅ | antes=confirmed; resposta=200; depois=pending,00:00,t,t; dono avisado=true |
| | **G. Regressão de problemas conhecidos (só observação)** | | | |
| G1 | Pedido pendente não devolve nome/telefone/id do cliente já cadastrado | ✅ | ✅ | resposta={"id":null,"name":"Atacante","phone":null} |
| G2 | Cancelar/remarcar/listar exigem o token do MESMO cliente: sem token, token de outro cliente, inventado e de outro estabelecimento  | ✅ | ✅ | sem token: cancelar=403 remarcar=403 listar=403; token de outro+clientId=403; token de outro sem clientId=404/NOT_FOUND; inventado |
| G3 | Reserva pública rejeita data passada e data além de 60 dias com 400 INVALID_DATE e nada é gravado | ✅ | ✅ | ontem=400; +250 dias=400; gravados no banco=[] |
| G4 | Endpoint antigo /booking não existe mais | ✅ | ✅ | status 404 |
| G5 | Admin não cria agendamento no passado (ontem e há 2 h): 400 INVALID_DATE e nada gravado | ✅ | ✅ | dia passado=400/INVALID_DATE; há 2 h=400/INVALID_DATE; gravados=0 |
| G6 | Dono de outro estabelecimento não vê nem altera agendamentos alheios | ✅ | ✅ | alterar=404; lista contém o alheio=false |
| G7 | Sem login as rotas do dono respondem 401/403 | ✅ | ✅ | status 401 |
| | **H. Pendente que já passou do horário é cancelado sozinho** | | | |
| H1 | Pendente cujo horário passou há 25 min vira CANCELADO sozinho (agendador de pendentes) | ✅ | ✅ | status=cancelled |
| H2 | Dentro da folga de 15 min (5 min atrás) continua pendente; confirmado e pendente futuro não são tocados | ✅ | ✅ | folga=pending; confirmado=confirmed; futuro=pending |
| | **M. Meus agendamentos (aparelho reconhecido)** | | | |
| M0 | Preparação: cliente agenda pelo navegador com código e o aparelho fica reconhecido | ✅ | ✅ | agendamento=["5481eaa3-a2dd-4ef3-b99a-adc5a32d58dc","pending","2026-11-30","02:00","02:30"] |
| M1 | Tela de confirmação oferece "Ver meus agendamentos" e a lista mostra o agendamento (serviço, dia, hora, situação) | ✅ | ✅ | entrada=1; cartão="Corte E2E Aguardando confirmação segunda-feira, 30 de novembro às 02:00 com Marcos E2E · R$ 45,00 Remarcar Canc |
| M1b | Meus agendamentos sem rolagem horizontal | ✅ | ✅ | overflowX=0 |
| M2 | Aparelho reconhecido: link "Meus agendamentos" no cabeçalho abre a lista (e ela sobrevive a recarregar) | ✅ | ✅ | link=1; cartões depois de recarregar=1 |
| M2b | Dentro da própria tela o atalho do cabeçalho some (sem link para si mesmo) | ✅ | ✅ | links=0 |
| M3 | Remarcar confirmado: novo horário no banco, status volta a PENDENTE, aviso "nova confirmação" na tela e dono avisado no WhatsApp | ✅ | ✅ | etiqueta confirmado=true; aviso=true; banco=["pending","2026-11-27","00:45"] (era 2026-11-30 02:00); dono avisado=true; texto="Rem |
| M3a | Remarcar (escolha de dia e horário) sem rolagem horizontal | ✅ | ✅ | overflowX=0 |
| M3b | Remarcar (confirmação) sem rolagem horizontal | ✅ | ✅ | overflowX=0 |
| M3c | "Escolher outro" na confirmação não muda nada no banco | ✅ | ✅ | banco=["confirmed","2026-11-30","02:00"] |
| M3d | Lista depois de remarcar sem rolagem horizontal | ✅ | ✅ | overflowX=0 |
| M4 | Cancelar: banco CANCELADO, aviso na tela, cartão vai para o Histórico e o dono é avisado no WhatsApp | ✅ | ✅ | aviso=true; banco=cancelled; dono avisado=true |
| M4a | "Manter horário" não cancela nada | ✅ | ✅ | status=pending |
| M4b | Lista com histórico sem rolagem horizontal | ✅ | ✅ | overflowX=0 |
| M5 | Faltando menos de 1 h: o cartão não tem botões e explica que é preciso falar com o estabelecimento | ✅ | ✅ | botões=0; texto="Corte E2E Confirmado quarta-feira, 25 de novembro às 08:59 com Marcos E2E · R$ 45,00 Faltam menos de 1 hora para  |
| M5a | Aparelho reconhecido agenda de novo sem pedir código (preparação do cenário "menos de 1 h") | ✅ | ✅ | agendamento=dc48ca87-0f47-4406-ae3c-a099cf7f504a |
| M5b | Cartão "menos de 1 h" sem rolagem horizontal | ✅ | ✅ | overflowX=0 |
| M5c | O servidor também recusa cancelar com menos de 1 h (400) | ✅ | ✅ | resposta=400; status=confirmed |
| M6 | Aparelho sem token: sem atalho no cabeçalho; a tela diz "Confirme seu celular" e o botão leva ao início | ✅ | ✅ | atalho=0; mensagem=true; botão=1; voltou ao início=true; overflowX=0 |
| M7 | Token do aparelho inválido: mensagem amigável "Confirme seu celular", sem erro técnico | ✅ | ✅ | Meus agendamentos Confirme seu celular para gerenciar seus agendamentos. Faça um agendamento e confirme o código enviad |
| | **N. Estabelecimento sem WhatsApp (pedido pendente)** | | | |
| N1 | Segundo estabelecimento criado (sem WhatsApp configurado) | ✅ | ✅ | cadastro 201 |
| N2 | Sem WhatsApp configurado o backend informa whatsappAuto=false | ✅ | ✅ | {"whatsappAuto":false} |
| N3 | Sem WhatsApp: tela "Falta só um passo!" com botão para o WhatsApp do estabelecimento | ✅ | ✅ | link=https://wa.me/5511977770001?text=Olá! Sou Caio Pendente fjt e confirmo meu horário: Corte Pendente com Pro Pendente, quarta-f |
| N4 | Pedido nasce PENDENTE com prazo para o cliente confirmar | ✅ | ✅ | status=pending; prazo=t |
| N5 | Ao tocar em "Confirmar no WhatsApp" o servidor registra a confirmação do cliente | ✅ | ✅ | client_confirmed_at=t; confirm_by=f |
| N6 | Dois pedidos simultâneos para o mesmo horário: um é aceito e o outro recebe conflito (409) | ✅ | ✅ | respostas=[409,200]; horário 00:45 |
| N7a | Pedido para teste de vencimento criado (será conferido na fase E) | ✅ | ✅ | status 200 |
| N8 | Profissional sem serviço vinculado: mensagem clara, sem o erro "serviços juntos" | ✅ | ✅ | aviso=1; mensagem antiga=0 |
| N9 | Sem WhatsApp: modal avisa que não é automático; depois de confirmar aparece o botão "Avisar" (wa.me) e o caminho para ativar | ✅ | ✅ | modal="Confirmar agendamento? Dora fjt · Corte Pendente 27/11/2026 às 03:45 O envio automático pelo WhatsApp não está"; confirmado |

---

## 3. Problemas encontrados (do mais grave ao menos grave)

Severidade: **Alta** = pode causar dano ou perda de confiança no uso real; **Média** = atrapalha o uso ou abre risco; **Baixa** = detalhe.

### 3.1 Alta: a reserva pública aceita data passada e data a mais de 60 dias (G3) — ✅ CORRIGIDO
- **O que acontece:** `POST /api/public/{slug}/book` aceitou `ontem` e `daqui a 250 dias` (HTTP 200). O banco gravou os dois como PENDENTES (ex.: cliente "Passado" em `2026-11-23` e "Longe" em `2027-08-01`). Eles acabam cancelados quando o prazo de confirmação vence; até lá ocupam a agenda e **o dono recebe aviso de "novo pedido"** de algo impossível.
- **Causa provável:** `PhoneBookingService.withinWindow` (linha 412) só é usada na listagem de dias e horários (linhas 90 e 111). O método `book` (linhas 156 a 213) não a chama e também não confere se o horário pedido está entre os horários oferecidos nem respeita a antecedência mínima.
- **Reproduzir:** `e2e/flow.mjs`, fase G, cenário G3.
- **Sugestão:** validar no `book` a data (hoje até +60 dias), que o horário esteja na lista de horários livres e a antecedência mínima.

### 3.2 Média: o aviso de novo pedido chega sem o nome do cliente (C2c) — ✅ CORRIGIDO
- **O que acontece:** com o painel aberto, quando um cliente novo reserva, o aviso flutuante "Novo agendamento!", o sino e a notificação do navegador mostram **"— · Corte E2E às 09:45"**, sem quem pediu. Reproduzido nos dois aparelhos (captura `C3d-faixa-enviada-*`, canto inferior, e `C2c-sino-aberto-*`).
- **Causa provável:** `useAppointmentNotifications.ts` (linhas 132 e 180) procura o cliente na lista carregada quando a tela abriu e, se o cliente é novo, cai em `'—'`. É justamente o aviso mais importante do dono.
- **Sugestão:** quando o cliente não estiver na lista, recarregar os clientes antes de montar o aviso, ou o servidor já devolver o nome junto do agendamento.

### 3.3 Média: o cliente não tem como ver, cancelar ou remarcar no fluxo novo (F4) — ✅ CORRIGIDO
A tela de confirmação só oferece "Fazer outro agendamento". `/{slug}/my-appointments` é a rota antiga e pede login ou cadastro ("Faça login para ver seus agendamentos"). Cancelar e remarcar **existem na API** (testados em F1 a F3 e funcionam: o dono é avisado e o horário volta a ficar livre), mas não há caminho na tela para o cliente. Já era a pendência "link de cancelar/remarcar na confirmação".

### 3.4 Média: remarcar um agendamento já confirmado o mantém confirmado (F5) — ✅ CORRIGIDO
Quando o cliente remarca um agendamento que o dono tinha confirmado, ele continua **CONFIRMADO** no novo horário **sem o dono aprovar**. O dono é avisado (testado), mas nada o obriga a olhar. Um agendamento ainda pendente continua pendente (F2).

### 3.5 Média: cancelar e remarcar só exigem o UUID do cliente (G2) — ✅ CORRIGIDO
`PATCH /api/public/{slug}/appointments/{id}/cancel` com `{clientId}` funcionou sem token e sem código. O UUID não é adivinhável, mas quem o obtiver cancela ou remarca o agendamento. Sugestão: exigir o token do aparelho (`X-Device-Token`) ou um código novo, junto com a tela do item 3.3.

### 3.6 Média (risco): limite de login por IP pode barrar uma barbearia inteira — ✅ CORRIGIDO
Durante o teste, depois de alguns logins seguidos pelo mesmo IP o backend passou a devolver **429**. A configuração é de 10 logins por 15 minutos por IP (`application.yml`, `login-capacity: 10`; e `auth-capacity: 20`). Numa barbearia com a equipe no mesmo Wi-Fi, ou em redes de operadora que dividem um IP (CGNAT), vários logins legítimos podem bater nesse teto. Para rodar o teste eu elevei esses limites; a configuração de produção não foi alterada. Vale revisar o limite por IP ou passar a contar por e-mail.

### 3.7 Baixa: o backend aceita agendamento do admin em data passada (G5) — ✅ CORRIGIDO
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
# se a 5434 já estiver ocupada na sua máquina: export E2E_DB_PORT=5435
node stack.mjs up --jar /tmp/be-wt/backend-java/target/agendepro-backend.jar

# 3) roda o roteiro (cada rodada leva cerca de 10 minutos, por causa dos lembretes e do vencimento do pedido)
node flow.mjs desktop      # 1280x900
node flow.mjs mobile       # 390x844
node make-report-table.mjs # tabela de resultados

# 4) desmonta tudo
node stack.mjs down
```
Mais detalhes em `e2e/README.md`.

---

## 7. Correções aplicadas e reteste (2026-11-25)

Branch `fix/problemas-teste-e2e`. Cada correção tem teste automatizado e cenário no roteiro de ponta a ponta.

| Item | O que mudou | Prova no reteste |
|---|---|---|
| 3.1 G3 | `/book`, a confirmação por código e a remarcação rejeitam data passada ou além de 60 dias (400 `INVALID_DATE`) | G3 ✅: ontem=400, +250 dias=400, nada gravado |
| 3.2 C2c | O painel atualiza os clientes junto com os agendamentos (a cada 30 s) e o profissional passou a ter essa atualização; sem nome mostra "Novo cliente", não "—" | C2c ✅ no desktop e no celular |
| 3.3 F4 | Nova tela "Meus agendamentos" (`/:slug/meus-agendamentos`): ver, cancelar e remarcar; atalho no cabeçalho e na tela de confirmação | M0 a M7 ✅ (remarcar, cancelar, menos de 1 h, aparelho sem token), sem rolagem lateral |
| 3.4 F5 | Remarcar um confirmado volta a Pendente (cliente já confirmou, dono avisado) | F5 ✅ |
| 3.5 G2 | Cancelar, remarcar e listar exigem o token do aparelho do mesmo cliente (403 `DEVICE_REQUIRED`); o portal antigo recebe o token ao entrar | G2 ✅: sem token, de outro cliente, inventado e de outro estabelecimento |
| 3.6 | Limite de login por IP 10→30 e geral 20→60; a trava de 5 falhas por e-mail continua | L1/L2 ✅ (`e2e/limits.mjs`, com os limites reais): 30 logins passam, o 31º é bloqueado |
| 3.7 G5 | A API do admin rejeita data e hora que já passaram | G5 ✅ |
| 3.8 | Pedido pendente cujo horário passou há mais de 15 min é cancelado sozinho; o contador "Pendentes" e a caixa "Aguardando confirmação" usam a mesma regra | H1/H2 ✅ e C2d ✅ (resumo = caixa = banco) |

**Testes:** backend 255 testes verdes (`./mvnw test`), frontend 564 verdes, `tsc`, lint e build sem erro.
**Rodadas finais:** desktop 108 ok, celular 108 ok, 0 falhas, 0 ressalvas, 0 erros de página. Fila de notificações sem mensagem presa.

**Ficou como decisão de produto (não é defeito):**
- O cancelamento automático de pendente vencido **não avisa** cliente nem dono.
- Cada login do portal antigo cria um aparelho novo (validade de 90 dias) e não há limpeza dos vencidos.
- A remarcação não exige a antecedência mínima de 1 h do `/book` nem confere expediente e bloqueios (já era assim).
- Quem reserva pelo caminho sem WhatsApp (pendente + "Confirmar no WhatsApp") não recebe token de aparelho e, por isso, não consegue ver nem cancelar pelo site.
- A tela de confirmação tem o link "Meus agendamentos" no cabeçalho e o botão "Ver meus agendamentos" ao mesmo tempo (redundante); no celular a faixa de dias mostra pouco mais de 2 dias.

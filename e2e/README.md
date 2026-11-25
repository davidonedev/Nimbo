# Teste de ponta a ponta (cliente → serviço concluído)

Roteiro automatizado que usa o sistema de verdade: navegador (Chrome), backend, banco PostgreSQL e um **WhatsApp falso** que só grava o que o backend tenta enviar. Nada real é enviado e o banco/backend de desenvolvimento não são usados. O resultado completo da última execução está em `../RELATORIO_TESTE_E2E.md`.

## Pilha isolada (portas)
| Peça | Porta |
|---|---|
| Postgres descartável (`nimbo-e2e-pg`, Docker) | 5434 (ou `E2E_DB_PORT`, se a 5434 estiver ocupada por outro container) |
| Backend (jar) | 3399 |
| Frontend (Vite) | 5199 |
| WhatsApp falso (`fake-evolution.mjs`) | 4599 |

O backend sobe numa pasta vazia (para não importar o `.env` de desenvolvimento), com `PENDING_CONFIRM_MINUTES=3`, lembretes a cada 15 s e limites de taxa elevados (o teste faz dezenas de logins pelo mesmo IP). Sem SMTP: e-mail aparece como "ignorado".

## Como rodar
```bash
# jar do backend, sem mexer no seu ambiente: use um worktree da main
git worktree add --detach /tmp/be-wt origin/main
(cd /tmp/be-wt/backend-java && ./mvnw -DskipTests package)

cd e2e
npm install                      # só instala o playwright-core aqui dentro
node stack.mjs up --jar /tmp/be-wt/backend-java/target/agendepro-backend.jar
node flow.mjs desktop            # 1280x900
node flow.mjs mobile             # 390x844
node make-report-table.mjs       # tabela em Markdown a partir dos results-*.json

# limites de taxa REAIS (login 30/IP, auth 60/IP): o flow roda com limites elevados; esta checagem reinicia o backend sem sobrescrevê-los
node stack.mjs restart-backend --real-limits
node limits.mjs
node stack.mjs restart-backend   # volta aos limites elevados
node stack.mjs down              # para tudo e remove o container
```
Cada rodada leva cerca de 10 minutos (espera dos lembretes e do vencimento do pedido). Para uma fase só: `node flow.mjs desktop --only C --resume` (o `--resume` reaproveita o estado salvo da rodada anterior).

## Fases
A preparação do estabelecimento (pela interface) · B cliente agenda · N estabelecimento sem WhatsApp · C dono decide (modal de segurança, confirmação automática, WhatsApp fora do ar, massa, recusa, cancelamento, tela desatualizada) · D profissional · E atendimento, lembretes, vencimento e números · F cliente cancela e remarca · G regressão de problemas conhecidos (inclui prova de posse por `X-Device-Token`, datas inválidas 400 `INVALID_DATE`) · H pendente com horário já passado há mais de 15 min vira cancelado sozinho (a data/hora é recuada por SQL só no banco isolado e o agendador roda a cada 5 s via `APP_PENDING_EXPIRY_CHECK_MS`).

O log da aplicação fica em `.run/backend-app.log` (o stdout do java destacado no Windows não chega ao `backend.log`).

## Requisitos
Docker, Java 21, Node 22, Chrome instalado (usa `channel: 'chrome'`) e `frontend/node_modules` instalado (`npm ci` no `frontend`).

## Arquivos gerados (não versionados)
`.run/` (logs e estado), `screenshots/`, `results-*.json`, `run-*.log`.

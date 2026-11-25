# Teste de ponta a ponta (cliente → serviço concluído)

Roteiro automatizado que usa o sistema de verdade: navegador (Chrome), backend, banco PostgreSQL e um **WhatsApp falso** que só grava o que o backend tenta enviar. Nada real é enviado e o banco/backend de desenvolvimento não são usados. O resultado completo da última execução está em `../RELATORIO_TESTE_E2E.md`.

## Pilha isolada (portas)
| Peça | Porta |
|---|---|
| Postgres descartável (`nimbo-e2e-pg`, Docker) | 5434 |
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
node stack.mjs down              # para tudo e remove o container
```
Cada rodada leva cerca de 10 minutos (espera dos lembretes e do vencimento do pedido). Para uma fase só: `node flow.mjs desktop --only C --resume` (o `--resume` reaproveita o estado salvo da rodada anterior).

## Fases
A preparação do estabelecimento (pela interface) · B cliente agenda · N estabelecimento sem WhatsApp · C dono decide (modal de segurança, confirmação automática, WhatsApp fora do ar, massa, recusa, cancelamento, tela desatualizada) · D profissional · E atendimento, lembretes, vencimento e números · F cliente cancela e remarca · G regressão de problemas conhecidos.

## Requisitos
Docker, Java 21, Node 22, Chrome instalado (usa `channel: 'chrome'`) e `frontend/node_modules` instalado (`npm ci` no `frontend`).

## Arquivos gerados (não versionados)
`.run/` (logs e estado), `screenshots/`, `results-*.json`, `run-*.log`.

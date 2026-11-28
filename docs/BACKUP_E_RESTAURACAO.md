# Backup e restauração do banco

O plano gratuito do Supabase **não faz backup diário** [CONFIRMAR em supabase.com/docs/guides/platform/backups]. Sem uma rotina sua, uma exclusão por engano ou um problema no projeto significa perder agenda e clientes. Esta rotina leva 10 minutos para montar.

## Fazer o backup

Use o script do seu sistema (os dois só gravam um arquivo na sua máquina):

- Windows: `backend-java/scripts/backup-db.ps1`
- Linux/Mac: `backend-java/scripts/backup-db.sh`

Passos (uma vez):
1. Instale o cliente do PostgreSQL (`pg_dump`).
2. No Supabase, em **Project Settings → Database → Connection string**, copie a URL do **Session pooler**.
3. Guarde a URL numa variável de ambiente só no seu computador: `NIMBO_BACKUP_DATABASE_URL`. **Nunca** coloque a URL, a senha ou o arquivo `.dump` no repositório, que é público.
4. Rode o script. O arquivo `nimbo-AAAA-MM-DD_HH-mm.dump` aparece em `~/backups-nimbo` (ou na pasta que você passar). Os 14 mais recentes ficam guardados.

Agendar todo dia (Windows): Agendador de Tarefas → nova tarefa diária → ação "Iniciar um programa" → `powershell` com os argumentos `-File C:\caminho\backup-db.ps1`. Copie a pasta de backups de vez em quando para um segundo lugar (pen drive, Google Drive pessoal): um backup que só existe no computador que quebrou não ajuda.

## Testar a restauração (faça uma vez antes do piloto)

Um backup que nunca foi restaurado não é prova de nada. Com o Docker instalado:

```bash
docker run -d --name teste-restore -e POSTGRES_PASSWORD=teste -p 5440:5432 postgres:16-alpine
# espere uns segundos e crie o banco
docker exec teste-restore psql -U postgres -c "create database restaurado"
pg_restore --no-owner --no-privileges -h localhost -p 5440 -U postgres -d restaurado ~/backups-nimbo/nimbo-AAAA-MM-DD_HH-mm.dump
docker exec teste-restore psql -U postgres -d restaurado -c "select count(*) from appointments; select count(*) from clients;"
docker rm -f teste-restore
```

Os números devem bater com o painel. Anote a data do teste.

## Restaurar em produção (emergência)

1. Avise o barbeiro e desligue o link público (Configurações → "Aberto para agendamentos" desligado, ou `isOpen=false` pelo Super Admin).
2. Crie um projeto novo no Supabase (ou limpe o banco) e rode `pg_restore --no-owner --no-privileges -d "<URL do banco novo>" arquivo.dump`.
3. No Render, troque `DB_URL`, `DB_USERNAME` e `DB_PASSWORD` para o banco restaurado e faça o deploy.
4. Confira `https://<backend>/health/deep` (deve dizer `database: ok`) e entre no painel.
5. Reabra o link público.

O Flyway não precisa rodar de novo: o dump já traz a tabela `flyway_schema_history` e as migrations aplicadas.

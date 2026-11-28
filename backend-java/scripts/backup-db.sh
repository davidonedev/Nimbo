#!/usr/bin/env bash
# Backup do banco do Nimbo (PostgreSQL do Supabase) para um arquivo na maquina onde o script roda.
# Defina NIMBO_BACKUP_DATABASE_URL (URL do Session pooler do Supabase) so no ambiente, nunca no repositorio.
# Uso: NIMBO_BACKUP_DATABASE_URL=... ./backup-db.sh [pasta] [quantos-manter]
set -euo pipefail
: "${NIMBO_BACKUP_DATABASE_URL:?Defina NIMBO_BACKUP_DATABASE_URL}"
dir="${1:-$HOME/backups-nimbo}"
keep="${2:-14}"
mkdir -p "$dir"
file="$dir/nimbo-$(date +%Y-%m-%d_%H-%M).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$file" "$NIMBO_BACKUP_DATABASE_URL"
echo "Backup salvo: $file ($(du -h "$file" | cut -f1))"
ls -1t "$dir"/nimbo-*.dump | tail -n +"$((keep + 1))" | xargs -r rm -f

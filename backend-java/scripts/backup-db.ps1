<#
Backup do banco do Nimbo (PostgreSQL do Supabase) para um arquivo no SEU computador.

Antes de usar:
  1. Instale o cliente do PostgreSQL (traz o pg_dump): https://www.postgresql.org/download/windows/ (so "Command Line Tools").
  2. No Supabase: Project Settings > Database > Connection string (Session pooler) e copie a URL.
  3. Defina a URL numa variavel de ambiente SO na sua maquina (nunca no repositorio):
       setx NIMBO_BACKUP_DATABASE_URL "postgresql://postgres.xxxx:SENHA@aws-0-regiao.pooler.supabase.com:5432/postgres"

Uso:  powershell -File backup-db.ps1 [-Pasta D:\backups-nimbo] [-Manter 14]
O arquivo fica so no seu computador (o repositorio e publico: nunca suba um dump para o GitHub).
#>
param(
  [string]$Pasta = (Join-Path $HOME 'backups-nimbo'),
  [int]$Manter = 14
)

$ErrorActionPreference = 'Stop'
$url = $env:NIMBO_BACKUP_DATABASE_URL
if (-not $url) { throw 'Defina NIMBO_BACKUP_DATABASE_URL (veja o topo deste arquivo).' }
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) { throw 'pg_dump nao encontrado: instale o cliente do PostgreSQL.' }

New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
$arquivo = Join-Path $Pasta ("nimbo-" + (Get-Date -Format 'yyyy-MM-dd_HH-mm') + '.dump')

pg_dump --format=custom --no-owner --no-privileges --file="$arquivo" "$url"
if ($LASTEXITCODE -ne 0) { Remove-Item $arquivo -ErrorAction SilentlyContinue; throw "pg_dump falhou (codigo $LASTEXITCODE)." }

$tamanho = [math]::Round((Get-Item $arquivo).Length / 1MB, 2)
Write-Output "Backup salvo: $arquivo ($tamanho MB)"

# Guarda so os $Manter mais recentes
Get-ChildItem $Pasta -Filter 'nimbo-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Manter | Remove-Item -Force

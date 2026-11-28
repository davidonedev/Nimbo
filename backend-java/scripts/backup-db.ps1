<#
Backup do banco do Nimbo (PostgreSQL do Supabase) para um arquivo no SEU computador.

Antes de usar:
  1. Tenha o pg_dump (cliente do PostgreSQL: https://www.postgresql.org/download/windows/, so "Command Line Tools")
     OU o Docker Desktop instalado (o script usa o pg_dump de dentro de uma imagem do PostgreSQL, sem instalar nada).
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
$temPgDump = [bool](Get-Command pg_dump -ErrorAction SilentlyContinue)
$temDocker = [bool](Get-Command docker -ErrorAction SilentlyContinue)
if (-not $temPgDump -and -not $temDocker) { throw 'Instale o cliente do PostgreSQL (pg_dump) ou o Docker Desktop.' }

New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
$nome = 'nimbo-' + (Get-Date -Format 'yyyy-MM-dd_HH-mm') + '.dump'
$arquivo = Join-Path $Pasta $nome

if ($temPgDump) {
  pg_dump --format=custom --no-owner --no-privileges --file="$arquivo" "$url"
} else {
  # sem pg_dump local: usa o de dentro da imagem oficial do PostgreSQL e grava na mesma pasta
  docker run --rm -v "$($Pasta):/backup" postgres:16-alpine pg_dump --format=custom --no-owner --no-privileges --file="/backup/$nome" "$url"
}
if ($LASTEXITCODE -ne 0) { Remove-Item $arquivo -ErrorAction SilentlyContinue; throw "pg_dump falhou (codigo $LASTEXITCODE)." }

$tamanho = [math]::Round((Get-Item $arquivo).Length / 1MB, 2)
Write-Output "Backup salvo: $arquivo ($tamanho MB)"

# Guarda so os $Manter mais recentes
Get-ChildItem $Pasta -Filter 'nimbo-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Manter | Remove-Item -Force

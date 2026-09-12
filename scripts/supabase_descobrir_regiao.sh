#!/usr/bin/env bash
# =============================================================================
# BION — Descobre a região do projeto Supabase sondando os poolers regionais
# (não requer token; requer a senha do banco já definida via SQL Editor ou UI)
#
# Uso: bash scripts/supabase_descobrir_regiao.sh 'SENHA'
# Saída: imprime a região vencedora (ex.: sa-east-1) ou nada se nenhuma conectar
# =============================================================================
set -uo pipefail

SENHA="${1:-}"
USUARIO="${2:-postgres}"
REF="tnygegihboiyptrnmaqt"
if [[ -z "$SENHA" ]]; then
  echo "❌ Uso: bash scripts/supabase_descobrir_regiao.sh 'SENHA' [USUARIO=postgres|bion_app]" >&2
  exit 1
fi

REGIOES=(
  us-east-1 us-east-2 us-west-1 us-west-2 ca-central-1 sa-east-1
  eu-west-1 eu-west-2 eu-west-3 eu-central-1 eu-central-2 eu-north-1
  eu-south-1 eu-south-2
  ap-south-1 ap-south-2 ap-southeast-1 ap-southeast-2 ap-southeast-3 ap-southeast-4
  ap-northeast-1 ap-northeast-2 ap-northeast-3 ap-east-1
  me-central-1 me-south-1
)

echo "🔎 Sondando ${#REGIOES[@]} regiões em paralelo..." >&2
TMPDIR_PROBE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_PROBE"' EXIT

for reg in "${REGIOES[@]}"; do
  (
    url="postgresql://${USUARIO}.${REF}:${SENHA}@aws-0-${reg}.pooler.supabase.com:5432/postgres?sslmode=require"
    if timeout 20 npx prisma db execute --url "$url" --stdin <<< "SELECT 1;" >/dev/null 2>&1; then
      echo "$reg" > "$TMPDIR_PROBE/$reg.ok"
    fi
  ) &
done
wait

VENCEDORES=$(ls "$TMPDIR_PROBE" 2>/dev/null | sed 's/\.ok//')
if [[ -z "$VENCEDORES" ]]; then
  echo "❌ Nenhuma região conectou — senha incorreta ou SQL ainda não executado no projeto" >&2
  exit 2
fi

# Projeto vive em UMA região; se mais de uma responder, algo está errado
QTD=$(echo "$VENCEDORES" | wc -l)
if [[ "$QTD" -gt 1 ]]; then
  echo "⚠️  Múltiplas regiões responderam (inesperado): $VENCEDORES" >&2
fi

echo "$VENCEDORES" | head -1
echo "✅ Região encontrada: $(echo "$VENCEDORES" | head -1)" >&2
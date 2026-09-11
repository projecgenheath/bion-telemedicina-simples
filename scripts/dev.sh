#!/usr/bin/env bash
# BION — Inicia o dev server garantindo que a DATABASE_URL do .env (Supabase)
# vence a variável DATABASE_URL global exportada pelo sandbox (dotenv não
# sobrepõe variáveis já existentes no ambiente).
set -euo pipefail
cd "$(dirname "$0")/.."

URL="$(grep -m1 '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
if [[ -z "$URL" ]]; then
  echo "❌ DATABASE_URL não encontrada no .env" >&2
  exit 1
fi
export DATABASE_URL="$URL"
echo "🚀 Dev server com DATABASE_URL: ${URL%%@*}@***" >&2

exec npm run dev
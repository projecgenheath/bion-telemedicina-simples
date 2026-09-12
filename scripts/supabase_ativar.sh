#!/usr/bin/env bash
# =============================================================================
# BION Telemedicina — Ativação do Supabase Postgres
#
# Uso:
#   bash scripts/supabase_ativar.sh "postgresql://postgres.PROJECT_REF:SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres"
#
# O que faz:
#   1. Valida a string de conexão (aceita Session pooler 5432 ou Transaction 6543)
#   2. Troca o datasource do Prisma de SQLite para PostgreSQL (com backup)
#   3. Atualiza o .env com a nova DATABASE_URL (mantém a antiga comentada)
#   4. gera o client, cria as tabelas (db push) e roda o seed com dados demo
#   5. Verifica contagem de registros
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "❌ Uso: bash scripts/supabase_ativar.sh '<connection-string-do-pooler-com-senha>'"
  echo "   Dashboard Supabase → Connect → Connection pooling / Session pooler"
  exit 1
fi

# Normaliza URL: remove aspas e espaços acidentais
URL="$(echo "$URL" | tr -d '"' | tr -d "'" | xargs)"

# Parâmetros do Prisma quando a porta é 6543 (Transaction pooler / PgBouncer)
if [[ "$URL" == *":6543/"* ]] && [[ "$URL" != *"pgbouncer=true"* ]]; then
  SEP="?"
  [[ "$URL" == *"?"* ]] && SEP="&"
  URL="${URL}${SEP}pgbouncer=true&connection_limit=1"
  echo "ℹ️  Porta 6543 detectada — parâmetros pgbouncer adicionados automaticamente"
fi

# Garante sslmode=require (Supavisor exige TLS)
if [[ "$URL" != *"sslmode="* ]]; then
  SEP="?"
  [[ "$URL" == *"?"* ]] && SEP="&"
  URL="${URL}${SEP}sslmode=require"
fi

# Confere se é a project-ref esperada
if [[ "$URL" != *"tnygegihboiyptrnmaqt"* ]]; then
  echo "⚠️  Aviso: a URL não contém a project-ref tnygegihboiyptrnmaqt — confira se é o projeto certo"
fi

echo "==> 1/6 Testando conexão..."
npx prisma db execute --url "$URL" --stdin <<< "SELECT 1;" \
  && echo "✅ Conexão OK" \
  || { echo "❌ Falha na conexão — verifique a senha e se usou a string do POOLER (não a direta db.xxx.supabase.co, que é IPv6-only)"; exit 1; }

echo "==> 2/6 Fazendo backup do schema SQLite..."
cp -n prisma/schema.prisma prisma/schema.sqlite.backup.prisma 2>/dev/null || true
cp -n .env .env.sqlite.backup 2>/dev/null || true

echo "==> 3/6 Trocando datasource para PostgreSQL..."
cp prisma/schema.postgres.prisma prisma/schema.prisma

echo "==> 4/6 Atualizando .env..."
# Remove linha DATABASE_URL ativa e insere a nova (antiga vai para comentário)
# Sem aspas: o parser de .env do Prisma CLI não remove aspas e a URL falharia
# com "the URL must start with the protocol postgresql://"
grep -v '^DATABASE_URL=' .env > .env.tmp || true
{
  echo "DATABASE_URL=$URL"
  cat .env.tmp
} > .env
rm -f .env.tmp

echo "==> 5/6 Gerando client + criando tabelas + seed..."
npx prisma generate
npx prisma db push --skip-generate
bun prisma/seed.ts

echo "==> 6/6 Verificação final..."
bun scripts/verificar_banco.ts

echo ""
echo "🎉 Supabase ativado! Reinicie o dev server para aplicar o novo .env:"
echo "   (Ctrl+C no terminal do dev e rode novamente — o Next.js recarrega sozinho em muitos casos)"
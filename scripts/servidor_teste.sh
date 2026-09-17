#!/bin/bash
# Garante servidor Next.js de produção local na porta 3000.
# Uso: bash scripts/servidor_teste.sh
set -e
cd /home/z/my-project

# Já está no ar?
if curl -s -o /dev/null -m 2 http://127.0.0.1:3000/entrar; then
  echo "SERVIDOR_JA_ATIVO"
  exit 0
fi

# Libera a porta se estiver presa
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

export DATABASE_URL='postgresql://postgres.tnygegihboiyptrnmaqt:6f%7B2%3C1mF6Kl%2F@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
nohup bun run start > /tmp/next-servidor.log 2>&1 &

for i in $(seq 1 40); do
  if curl -s -o /dev/null -m 2 http://127.0.0.1:3000/entrar; then
    echo "SERVIDOR_ATIVO_APOS_${i}s"
    exit 0
  fi
  sleep 1
done

echo "ERRO: servidor nao subiu"
tail -20 /tmp/next-servidor.log
exit 1

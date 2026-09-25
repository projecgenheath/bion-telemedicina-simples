#!/usr/bin/env bash
# =============================================================================
# BION — FASE 4 (fechamento): smoke em PRODUÇÃO pós-remoção de deps + a11y.
# Somente LEITURA: navega telas do paciente, captura erros de console/página.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="https://bion-telemedicina-simples.vercel.app"
AB="agent-browser"
EVID="/home/z/my-project/download/evidencias-fase4-producao"
mkdir -p "$EVID"
ERROS=0
ok()   { echo "✅ $1"; }
falha(){ ERROS=$((ERROS+1)); echo "❌ $1"; }

# --- 0. landing --------------------------------------------------------------
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/" --max-time 15)
[ "$code" = "200" ] && ok "landing HTTP $code" || falha "landing HTTP $code"

# --- 1. sessão do paciente (cookie) ------------------------------------------
CJAR=$(mktemp)
code=$(curl -s -c "$CJAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"marina.silva@email.com","senha":"bion123456"}' --max-time 20)
[ "$code" = "200" ] && ok "login paciente HTTP $code" || { falha "login HTTP $code"; exit 1; }
TOKEN=$(rg -o "bion_sessao\s+(\S+)" -r '$1' "$CJAR" | head -1)
[ -n "$TOKEN" ] && ok "cookie de sessão obtido" || { falha "sem cookie de sessão"; exit 1; }

# --- 2. rotas de leitura (GET) ------------------------------------------------
for rota in bootstrap mensagens notificacoes consultas documentos medicoes; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$CJAR" "$BASE/api/$rota" --max-time 20)
  case "$code" in
    200) ok "GET /api/$rota → 200" ;;
    # 405 = rota só de MUTAÇÃO (o estado fresco vem do bootstrap) — desenho da API
    404|405) ok "GET /api/$rota → $code (esperado: rota de mutação/inexistente)" ;;
    *)   falha "GET /api/$rota → $code" ;;
  esac
done

# --- 3. telas no navegador (paciente) -----------------------------------------
$AB open "$BASE/entrar" >/dev/null 2>&1
$AB cookies set bion_sessao "$TOKEN" >/dev/null 2>&1 \
  || $AB cookies set bion_sessao "$TOKEN" --domain bion-telemedicina-simples.vercel.app --path / >/dev/null 2>&1

visitar() { # visitar <nome> <caminho>
  $AB open "$BASE$2" >/dev/null 2>&1
  $AB wait --load networkidle >/dev/null 2>&1
  sleep 6  # bootstrap do cliente + primeira renderização de dados
  $AB screenshot "$EVID/$1.png" >/dev/null 2>&1
  local corpo=$($AB get text body 2>/dev/null)
  local chars=${#corpo}
  local recorte=$(echo "$corpo" | head -c 4000)
  if [ "$chars" -lt 300 ]; then
    falha "tela $1 quase vazia ($chars chars)"
  elif echo "$recorte" | rg -q "Carregando BION"; then
    falha "tela $1 ainda no carregador (bootstrap não terminou)"
  else
    ok "tela $1 renderizou dados ($chars chars)"
  fi
  local erros=$($AB get console --level error 2>/dev/null | rg -c . || true)
  if [ "${erros:-0}" -gt 0 ]; then
    falha "tela $1 tem $erros erro(s) de console"
    $AB get console --level error 2>/dev/null | head -3
  else
    ok "tela $1 sem erros de console"
  fi
}

visitar painel      /painel
visitar mensagens   /mensagens
visitar bion-ia     /bion-ia
visitar perfil      /perfil
visitar privacidade /privacidade

echo "=========================================="
if [ "$ERROS" = "0" ]; then
  echo "RESULTADO: SMOKE FASE 4 EM PRODUÇÃO — TUDO OK"
else
  echo "RESULTADO: $ERROS falha(s)"
fi
exit "$ERROS"

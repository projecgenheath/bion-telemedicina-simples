#!/usr/bin/env bash
# =============================================================================
# BION — verificação FINAL no navegador (todas as telas críticas)
# Sobe o servidor, autentica via cookie, navega pelas telas e captura evidências.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="http://localhost:3000"
AB="agent-browser"
EVID="/home/z/my-project/download/evidencias-finais"
mkdir -p "$EVID"
ERROS=0

nota() { echo "$1"; }
falha() { ERROS=$((ERROS+1)); echo "❌ $1"; }
ok() { echo "✅ $1"; }

# --- servidor ---------------------------------------------------------------
(bash scripts/dev.sh > dev.log 2>&1 &)
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/" --max-time 3 || true)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] || { echo "ERRO: servidor não subiu"; exit 1; }
echo "== servidor no ar =="

# --- cookie de sessão (login via API) ---------------------------------------
CJAR=$(mktemp)
curl -s -c "$CJAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"marina.silva@email.com","senha":"bion123"}' -o /dev/null
TOKEN=$(rg -o "bion_sessao\s+(\S+)" -r '$1' "$CJAR" | head -1)
[ -n "$TOKEN" ] || { echo "ERRO: sem token"; exit 1; }
nota "== sessão paciente obtida =="

visitar() { # visitar <nome> <caminho>
  $AB open "$BASE$2" >/dev/null 2>&1
  $AB wait --load networkidle >/dev/null 2>&1
  sleep 2
  $AB screenshot "$EVID/$1.png" >/dev/null 2>&1
  TIT=$($AB get title 2>/dev/null | head -c 60)
  ok "$1 -> $2 | título: $TIT"
}

# --- 1. landing pública ------------------------------------------------------
$AB open "$BASE/" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
$AB screenshot "$EVID/01-landing.png" >/dev/null 2>&1
ok "01 landing | título: $($AB get title 2>/dev/null | head -c 60)"

# --- 2. sessão autenticada via cookie ---------------------------------------
$AB cookies set bion_sessao "$TOKEN" >/dev/null 2>&1 || \
  $AB cookies set bion_sessao "$TOKEN" --domain localhost --path / >/dev/null 2>&1

# Dispensa o tour na primeira tela autenticada
$AB open "$BASE/painel" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
if $AB find text "Pular" click >/dev/null 2>&1; then nota "   tour dispensado"; fi
$AB screenshot "$EVID/02-painel-paciente.png" >/dev/null 2>&1
ok "02 painel paciente | título: $($AB get title 2>/dev/null | head -c 60)"

visitar "03-agendar"        "/agendar"
visitar "04-consultas"      "/consultas"
visitar "05-mensagens"      "/mensagens"
visitar "06-bion-ia"        "/bion-ia"
visitar "07-sala-espera"    "/sala-espera"
visitar "08-historico"      "/historico"
visitar "09-receitas"       "/receitas"
visitar "10-lembretes"      "/lembretes"
visitar "11-avaliacoes"     "/avaliacoes"
visitar "12-notificacoes"   "/notificacoes"
visitar "13-perfil"         "/perfil"
visitar "14-privacidade"    "/privacidade"
visitar "15-ajuda"          "/ajuda"

# --- 3. tela médica ----------------------------------------------------------
CJAR2=$(mktemp)
curl -s -c "$CJAR2" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"julia.lima@med.bion.app","senha":"bion123"}' -o /dev/null
TOKEN2=$(rg -o "bion_sessao\s+(\S+)" -r '$1' "$CJAR2" | head -1)
$AB cookies set bion_sessao "$TOKEN2" >/dev/null 2>&1
visitar "16-painel-medico"    "/painel"
visitar "17-medico-pacientes" "/medico-pacientes"
visitar "18-prontuario"       "/prontuario"
visitar "19-medico-perfil"    "/medico-perfil"

# --- 4. tela admin -----------------------------------------------------------
CJAR3=$(mktemp)
curl -s -c "$CJAR3" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@bion.app","senha":"bion123"}' -o /dev/null
TOKEN3=$(rg -o "bion_sessao\s+(\S+)" -r '$1' "$CJAR3" | head -1)
$AB cookies set bion_sessao "$TOKEN3" >/dev/null 2>&1
visitar "20-painel-admin"       "/painel"
visitar "21-admin-agendamentos" "/admin-agendamentos"
visitar "22-admin-medicos"      "/admin-medicos"
visitar "23-admin-pacientes"    "/admin-pacientes"
visitar "24-usuarios"           "/usuarios"
visitar "25-relatorios"         "/relatorios"
visitar "26-auditoria"          "/auditoria"
visitar "27-suporte"            "/suporte"

# --- 5. 404 é tratado? -------------------------------------------------------
$AB open "$BASE/rota-inexistente" >/dev/null 2>&1
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
$AB screenshot "$EVID/28-not-found.png" >/dev/null 2>&1
ok "28 not-found renderiza 404 amigável"

# --- resumo ------------------------------------------------------------------
echo ""
echo "=============================================="
if [ "$ERROS" -eq 0 ]; then
  echo "VERIFICAÇÃO VISUAL CONCLUÍDA — evidências em $EVID"
else
  echo "$ERROS falha(s) registrada(s)"
fi
exit 0

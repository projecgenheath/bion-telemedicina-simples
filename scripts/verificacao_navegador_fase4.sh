#!/usr/bin/env bash
# =============================================================================
# BION Fase 4 — verificação no navegador (agent-browser)
# Sobe o servidor, autentica via cookie e valida as telas de Mensagens e IA.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="http://localhost:3000"
AB="agent-browser"
EVID="/home/z/my-project/download/evidencias-fase4"
mkdir -p "$EVID"

cleanup() { pkill -f "next dev" 2>/dev/null; pkill -f "bun run dev" 2>/dev/null; }
trap cleanup EXIT

# --- servidor ---------------------------------------------------------------
setsid nohup bun run dev </dev/null >/dev/null 2>&1 &
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
echo "== token de sessão obtido =="

# --- 1. landing pública renderiza -------------------------------------------
$AB open "$BASE/" >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
$AB screenshot "$EVID/01-landing.png" >/dev/null
echo "1. LANDING           -> $($AB get title) | url: $($AB get url)"

# --- 2. sessão autenticada via cookie ---------------------------------------
$AB cookies set bion_sessao "$TOKEN" >/dev/null 2>&1 || \
  $AB cookies set bion_sessao "$TOKEN" --domain localhost --path / >/dev/null 2>&1
$AB open "$BASE/mensagens" >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
# Dispensa o tour de boas-vindas, se aparecer
if $AB find text "Pular" click >/dev/null 2>&1; then
  echo "   tour dispensado"
  sleep 1
fi
$AB screenshot "$EVID/02-mensagens.png" >/dev/null
echo "2. /MENSAGENS        -> url: $($AB get url)"

# --- 3. conversas reais na lista --------------------------------------------
SNAP=$($AB snapshot -c 2>/dev/null)
N_CONV=$(echo "$SNAP" | rg -c "Mensagem para|Comece a conversa" || true)
echo "3. CONVERSAS         -> contatos com thread/caixa visíveis: $(echo "$SNAP" | rg -c 'Dra\.|Dr\.|Suporte' || echo 0)"

# --- 4. envia mensagem pela UI ----------------------------------------------
REF_INPUT=$(echo "$SNAP" | rg -o 'textbox "Mensagem para[^"]*" \[ref=(\w+)\]' -r '$1' | head -1)
if [ -z "$REF_INPUT" ]; then
  # fallback: procura qualquer textbox
  REF_INPUT=$(echo "$SNAP" | rg -o 'textbox [^\[]*\[ref=(\w+)\]' -r '$1' | head -1)
fi
echo "   input ref: $REF_INPUT"
$AB fill "@$REF_INPUT" "Mensagem enviada pela verificação de navegador da Fase 4." >/dev/null
# Envia: botão pelo texto (semântico) ou tecla Enter no campo focado
if $AB find text "Enviar" click >/dev/null 2>&1; then
  echo "   enviado via botão 'Enviar'"
else
  $AB press Enter >/dev/null
  echo "   enviado via tecla Enter"
fi
sleep 2
$AB wait --text "verificação de navegador" --timeout 8000 >/dev/null 2>&1 \
  && echo "4. ENVIO NA UI       -> mensagem aparece na conversa ✓" \
  || echo "4. ENVIO NA UI       -> texto não encontrado após envio ✗"
$AB screenshot "$EVID/03-mensagem-enviada.png" >/dev/null

# --- 5. BION IA com LLM real -------------------------------------------------
$AB open "$BASE/bion-ia" >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
sleep 1
SNAP2=$($AB snapshot -c 2>/dev/null)
REF_IA=$(echo "$SNAP2" | rg -o 'textbox [^\[]*\[ref=(\w+)\]' -r '$1' | head -1)
$AB fill "@$REF_IA" "Como devo tomar a losartana 50mg que a médica me receitou?" >/dev/null
REF_SEND=$(echo "$SNAP2" | rg -o 'button [^\[]*\[ref=(\w+)\]' -r '$1' | tail -1)
$AB click "@$REF_SEND" >/dev/null
echo "5. BION IA           -> aguardando resposta do LLM..."
sleep 25
$AB screenshot "$EVID/04-bion-ia.png" >/dev/null
CORPO=$($AB get text body 2>/dev/null)
if echo "$CORPO" | rg -qi "losartana" && echo "$CORPO" | rg -qi "modo local"; then
  echo "   resposta recebida, mas em MODO LOCAL (IA indisponível) — verificar dev.log"
elif echo "$CORPO" | rg -qi "losartana"; then
  echo "   resposta real do LLM recebida ✓"
else
  echo "   resposta não identificada — checar console/erros"
fi

# --- 6. erros de runtime ------------------------------------------------------
ERROS=$($AB errors 2>/dev/null | tail -5)
echo "6. ERROS DE PÁGINA   -> $(echo "$ERROS" | rg -v '^$' | wc -l) linha(s)"
echo "$ERROS" | head -5

echo "== FIM DA VERIFICAÇÃO (evidências em $EVID) =="

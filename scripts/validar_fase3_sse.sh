#!/bin/bash
# FASE 3 — validação E2E do stream SSE de mensagens (local).
# Uso: bash scripts/validar_fase3_sse.sh
# Pré-requisitos: servidor de teste na porta 3000 com SQLite semeado.
set -u
BASE="http://127.0.0.1:3000"
PACIENTE="marina.silva@email.com"
MEDICO="ana.ribeiro@med.bion.app"
SENHA="bion123456"
TMP=$(mktemp -d)
falhas=0

echo "== 1. logins =="
code_p=$(curl -s -o "$TMP/p.json" -w '%{http_code}' -c "$TMP/p.txt" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PACIENTE\",\"senha\":\"$SENHA\"}" "$BASE/api/auth/login")
code_m=$(curl -s -o "$TMP/m.json" -w '%{http_code}' -c "$TMP/m.txt" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$MEDICO\",\"senha\":\"$SENHA\"}" "$BASE/api/auth/login")
echo "login paciente: $code_p | login medico: $code_m"
[[ "$code_p" == "200" && "$code_m" == "200" ]] || { echo "FALHA nos logins"; cat "$TMP/p.json" "$TMP/m.json"; exit 1; }

echo "== 2. stream sem cookie deve ser 401 =="
code_401=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$BASE/api/mensagens/stream")
echo "stream sem sessão: $code_401"
[[ "$code_401" == "401" ]] || { echo "FALHA: esperado 401"; falhas=$((falhas+1)); }

echo "== 3. abrir stream da médica (fundo, 22s de vida) =="
timeout 22 curl -sN -b "$TMP/m.txt" "$BASE/api/mensagens/stream" > "$TMP/stream.txt" 2>&1 &
CURL_PID=$!
sleep 3

echo "== 4. paciente envia mensagem =="
TEXTO_MSG="Teste FASE 3 SSE $(date +%s)"
body_med=$(python3 -c "
import json,sqlite3
con=sqlite3.connect('db/custom.db')
r=con.execute(\"select id from User where email='ana.ribeiro@med.bion.app'\").fetchone()
print(json.dumps({'paraId': r[0], 'texto': '''$TEXTO_MSG'''}))
")
t0=$(date +%s%N)
code_envio=$(curl -s -o "$TMP/envio.json" -w '%{http_code}' -b "$TMP/p.txt" -H 'Content-Type: application/json' \
  -d "$body_med" "$BASE/api/mensagens")
t1=$(date +%s%N)
echo "POST mensagem: $code_envio ($(( (t1-t0)/1000000 ))ms)"
[[ "$code_envio" == "200" ]] || { echo "FALHA no envio"; cat "$TMP/envio.json"; exit 1; }

echo "== 5. aguardar evento no stream (até 8s) =="
achou=no
for i in $(seq 1 16); do
  if grep -q "$TEXTO_MSG" "$TMP/stream.txt" 2>/dev/null; then
    t2=$(date +%s%N)
    achou=sim
    echo "evento recebido no stream após ~$(( (t2-t1)/100000000 ))00ms"
    break
  fi
  sleep 0.5
done
if [[ "$achou" == "sim" ]]; then
  echo "PASS: mensagem chegou em TEMPO REAL pelo stream"
else
  echo "FALHA: mensagem NÃO chegou pelo stream"; falhas=$((falhas+1)); cat "$TMP/stream.txt"
fi

echo "== 6. recibo de leitura via stream (médica marca como lida) =="
: > "$TMP/stream2.txt"
timeout 12 curl -sN -b "$TMP/p.txt" "$BASE/api/mensagens/stream" > "$TMP/stream2.txt" 2>&1 &
CURL2_PID=$!
sleep 3
code_patch=$(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/m.txt" -H 'Content-Type: application/json' \
  -d "{\"comUsuarioId\":\"$(python3 -c "
import json,sqlite3
con=sqlite3.connect('db/custom.db')
r=con.execute(\"select id from User where email='marina.silva@email.com'\").fetchone()
print(r[0])
")\"}" -X PATCH "$BASE/api/mensagens")
echo "PATCH marcar-lida: $code_patch"
achou2=no
for i in $(seq 1 16); do
  if grep -q '"lida":true' "$TMP/stream2.txt" 2>/dev/null; then
    achou2=sim; echo "PASS: recibo de leitura chegou ao stream da paciente"; break
  fi
  sleep 0.5
done
[[ "$achou2" == "sim" ]] || { echo "FALHA: recibo não chegou"; falhas=$((falhas+1)); }
wait $CURL2_PID 2>/dev/null || true

echo "== 7. heartbeat + retry no stream 1 =="
wait $CURL_PID 2>/dev/null || true
grep -q "^: ping" "$TMP/stream.txt" && echo "PASS: heartbeat ping presente" || { echo "AVISO: sem ping (fluxo < 15s)"; }
grep -q "retry: 3000" "$TMP/stream.txt" && echo "PASS: retry presente" || { echo "FALHA: sem retry"; falhas=$((falhas+1)); }

echo "== 8. limpeza: remover mensagens de teste =="
python3 -c "
import sqlite3
con = sqlite3.connect('db/custom.db')
n = con.execute(\"delete from Mensagem where texto like 'Teste FASE 3 SSE%'\").rowcount
con.commit()
print(f'{n} mensagem(ns) de teste removida(s)')
"

echo
if [[ $falhas -eq 0 ]]; then echo "RESULTADO: SSE 100% VALIDADO LOCALMENTE"; else echo "RESULTADO: $falhas falha(s)"; exit 1; fi

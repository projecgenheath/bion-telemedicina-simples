#!/usr/bin/env bash
# =============================================================================
# BION Fase 4 — teste end-to-end das APIs de mensageria + BION IA
# Sobe o dev server, executa os testes e encerra o servidor.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

PORTA=3000
BASE="http://localhost:${PORTA}"
CJAR=$(mktemp)

cleanup() { pkill -f "next dev" 2>/dev/null; pkill -f "bun run dev" 2>/dev/null; }
trap cleanup EXIT

# --- sobe o servidor -------------------------------------------------------
setsid nohup bun run dev </dev/null >/dev/null 2>&1 &
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/" --max-time 3 || true)
  [ "$code" = "200" ] && break
  sleep 1
done
if [ "$code" != "200" ]; then echo "ERRO: servidor não subiu"; exit 1; fi
echo "== servidor no ar =="

# --- 1. login paciente -----------------------------------------------------
curl -s -c "$CJAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"marina.silva@email.com","senha":"bion123"}' -o /tmp/login.json
echo "1. LOGIN           -> $(python3 -c "
import json; d=json.load(open('/tmp/login.json'))
u=d.get('usuario',{}); print(u.get('nome'), '/', u.get('role'), '/ mensagens:', len(d.get('mensagens',[])), '/ suporte:', d.get('suporte'))")"

# --- 2. ids necessários ----------------------------------------------------
MED_ID=$(python3 -c "
import json; d=json.load(open('/tmp/login.json'))
cs=[c for c in d.get('consultas',[]) if c.get('medicoId')]
print(cs[0]['medicoId'] if cs else '')")
MED_NOME=$(python3 -c "
import json; d=json.load(open('/tmp/login.json'))
cs=[c for c in d.get('consultas',[]) if c.get('medicoId')]
print(cs[0]['medico'] if cs else '')")
# e-mail da médica vinculada (slug: primeiro+último nome)
MED_EMAIL=$(python3 -c "
import json, re; d=json.load(open('/tmp/login.json'))
cs=[c for c in d.get('consultas',[]) if c.get('medicoId')]
nome=cs[0]['medico'] if cs else ''
partes=re.sub(r'^(Dra\.|Dr\.)\s+','',nome).split()
slug='.'.join(p.lower() for p in partes[:2] if p)
print(f'{slug}@med.bion.app')")
SUP_ID=$(python3 -c "import json; print(json.load(open('/tmp/login.json'))['suporte']['id'])")
echo "2. CONTATOS        -> medico: $MED_NOME ($MED_EMAIL) | suporte: $SUP_ID"

# --- 3. envia mensagem para o médico ---------------------------------------
curl -s -b "$CJAR" -X POST "$BASE/api/mensagens" -H "Content-Type: application/json" \
  -d "{\"paraId\":\"$MED_ID\",\"texto\":\"Olá Doutora! Teste da Fase 4 — mensageria real.\"}" \
  -o /tmp/envio.json
echo "3. ENVIAR MENSAGEM -> $(python3 -c "
import json; d=json.load(open('/tmp/envio.json'))
ms=[m for m in d.get('mensagens',[]) if 'Teste da Fase 4' in m.get('texto','')]
print('ok — total de mensagens agora:', len(d.get('mensagens',[])), '| enviada:', bool(ms))")"

# --- 4. polling leve (GET) ---------------------------------------------------
curl -s -b "$CJAR" "$BASE/api/mensagens" -o /tmp/poll.json
echo "4. GET POLLING     -> $(python3 -c "
import json; d=json.load(open('/tmp/poll.json'))
print(len(d.get('mensagens',[])), 'mensagens no payload leve')")"

# --- 5. login médico (outro cookie jar) e verifica recebimento --------------
CJAR2=$(mktemp)
curl -s -c "$CJAR2" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$MED_EMAIL\",\"senha\":\"bion123\"}" -o /tmp/login_med.json
curl -s -b "$CJAR2" "$BASE/api/mensagens" -o /tmp/poll_med.json
echo "5. MÉDICO RECEBEU  -> $(python3 -c "
import json; d=json.load(open('/tmp/poll_med.json'))
ms=d.get('mensagens',[])
print(len(ms), 'mensagens | última:', (ms[-1]['texto'][:50] if ms else '(vazio)'))")"

# --- 6. médico responde + paciente marca conversa como lida -----------------
curl -s -b "$CJAR2" -X POST "$BASE/api/mensagens" -H "Content-Type: application/json" \
  -d '{"paraId":"'"$(python3 -c "import json; print(json.load(open('/tmp/login.json'))['usuario']['id'])")"'","texto":"Recebido, Marina! Confirmando o recebimento do teste."}' \
  -o /tmp/resposta_med.json
SUP_ID_MED=$(python3 -c "import json; print(json.load(open('/tmp/login_med.json'))['suporte']['id'])")
curl -s -b "$CJAR2" -X POST "$BASE/api/mensagens" -H "Content-Type: application/json" \
  -d "{\"paraId\":\"$SUP_ID_MED\",\"texto\":\"Dúvida sobre faturamento do mês.\"}" -o /dev/null
curl -s -b "$CJAR" -X PATCH "$BASE/api/mensagens" -H "Content-Type: application/json" \
  -d "{\"comUsuarioId\":\"$MED_ID\"}" -o /tmp/lida.json
echo "6. RESPOSTA + LIDA -> $(python3 -c "
import json; d=json.load(open('/tmp/lida.json'))
ms=[m for m in d.get('mensagens',[]) if m['deId']=='$MED_ID' or m['paraId']=='$MED_ID']
naolidas=[m for m in ms if m['deId']=='$MED_ID' and not m['lida']]
print(len(ms), 'mensagens na conversa com o médico |', len(naolidas), 'não lida(s) para a paciente')")"

# --- 7. validações de rejeição ---------------------------------------------
R1=$(curl -s -b "$CJAR" -X POST "$BASE/api/mensagens" -H "Content-Type: application/json" -d '{"texto":"sem destinatario"}')
R2=$(curl -s -b "$CJAR" -X POST "$BASE/api/mensagens" -H "Content-Type: application/json" -d "{\"paraId\":\"$(python3 -c "import json; print(json.load(open('/tmp/login.json'))['usuario']['id'])")\",\"texto\":\"auto\"}")
echo "7. REJEICOES       -> sem destinatário: $(python3 -c "import json; print(json.loads('''$R1''').get('erro','?'))") | auto-mensagem: $(python3 -c "import json; print(json.loads('''$R2''').get('erro','?'))")"

# --- 8. BION IA com LLM real ------------------------------------------------
curl -s -b "$CJAR" -X POST "$BASE/api/bion-ia" -H "Content-Type: application/json" \
  -d '{"mensagens":[{"remetente":"ia","texto":"Olá! Como posso ajudar?"},{"remetente":"usuario","texto":"Preciso tomar minha losartana com estômago vazio ou posso tomar com o café da manhã?"}]}' \
  -o /tmp/ia.json -w "8. BION IA         -> HTTP %{http_code} "
python3 -c "
import json
try:
    d=json.load(open('/tmp/ia.json'))
    r=d.get('resposta','')
    print('| fallback:', d.get('erro','nenhum'))
    print('   resposta IA:', r[:220].replace(chr(10),' ') if r else '(vazia)')
except Exception as e:
    print('   erro parse:', e)"

echo "== FIM DOS TESTES =="

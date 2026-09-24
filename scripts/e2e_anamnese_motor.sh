#!/bin/bash
# E2E da anamnese com o MOTOR DETERMINÍSTICO (BION_MOTOR_LOCAL=1 no servidor).
# Uso: bash scripts/e2e_anamnese_motor.sh
set -e
BASE=http://127.0.0.1:3000
JAR=/tmp/e2e-motor-cookies.txt
rm -f "$JAR"

echo "== login =="
curl -s -o /tmp/e2e-login.json -w "login=%{http_code}\n" -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"joao.pereira@email.com","senha":"bion123456"}'

echo "== bootstrap (medicoId) =="
curl -s -b "$JAR" "$BASE/api/bootstrap" -o /tmp/e2e-boot.json
MEDICO_ID=$(python3 -c "
import json
d = json.load(open('/tmp/e2e-boot.json'))
dados = d.get('dados', d)
med = [m for m in dados['medicos'] if m['status']=='ativo' and m['especialidade']=='Clínica Geral']
print(med[0]['id'])
")
echo "medicoId=$MEDICO_ID"

echo "== criar consulta pendente_anamnese =="
CRIADA=$(curl -s -b "$JAR" -X POST "$BASE/api/consultas" -H "Content-Type: application/json" -d "{
  \"medicoId\":\"$MEDICO_ID\",
  \"data\":\"Amanhã\",\"hora\":\"15:00\",
  \"motivoConsulta\":\"E2E motor local\",\"valor\":120,\"pago\":true,
  \"status\":\"pendente_anamnese\",
  \"audit\":{\"acao\":\"CONSULTA_AGENDADA\",\"categoria\":\"consulta\",\"detalhes\":\"E2E motor\"}
}")
CID=$(echo "$CRIADA" | python3 -c "import json,sys; print(json.load(sys.stdin)['consultaCriada'])")
echo "consultaId=$CID"

turno() {
  local MSG="$1"
  RESP=$(curl -s -b "$JAR" -X POST "$BASE/api/anamnese" -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json
msg = '''$MSG'''
print(json.dumps({'consultaId':'$CID','mensagem':msg,'historico':[]}))
")")
  echo "$RESP" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('---')
print('[etapa]', d.get('etapa'), '| concluida_etapa:', d.get('etapa_concluida'))
print('[ia]', (d.get('texto') or d.get('erro','SEM TEXTO'))[:220].replace(chr(10),' ⏎ '))
"
}

echo "== abertura =="
turno ""
turno "Está certo, é isso mesmo"
turno "Tenho tido dores no estômago há uns três dias"
turno "Começou há três dias, foi piorando aos poucos depois das refeições"
turno "É na boca do estômago, parece uma queimação e às vezes irradia para as costas"
turno "Uns 7 de 10, piora quando como comida gordurosa e melhora tomando leite"
turno "Não tive febre, mas tenho tido enjoo. Tomei omeprazol e melhorou um pouco"
turno "Fora isso está tudo normal, nada diferente"
turno "Já fiz cirurgia de vesícula em 2019, e tenho gastrite"
turno "Meu pai tem diabetes e hipertensão"
turno "Não fumo, bebo só socialmente, caminho três vezes por semana e durmo mal"
turno "Estou um pouco ansioso com o trabalho, mas tenho apoio da família"
turno "Uso omeprazol 20mg de manhã e vitamina D"
turno "Não tenho nenhum documento para enviar"
echo "== estado final =="
curl -s -b "$JAR" "$BASE/api/bootstrap" -o /tmp/e2e-boot2.json
python3 -c "
import json
d = json.load(open('/tmp/e2e-boot2.json'))
dados = d.get('dados', d)
c = next(c for c in dados['consultas'] if c['id']=='$CID')
a = next(a for a in dados['anamneses'] if a['consultaId']=='$CID')
print('consulta.status =', c['status'])
print('anamnese.etapa  =', a['etapa'], '| status =', a['status'])
"
echo "== concluir =="
curl -s -b "$JAR" -X PATCH "$BASE/api/anamnese" -H "Content-Type: application/json" \
  -d "{\"consultaId\":\"$CID\",\"acao\":\"concluir\"}" -o /tmp/e2e-concluir.json
python3 -c "
import json
d = json.load(open('/tmp/e2e-boot2.json'))
"
curl -s -b "$JAR" "$BASE/api/bootstrap" -o /tmp/e2e-boot3.json
python3 -c "
import json
d = json.load(open('/tmp/e2e-boot3.json'))
dados = d.get('dados', d)
c = next(c for c in dados['consultas'] if c['id']=='$CID')
a = next(a for a in dados['anamneses'] if a['consultaId']=='$CID')
coleta = json.loads(a['coleta']) if isinstance(a['coleta'], str) else a['coleta']
print('POS-CONCLUIR consulta.status =', c['status'])
print('POS-CONCLUIR anamnese.status =', a['status'])
print('etapas coletadas =', sorted(coleta.keys()))
print('queixa =', coleta.get('queixa',{}).get('relato'))
print('historia.inicio =', coleta.get('historia',{}).get('inicio'))
print('historia.intensidade =', coleta.get('historia',{}).get('intensidade'))
"

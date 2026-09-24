#!/bin/bash
# E2E anamnese motor — caso Marina (feminino: gineco perguntado) + alarme + chips + retomada.
# Uso: bash scripts/e2e_anamnese_marina.sh
set -e
BASE=http://127.0.0.1:3000
JAR=/tmp/e2e-marina-cookies.txt
rm -f "$JAR"

curl -s -o /dev/null -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"marina.silva@email.com","senha":"bion123456"}'
curl -s -b "$JAR" "$BASE/api/bootstrap" -o /tmp/e2e-m-boot.json
MEDICO_ID=$(python3 -c "
import json
d = json.load(open('/tmp/e2e-m-boot.json'))
dados = d.get('dados', d)
med = [m for m in dados['medicos'] if m['status']=='ativo' and m['especialidade']=='Cardiologia']
print(med[0]['id'])
")
CRIADA=$(curl -s -b "$JAR" -X POST "$BASE/api/consultas" -H "Content-Type: application/json" -d "{
  \"medicoId\":\"$MEDICO_ID\",\"data\":\"Amanhã\",\"hora\":\"16:00\",
  \"motivoConsulta\":\"E2E marina motor\",\"valor\":150,\"pago\":true,\"status\":\"pendente_anamnese\",
  \"audit\":{\"acao\":\"CONSULTA_AGENDADA\",\"categoria\":\"consulta\",\"detalhes\":\"E2E marina\"}
}")
CID=$(echo "$CRIADA" | python3 -c "import json,sys; print(json.load(sys.stdin)['consultaCriada'])")
echo "consultaId=$CID medicoId=$MEDICO_ID"

turno() {
  local MSG="$1"
  RESP=$(curl -s -b "$JAR" -X POST "$BASE/api/anamnese" -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json
print(json.dumps({'consultaId':'$CID','mensagem':'''$MSG''','historico':[]}))
")")
  echo "$RESP" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('---')
print('[etapa]', d.get('etapa'), '| concluida:', d.get('etapa_concluida'), '| perfil:', d.get('perfilAtualizado'))
print('[ia]', (d.get('texto') or d.get('erro','SEM TEXTO'))[:200].replace(chr(10),' ⏎ '))
"
}

turno ""                                     # abertura identificacao
turno "Está certo, só que agora peso 66 kg"  # atualiza peso, fica na etapa
turno ""                                     # retomada (sem digitar nada)
turno "está certo"                           # -> queixa
turno "Senti uma dor no peito muito forte, apertando com suor frio"  # ALARME
turno "Foi um susto, já passou. Foi ontem à noite"                    # -> queixa registrada, HDA q0
turno "Começou ontem, do nada, e ainda sinto um leve aperto"          # -> q1
turno "Não sei informar"                                              # chip -> q1 armazenada, pergunta q2
turno "3 de 10, melhora descansando"                                  # -> q3
turno "Nenhum outro sintoma, não tomei nada"                          # -> sistemas
turno "Nada"                                                          # -> antecedentes
turno "Nenhuma"                                                       # -> familia
turno "Não fumo e não bebo, faço pilates"                             # -> gineco (feminino!)
turno "Ciclo regular, tive 2 gestações, uso anticoncepcional"         # -> psicossocial
turno "Estou tranquila, só o trabalho agitado"                        # -> medicamentos
turno "Só vitamina D"                                                 # -> documentos
turno "Tenho um laudo para anexar"                                    # -> pede anexo (fica)
turno "Pronto, enviei o documento"                                    # -> fechamento (resumo)

curl -s -b "$JAR" "$BASE/api/bootstrap" -o /tmp/e2e-m-boot2.json
python3 -c "
import json
d = json.load(open('/tmp/e2e-m-boot2.json'))
dados = d.get('dados', d)
c = next(c for c in dados['consultas'] if c['id']=='$CID')
a = next(a for a in dados['anamneses'] if a['consultaId']=='$CID')
coleta = json.loads(a['coleta']) if isinstance(a['coleta'], str) else a['coleta']
p = next(x for x in dados['pacientes'] if x['id'])
print('consulta.status =', c['status'], '| anamnese.etapa =', a['etapa'])
print('etapas coletadas =', sorted(coleta.keys()))
print('identificacao =', {k:v for k,v in coleta.get('identificacao',{}).items() if k!='_n'})
print('historia =', {k:v for k,v in coleta.get('historia',{}).items() if k!='_n'})
print('gineco =', {k:v for k,v in coleta.get('gineco',{}).items() if k!='_n'})
print('alarme =', coleta.get('alarme'))
med = coleta.get('medicamentos',{}).get('registro')
print('medicamentos =', (med or '')[:80])
"

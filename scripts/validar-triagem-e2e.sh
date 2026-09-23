#!/bin/bash
# Completa a triagem da Marina (consulta cmu7uwvjr0001l304tknwkz4u) até a conclusão.
CID="cmu7uwvjr0001l304tknwkz4u"
BASE="https://bion-telemedicina-simples.vercel.app/api/anamnese"
COOKIE="/tmp/bion_cookies_triagem.txt"

RESPOSTAS=(
  "9, piora com luz, melhora deitado"
  "Um pouco de enjoo, tomei dipirona e aliviou"
  "Não, está tudo normal"
  "Já fiz cirurgia de apendicite, nada mais"
  "Meu pai tem hipertensão"
  "Não fumo, bebo pouco, caminho três vezes por semana"
  "Ciclo regular, dois filhos, uso DIU"
  "Estou calma, o trabalho está tranquilo"
  "Só vitamina D todo dia"
  "Não tenho nenhum documento"
  "Está tudo certo, é isso mesmo"
)

for R in "${RESPOSTAS[@]}"; do
  OUT=$(curl -s -b "$COOKIE" -X POST "$BASE" -H "Content-Type: application/json" \
    -d "{\"consultaId\":\"$CID\",\"mensagem\":\"$R\",\"historico\":[]}")
  echo "MSG: $R"
  echo "$OUT" | python3 -c "
import json,sys
d = json.load(sys.stdin)
if d.get('erro'):
    print('  ERRO:', d['erro']); sys.exit(1)
print('  fonte:', d.get('fonte'), '| etapa:', d.get('etapa'), '| feita:', d.get('etapa_concluida'))
print('  IA:', (d.get('texto') or '')[:140].replace(chr(10),' '))
"
  sleep 1
done

echo "=== PATCH concluir ==="
curl -s -b "$COOKIE" -X PATCH "$BASE" -H "Content-Type: application/json" \
  -d "{\"consultaId\":\"$CID\",\"acao\":\"concluir\"}" -o /tmp/bion_concluir.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('/tmp/bion_concluir.json'))
if isinstance(d, dict) and d.get('erro'):
    print('ERRO:', d['erro']); raise SystemExit(1)
cons = [c for c in d.get('consultas', []) if c.get('id') == '$CID']
print('consulta apos concluir:', cons[0]['status'] if cons else '?')
for a in d.get('anamneses', []):
    if a.get('consultaId') == '$CID':
        print('anamnese:', a['status'], '| etapa:', a['etapa'])
"

#!/bin/bash
# Valida a NOVA conversa completa da triagem (avanço server-side por etapa).
CID="cmu7wgl0e0001l204228t3eqq"
BASE="https://bion-telemedicina-simples.vercel.app/api/anamnese"
COOKIE="/tmp/bion_cookies_triagem.txt"

echo "=== abertura (motor local) ==="
curl -s -b "$COOKIE" -X POST "$BASE" -H "Content-Type: application/json" -d "{\"consultaId\":\"$CID\",\"historico\":[]}" | python3 -c "
import json,sys
d=json.load(sys.stdin); print('  etapa:', d.get('etapa'), '| fonte:', d.get('fonte')); print('  IA:', (d.get('texto') or '')[:100].replace(chr(10),' '))"

RESPOSTAS=(
  "Está certo"
  "Dor de cabeça forte"
  "Começou há três dias, aos poucos, do lado direito, como uma pressão"
  "Um 8, piora com a luz"
  "Tomei dipirona e aliviou um pouco, e fiquei com enjoo leve"
  "Não, tudo normal"
  "Nenhuma cirurgia, só internação quando era criança"
  "Meu pai tem diabetes"
  "Não fumo, não bebo, sono razoável"
  "Ciclo regular, sem gestações, uso pílula"
  "Estou ansiosa, mas a rotina segue"
  "Só a pílula e um complexo B"
  "Não tenho documentos"
  "Está tudo correto, é isso"
)

N=0
for R in "${RESPOSTAS[@]}"; do
  N=$((N+1))
  OUT=$(curl -s -b "$COOKIE" -X POST "$BASE" -H "Content-Type: application/json" \
    -d "{\"consultaId\":\"$CID\",\"mensagem\":\"$R\",\"historico\":[]}")
  echo "T$N: $R"
  echo "$OUT" | python3 -c "
import json,sys
d = json.load(sys.stdin)
if d.get('erro'):
    print('  ERRO:', d['erro']); sys.exit(1)
print('  etapa:', d.get('etapaAnterior'), '->', d.get('etapa'), '| fonte:', d.get('fonte'))
print('  IA:', (d.get('texto') or '')[:150].replace(chr(10),' '))
"
  sleep 1
done

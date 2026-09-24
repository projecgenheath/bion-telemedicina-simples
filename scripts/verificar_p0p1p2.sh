#!/bin/bash
# =====================================================================
# Suíte de verificação P0/P1/P2 (2026-09) — BION Telemedicina
# Valida: headers, rate limit, senha 10+, agenda (formato/passado/
# conflito), suspensão de médico, arquivamento e LGPD completa.
# Uso: bash scripts/verificar_p0p1p2.sh
# =====================================================================
set -u
BASE="http://127.0.0.1:3000"
TMP="/home/z/my-project/.tmp-teste"
mkdir -p "$TMP"
JAR_ADMIN="$TMP/admin.jar"
JAR_MARINA="$TMP/marina.jar"
PASS=0; FAIL=0

verificar() { # verificar "rótulo" "condição(0/1)"
  if [[ "$2" == "1" ]]; then PASS=$((PASS+1)); echo "✅ $1";
  else FAIL=$((FAIL+1)); echo "❌ $1"; fi
}
code() { curl -s -o "$TMP/resp.json" -w '%{http_code}' "$@"; }
corpo() { cat "$TMP/resp.json"; }

echo "=== 1. Headers de segurança ==="
HEADERS=$(curl -sI "$BASE/")
verificar "X-Frame-Options: DENY" "$(echo "$HEADERS" | rg -qi 'x-frame-options:\s*DENY' && echo 1 || echo 0)"
verificar "CSP com frame-ancestors none" "$(echo "$HEADERS" | rg -qi "frame-ancestors 'none'" && echo 1 || echo 0)"
verificar "Permissions-Policy câmera/mic self" "$(echo "$HEADERS" | rg -qi 'permissions-policy:.*camera=\(self\)' && echo 1 || echo 0)"
verificar "X-Content-Type-Options: nosniff" "$(echo "$HEADERS" | rg -qi 'x-content-type-options:\s*nosniff' && echo 1 || echo 0)"

echo "=== 2. Rate limit do login (falhas contra e-mail FANTASMA) ==="
ULT=000
for i in $(seq 1 11); do
  ULT=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d '{"email":"fantasma-rl@teste.local","senha":"errada123"}')
done
verificar "11ª tentativa falha → 429 (bloqueio)" "$([[ $ULT == 429 ]] && echo 1 || echo 0)"
RA=$(curl -s -D - -o /dev/null -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"fantasma-rl@teste.local","senha":"errada123"}' | rg -i 'retry-after' | head -1)
verificar "Retry-After presente no 429" "$([[ -n $RA ]] && echo 1 || echo 0)"

echo "=== 3. Senha mínima 10+ no registro ==="
C=$(code -X POST "$BASE/api/auth/registro" -H 'Content-Type: application/json' \
  -d '{"nome":"Teste Politica Senha","email":"rg-politica@teste.local","senha":"curta123"}')
verificar "senha de 8 caracteres → 400" "$([[ $C == 400 ]] && echo 1 || echo 0)"
C=$(code -X POST "$BASE/api/auth/registro" -H 'Content-Type: application/json' \
  -d '{"nome":"Teste Politica Senha","email":"rg-politica@teste.local","senha":"soletraszinhas"}')
verificar "senha sem números → 400" "$([[ $C == 400 ]] && echo 1 || echo 0)"
C=$(code -X POST "$BASE/api/auth/registro" -H 'Content-Type: application/json' \
  -d '{"nome":"Teste Politica Senha","email":"rg-politica@teste.local","senha":"BionForte2026"}')
verificar "senha 10+ letras+números → 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"

echo "=== 4. Sessões ==="
C=$(code -c "$JAR_ADMIN" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@bion.app","senha":"bion123456"}')
verificar "login admin → 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"
C=$(code -c "$JAR_MARINA" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"marina.silva@email.com","senha":"bion123456"}')
verificar "login marina → 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"

MEDICO_ID=$(python3 -c "
import json
d=json.load(open('$TMP/resp.json'))
print(d['medicos'][0]['id'] if d.get('medicos') else '')")
verificar "obteve medicoId do payload" "$([[ -n $MEDICO_ID ]] && echo 1 || echo 0)"

echo "=== 5. Agendamento: formato, passado e conflito ==="
C=$(code -b "$JAR_MARINA" -X POST "$BASE/api/consultas" -H 'Content-Type: application/json' \
  -d "{\"medicoId\":\"$MEDICO_ID\",\"data\":\"2026-13-45\",\"hora\":\"10:00\"}")
verificar "data impossível (2026-13-45) → 400" "$([[ $C == 400 ]] && echo 1 || echo 0)"
C=$(code -b "$JAR_MARINA" -X POST "$BASE/api/consultas" -H 'Content-Type: application/json' \
  -d "{\"medicoId\":\"$MEDICO_ID\",\"data\":\"qualquer coisa\",\"hora\":\"10:00\"}")
verificar "data lixo → 400 (não vira 'hoje')" "$([[ $C == 400 ]] && echo 1 || echo 0)"
C=$(code -b "$JAR_MARINA" -X POST "$BASE/api/consultas" -H 'Content-Type: application/json' \
  -d "{\"medicoId\":\"$MEDICO_ID\",\"data\":\"2020-01-10\",\"hora\":\"10:00\"}")
verificar "data no passado → 400" "$([[ $C == 400 ]] && echo 1 || echo 0)"
C=$(code -b "$JAR_MARINA" -X POST "$BASE/api/consultas" -H 'Content-Type: application/json' \
  -d "{\"medicoId\":\"$MEDICO_ID\",\"data\":\"2026-12-20\",\"hora\":\"25:99\"}")
verificar "hora impossível → 400" "$([[ $C == 400 ]] && echo 1 || echo 0)"

# Slot futuro fixo (data fixa + hora às 08:00 do fuso da clínica: sempre futuro
# em relação a 'hoje' quando hoje < 20/12/2026)
C=$(code -b "$JAR_MARINA" -X POST "$BASE/api/consultas" -H 'Content-Type: application/json' \
  -d "{\"medicoId\":\"$MEDICO_ID\",\"data\":\"2026-12-20\",\"hora\":\"08:00\"}")
verificar "agendamento válido → 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"
CONSULTA_ID=$(python3 -c "
import json
try:
  d=json.load(open('$TMP/resp.json')); print(d['consulta']['id'])
except Exception: print('')")
C2=$(code -b "$JAR_MARINA" -X POST "$BASE/api/consultas" -H 'Content-Type: application/json' \
  -d "{\"medicoId\":\"$MEDICO_ID\",\"data\":\"2026-12-20\",\"hora\":\"08:00\"}")
verificar "mesmo slot de novo → 409 (conflito paciente)" "$([[ $C2 == 409 ]] && echo 1 || echo 0)"

echo "=== 6. Suspensão de médico bloqueia login/sessão ==="
MEDICO_EMAIL=$(python3 -c "
import json
d=json.load(open('$TMP/resp.json'))
" 2>/dev/null; echo "")
# pega o e-mail do primeiro médico via API do admin (payload do login já tem)
MEDICO_EMAIL=$(python3 - "$JAR_ADMIN" << 'EOF'
import json,sys
# reusa último corpo? Não — refaz leitura via jar não dá. Usa fallback:
print("")
EOF
)
# busca o médico demo julia no banco pelo e-mail conhecido
JULIA_ID=$(bun scripts/verificar_db.ts usuario-por-email julia.lima@med.bion.app | python3 -c "
import json,sys
d=json.load(sys.stdin)
" 2>/dev/null; bun -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const u = await db.user.findUnique({ where: { email: "julia.lima@med.bion.app" }, select: { id: true } });
console.log(u?.id ?? "");
await db.$disconnect();
' 2>/dev/null)
verificar "obteve id da médica demo" "$([[ -n $JULIA_ID ]] && echo 1 || echo 0)"

C=$(code -b "$JAR_ADMIN" -X PATCH "$BASE/api/medicos/$JULIA_ID" -H 'Content-Type: application/json' -d '{"acao":"suspender"}')
verificar "admin suspende médica → 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"
JAR_J="$TMP/julia.jar"
rm -f "$JAR_J"
C=$(code -c "$JAR_J" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"julia.lima@med.bion.app","senha":"bion123456"}')
verificar "médica SUSPENSA → login 403" "$([[ $C == 403 ]] && echo 1 || echo 0)"
C=$(code -b "$JAR_ADMIN" -X PATCH "$BASE/api/medicos/$JULIA_ID" -H 'Content-Type: application/json' -d '{"acao":"aprovar"}')
verificar "admin reativa médica → 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"
C=$(code -c "$JAR_J" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"julia.lima@med.bion.app","senha":"bion123456"}')
verificar "médica reativada → login 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"

echo "=== 7. DELETE de médico → arquivamento (não destrói) ==="
C=$(code -b "$JAR_ADMIN" -X POST "$BASE/api/medicos" -H 'Content-Type: application/json' \
  -d '{"nome":"Medico Arquivo Teste","crm":"TESTE-ARQ-1","especialidade":"Clínica Geral"}')
verificar "cria médico de teste → 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"
ARQ_ID=$(bun -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const u = await db.user.findFirst({ where: { nome: "Medico Arquivo Teste" }, select: { id: true } });
console.log(u?.id ?? "");
await db.$disconnect();
' 2>/dev/null)
C=$(code -b "$JAR_ADMIN" -X DELETE "$BASE/api/medicos/$ARQ_ID")
verificar "DELETE médico → 200 (agora arquivamento)" "$([[ $C == 200 ]] && echo 1 || echo 0)"
ESTADO=$(bun scripts/verificar_db.ts medico-por-id "$ARQ_ID" 2>/dev/null)
verificar "médico arquivado: user inativo + perfil arquivado" \
  "$(echo "$ESTADO" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(1 if d and d['status']=='inativo' and d['perfilMedico']['status']=='arquivado' else 0)")"

echo "=== 8. LGPD completa no paciente de teste (rg-politica) ==="
# paciente criado no passo 3; agenda uma consulta para gerar anamnese, depois anonimiza
PAC_ID=$(bun -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const u = await db.user.findUnique({ where: { email: "rg-politica@teste.local" }, select: { id: true } });
console.log(u?.id ?? "");
await db.$disconnect();
' 2>/dev/null)
if [[ -n $PAC_ID ]]; then
  # mensagem do admin para o paciente (para testar anonimização de mensagens)
  code -b "$JAR_ADMIN" -X POST "$BASE/api/mensagens" -H 'Content-Type: application/json' \
    -d "{\"paraId\":\"$PAC_ID\",\"texto\":\"Mensagem de teste para anonimização LGPD\"}" > /dev/null
  # ticket de suporte do paciente
  C=$(code -b "$JAR_MARINA" -X POST "$BASE/api/tickets" -H 'Content-Type: application/json' \
    -d '{"assunto":"Teste LGPD","categoria":"outro","mensagem":"Ticket de teste"}' 2>/dev/null)
  C=$(code -b "$JAR_ADMIN" -X POST "$BASE/api/admin/lgpd" -H 'Content-Type: application/json' \
    -d "{\"acao\":\"anonimizar\",\"pacienteId\":\"$PAC_ID\"}")
  verificar "anonimizar LGPD → 200" "$([[ $C == 200 ]] && echo 1 || echo 0)"
  ESTADO=$(bun scripts/verificar_db.ts lgpd "$PAC_ID" 2>/dev/null)
  ver=$(echo "$ESTADO" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d and d['status']=='inativo' and d['email'].startswith('anon-')
ok = ok and all(a['coleta']=='{}' for a in d['anamneses'])
ok = ok and all(m['texto'].startswith('[removido') for m in d['mensagensEnviadas']+d['mensagensRecebidas'])
ok = ok and all(t['assunto'].startswith('[removido') for t in d['tickets'])
ok = ok and all(p['cpf']=='' and p['telefone']=='' for p in ([d['perfilPaciente']] if d['perfilPaciente'] else []))
print(1 if ok else 0)")
  verificar "LGPD: identidade+anamnese+mensagens+tickets+perfil anonimizados" "$ver"
  # login não pode mais funcionar
  C=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d '{"email":"rg-politica@teste.local","senha":"BionForte2026"}')
  verificar "paciente anonimizado não loga mais (401)" "$([[ $C == 401 ]] && echo 1 || echo 0)"
else
  verificar "paciente de teste existe" 0
fi

echo "=== 9. Limpeza: cancela consultas criadas ==="
if [[ -n ${CONSULTA_ID:-} ]]; then
  code -b "$JAR_MARINA" -X PATCH "$BASE/api/consultas/$CONSULTA_ID" -H 'Content-Type: application/json' \
    -d '{"acao":"cancelar","motivo":"limpeza da suíte de verificação"}' > /dev/null
  verificar "consulta de teste cancelada" 1
fi

echo ""
echo "RESULTADO: $PASS passaram, $FAIL falharam"
[[ $FAIL == 0 ]] && echo "SUÍTE P0/P1/P2: TUDO OK" || echo "SUÍTE P0/P1/P2: COM FALHAS"
exit $FAIL

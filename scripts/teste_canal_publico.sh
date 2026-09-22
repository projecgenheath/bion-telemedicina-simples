#!/bin/bash
# Testa o canal público (gpt-oss 20b reasoning) no cenário exato do bug do peso:
# etapa identificacao, paciente corrige o peso — a IA deve reconhecer e SEGUIR a conversa.
# Compara: (a) sem reasoning_effort, (b) reasoning_effort high.

PROMPT_SYS='Voce e a BION IA, assistente clinica da plataforma BION. Voce conduz a TRIAGEM PRE-CONSULTA do paciente — consulta de Clinica Geral confirmada e paga. ETAPA ATUAL: Identificacao. ROTEIRO: 1. identificacao — apresente os dados do perfil em 1 frase e peca que confirme ou corrija. 2. queixa — o motivo da consulta, NAS PALAVRAS DO PACIENTE. REGRAS DE ESTILO: Maximo de 3 frases curtas por mensagem. Toda mensagem TERMINA com UMA pergunta clara terminada em "?". UMA pergunta por vez. PROIBIDO perguntar vagamente "Onde podemos prosseguir?". Se a resposta do paciente nao responde a sua pergunta (ex.: "peso 80 kg"), registre o que for registravel e volte IMEDIATAMENTE a pergunta da etapa atual. Eco curto com as proprias palavras dele. DADOS DO PERFIL: Nome: Marina Silva, Idade: 34, Peso: 66 kg, Altura: 170 cm. DADOS JA COLETADOS: {"identificacao":{"_turnos":1}}. FORMATO DE SAIDA — responda EXCLUSIVAMENTE com um JSON valido: {"resposta":"<CURTA e terminando em pergunta>","etapa_concluida":<bool>,"coleta":{...},"perfil_atualizacoes":{"peso":<numero>}} — perfil_atualizacoes so na identificacao e so com dados que o paciente EXPLICITAMENTE corrigiu (campo ausente = omita).'

for EFFORT in "" '"reasoning_effort":"high",'; do
  echo "=== reasoning_effort: ${EFFORT:-padrao} ==="
  START=$(date +%s)
  RESP=$(timeout 60 curl -s -X POST "https://text.pollinations.ai/openai" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"openai\",${EFFORT}\"messages\":[{\"role\":\"system\",\"content\":\"$(echo "$PROMPT_SYS" | sed 's/"/\\"/g')\"},{\"role\":\"user\",\"content\":\"peso em 80 kg\"}]}")
  END=$(date +%s)
  echo "tempo: $((END-START))s"
  echo "$RESP" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    msg = d.get('choices',[{}])[0].get('message',{})
    print('content:', (msg.get('content') or '')[:400])
    print('--- json valido dentro?', end=' ')
    c = msg.get('content') or ''
    i, f = c.find('{'), c.rfind('}')
    if i >= 0 and f > i:
        try:
            j = json.loads(c[i:f+1])
            print('SIM ->', {k: (v if k!='resposta' else v[:120]) for k,v in j.items()})
        except Exception as e:
            print('json quebrado:', e)
    else:
        print('NAO')
except Exception as e:
    print('ERRO parse:', e)
    print(sys.stdin.read()[:300] if not sys.stdin.closed else '')
"
  echo ""
done

#!/usr/bin/env python3
"""Auditoria completa das rotas da API BION — valida o design real:
GET /api/bootstrap carrega o estado; POST/PATCH/DELETE mutam e devolvem estado fresco."""
import json
import urllib.request
import urllib.error
import http.cookiejar
import sys

BASE = "http://127.0.0.1:3000"
resultados = []

def nova_sessao():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def req(opener, metodo, caminho, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    r = urllib.request.Request(BASE + caminho, data=dados, method=metodo)
    r.add_header("Content-Type", "application/json")
    try:
        with opener.open(r, timeout=60) as resp:
            bruto = resp.read().decode()
            return resp.status, (json.loads(bruto) if bruto else {})
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"erro": str(e)}

def marcar(nome, status, esperado=200, detalhe=""):
    ok = status == esperado
    resultados.append((nome, status, ok))
    print(f"{'✅' if ok else '❌'} {nome:56s} HTTP {status} (esperado {esperado})  {str(detalhe)[:70]}")

# ══ PACIENTE (Marina) ══════════════════════════════════════════════════
p = nova_sessao()
s, d = req(p, "POST", "/api/auth/login", {"email": "marina.silva@email.com", "senha": "bion123"})
marcar("AUTH login paciente", s, 200, d.get("usuario", {}).get("nome", d.get("erro", "")))

s, d = req(p, "GET", "/api/bootstrap")
marcar("BOOTSTRAP paciente (estado completo)", s, 200, f"chaves={len(d)} consultas={len(d.get('consultas', []))} notif={len(d.get('notificacoes', []))} lembretes={len(d.get('lembretes', []))} docs={len(d.get('documentos', []))} medicos={len(d.get('medicos', []))}")
chaves = ["consultas", "notificacoes", "documentos", "lembretes", "medicos"]
falta = [k for k in chaves if k not in d]
marcar("BOOTSTRAP chaves essenciais", 200 if not falta else 500, 200, f"faltando={falta}" if falta else "todas presentes")

# Localizar a médica que será usada em todos os testes (mesma do login posterior)
medico_id, medico_email, medico_nome = None, None, None
for m in d.get("medicos", []):
    medico_id, medico_email, medico_nome = m.get("id"), m.get("email", ""), m.get("nome")
    if "julia" in (m.get("email", "") + m.get("nome", "")).lower():
        break

s, d = req(p, "POST", "/api/consultas", {"medicoId": medico_id, "data": "Amanhã", "hora": "15:30", "motivoConsulta": "Auditoria E2E", "valor": "180", "pago": True})
marcar("CONSULTAS agendar (paciente)", s, 200, f"total agora={len(d.get('consultas', []))}")
nova_c = [c for c in d.get("consultas", []) if c.get("motivoConsulta") == "Auditoria E2E"]
cid = sorted((c["id"] for c in nova_c))[-1] if nova_c else None  # CUID monotônico = mais recente
marcar("CONSULTAS nova consulta persistida", 200 if cid else 404, 200, f"id={cid}")

s, d = req(p, "POST", "/api/consultas", {"medicoId": "xxx", "data": "Amanhã", "hora": "10:00"})
marcar("CONSULTAS rejeita médico inválido", s, 400, d.get("erro", ""))

if cid:
    s, d = req(p, "PATCH", f"/api/consultas/{cid}", {"acao": "cancelar", "motivo": "Teste de cancelamento"})
    st = [c for c in d.get("consultas", []) if c.get("id") == cid]
    marcar("CONSULTAS cancelar", s, 200, f"status={st[0].get('status') if st else '?'}")

s, d = req(p, "POST", "/api/arquivos", {"nome": "hemograma.pdf", "tipo": "application/pdf", "tamanhoKb": 240, "enviadoPor": "paciente", "consulta": ""})
marcar("ARQUIVOS anexar exame", s, 200, f"total={len(d.get('arquivos', []))}")

s, d = req(p, "POST", "/api/lembretes", {"titulo": "Losartana 50mg", "horario": "08:00", "tipo": "medicamento", "frequencia": "Diária", "medicamento": "Losartana"})
marcar("LEMBRETES criar", s, 200, f"total={len(d.get('lembretes', []))}")
lem = [l for l in d.get("lembretes", []) if l.get("titulo") == "Losartana 50mg"]
lid = lem[0]["id"] if lem else None
if lid:
    s, d = req(p, "PATCH", f"/api/lembretes/{lid}", {"feito": True})
    lf = [l for l in d.get("lembretes", []) if l.get("id") == lid]
    marcar("LEMBRETES marcar feito", s, 200, f"feito={lf[0].get('feito') if lf else '?'}")
    s, d = req(p, "DELETE", f"/api/lembretes/{lid}")
    marcar("LEMBRETES excluir", s, 200, f"restam={len(d.get('lembretes', []))}")

s, d = req(p, "PATCH", "/api/perfil", {"telefone": "(11) 98765-4321", "peso": "63 kg"})
marcar("PERFIL atualizar", s, 200, f"peso={d.get('perfil', {}).get('peso', d.get('erro', '?'))}")

s, d = req(p, "POST", "/api/consentimentos", {"finalidade": "Geração de prontuário em PDF", "documentos": 2, "aceito": True, "paciente": "Marina Silva"})
marcar("CONSENTIMENTOS registrar", s, 200, f"total={len(d.get('consentimentos', []))}")

s, d = req(p, "POST", "/api/tickets", {"assunto": "Auditoria — teste de chamado", "categoria": "tecnico", "mensagem": "Chamado criado pela auditoria automatizada.", "perfil": "paciente", "usuario": "Marina Silva"})
marcar("TICKETS abrir chamado", s, 200, f"total={len(d.get('tickets', []))}")

s, d = req(p, "PATCH", "/api/notificacoes", {"todas": True})
marcar("NOTIFICACOES marcar todas lidas", s, 200, f"naoLidas={d.get('naoLidas', '?')}")

# Sala de teleconsulta: precisa de consulta confirmada própria
s, d = req(p, "POST", "/api/consultas", {"medicoId": medico_id, "data": "Hoje", "hora": "23:50", "motivoConsulta": "Sala E2E", "valor": "180", "pago": True})
sala_c = [c for c in d.get("consultas", []) if c.get("motivoConsulta") == "Sala E2E" and c.get("id")]
sala_id = sorted((c["id"] for c in sala_c))[-1] if sala_c else None  # mais recente
if sala_id:
    s, d = req(p, "GET", f"/api/telemedicina/{sala_id}/sala")
    marcar("SALA GET heartbeat/presença", s, 200, f"papel={d.get('eu', {}).get('papel')} online={d.get('outroOnline')}")
    s, d = req(p, "POST", f"/api/telemedicina/{sala_id}/sala", {"acao": "sinal", "tipo": "chat", "payload": json.dumps({"texto": "Olá, doutora!"})})
    marcar("SALA POST publicar sinal chat", s, 200, "")
    s, d = req(p, "GET", f"/api/telemedicina/{sala_id}/sala")
    marcar("SALA GET consome sinal (entrega única)", s, 200, f"sinais={len(d.get('sinais', []))}")
else:
    marcar("SALA (sem consulta p/ teste)", 404, 200, "não criada")

# ══ MÉDICO (Júlia) ═════════════════════════════════════════════════════
m = nova_sessao()
s, d = req(m, "POST", "/api/auth/login", {"email": medico_email or "julia.lima@med.bion.app", "senha": "bion123"})
marcar("AUTH login médico", s, 200, d.get("usuario", {}).get("nome", d.get("erro", "")))
s, d = req(m, "GET", "/api/bootstrap")
marcar("BOOTSTRAP médico", s, 200, f"consultas={len(d.get('consultas', []))} pacientes={len(d.get('pacientes', []))}")
pac = d.get("pacientes", [])
pid = pac[0]["id"] if pac else None

# Médico emite receita
s, d = req(m, "POST", "/api/documentos", {"tipo": "receita", "titulo": "Receita — Auditoria", "conteudo": "Uso contínuo", "paciente": pac[0].get("nome") if pac else "Marina Silva", "medicamento": "Losartana 50mg", "posologia": "1x ao dia", "duracao": "30 dias", "observacoes": "", "cid": ""})
marcar("DOCUMENTOS emitir receita (médico)", s, 200, f"total={len(d.get('documentos', []))}")

# Médico conclui a consulta da sala
if sala_id:
    s, d = req(m, "PATCH", f"/api/consultas/{sala_id}", {"acao": "concluir", "resumo": "Paciente saudável. Manter medicação."})
    st = [c for c in d.get("consultas", []) if c.get("id") == sala_id]
    marcar("CONSULTAS concluir (médico)", s, 200, f"status={st[0].get('status') if st else '?'} resumo={'sim' if st and st[0].get('resumoMedico') else 'não'}")

# Paciente avalia a consulta concluída
s, d = req(p, "POST", "/api/avaliacoes", {"medicoId": medico_id, "nota": 5, "comentario": "Atendimento excelente (auditoria)", "pontualidade": 5, "atencao": 5, "clareza": 5})
marcar("AVALIACOES avaliar consulta (paciente)", s, 200, f"total={len(d.get('avaliacoes', []))}")

# Sala deve rejeitar intruso (outro paciente)
o = nova_sessao()
req(o, "POST", "/api/auth/login", {"email": "joao.pereira@email.com", "senha": "bion123"})
s, d = req(o, "GET", f"/api/telemedicina/{sala_id}/sala") if sala_id else (404, {})
marcar("SALA rejeita não participante", s, 403, d.get("erro", ""))

# ══ ADMIN ══════════════════════════════════════════════════════════════
a = nova_sessao()
s, d = req(a, "POST", "/api/auth/login", {"email": "admin@bion.app", "senha": "bion123"})
marcar("AUTH login admin", s, 200, d.get("usuario", {}).get("nome", d.get("erro", "")))
s, d = req(a, "GET", "/api/bootstrap")
marcar("BOOTSTRAP admin", s, 200, f"pacientes={len(d.get('pacientes', []))} tickets={len(d.get('tickets', []))} logs={len(d.get('logs', d.get('auditoria', [])))}")

s, d = req(a, "POST", "/api/pacientes", {"nome": "Paciente Auditoria", "email": "paciente.auditoria@email.com", "senha": "teste123", "cpf": "999.999.999-99", "telefone": "(11) 90000-0000", "convenio": "Particular"})
marcar("PACIENTES criar (admin)", s, 200, f"total={len(d.get('pacientes', []))}")
np = [x for x in d.get("pacientes", []) if x.get("nome") == "Paciente Auditoria"]
npid = np[0]["id"] if np else None

if npid:
    s, d = req(a, "PATCH", f"/api/pacientes/{npid}", {"acao": "suspender"})
    st = [x for x in d.get("pacientes", []) if x.get("id") == npid]
    marcar("PACIENTES suspender (admin)", s, 200, f"status={st[0].get('status') if st else '?'}")
    s, d = req(a, "DELETE", f"/api/pacientes/{npid}")
    marcar("PACIENTES excluir (admin)", s, 200, f"restam={len(d.get('pacientes', []))}")

s, d = req(a, "POST", "/api/auditoria", {"acao": "AUDITORIA_TESTE", "categoria": "sistema", "detalhes": "Log criado pela auditoria"})
marcar("AUDITORIA registrar log (admin)", s, 200, "")

s, d = req(a, "POST", "/api/admin/lgpd", {"acao": "anonimizar", "pacienteId": "id-inexistente"})
marcar("LGPD anonimizar (validação)", s if s in (400, 404) else 0, 404, d.get("erro", "")[:50] or "validou")

# Intruso tenta mutação admin
s, d = req(o, "POST", "/api/pacientes", {"nome": "Intruso", "email": "intruso@email.com", "senha": "123456"})
marcar("PACIENTES criar exige ADMIN", s, 403, d.get("erro", ""))

# ══ RESUMO ═════════════════════════════════════════════════════════════
falhas = [r for r in resultados if not r[2]]
print(f"\n{'='*72}")
print(f"RESULTADO: {len(resultados) - len(falhas)}/{len(resultados)} aprovados")
if falhas:
    print("FALHAS:")
    for nome, status, _ in falhas:
        print(f"  ❌ {nome} -> HTTP {status}")
    sys.exit(1)
print("AUDITORIA COMPLETA: TODAS AS ROTAS OK")

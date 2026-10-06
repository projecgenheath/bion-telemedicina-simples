/**
 * Teste de ponta a ponta da falta do paciente / falha técnica marcadas pelo
 * MÉDICO (regras do Alisson, 06/10/2026), contra um servidor LOCAL ligado a um
 * Postgres LOCAL descartável (nunca o banco de produção), com as migrações
 * 20261001_financeiro, 20261001b_reembolso_manual, 20261003_repasse_diario,
 * 20261006_trava_motivo_falta_medico, 20261006b_presenca_entrou_em e
 * 20261006d_evento_correcao_desfecho.
 *
 *   DATABASE_URL=postgresql://<usuario>@localhost:<porta>/<banco> \
 *   BASE=http://127.0.0.1:<porta-do-next> \
 *   bun --conditions react-server scripts/teste_falta_falha_sala.ts
 *
 * O servidor precisa rodar SEM Supabase configurado (login legado por
 * cookie) e com o mesmo DATABASE_URL. APAGA os dados do banco local.
 */
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { limparSala, verificarPresencaConsulta } from "@/lib/server/presenca-consulta";
import { prazoDesfecho } from "@/components/bion/medico/metricas";

const url = process.env.DATABASE_URL ?? "";
const BASE = process.env.BASE ?? "http://127.0.0.1:3141";
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Só roda contra um Postgres local.");
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) throw new Error("Só roda contra um servidor local.");

let okN = 0;
let falhaN = 0;
function verifica(cond: unknown, nome: string, extra?: unknown) {
  if (cond) { okN++; console.log("ok    " + nome); } else { falhaN++; console.log("FALHA " + nome, extra === undefined ? "" : JSON.stringify(extra)); }
}

const SENHA = "Teste123!";
const agora = () => Date.now();
const min = (n: number) => n * 60_000;
const em = (ms: number) => new Date(ms);

async function limpar() {
  await db.auditLog.deleteMany();
  await db.notificacao.deleteMany();
  await db.presencaSala.deleteMany();
  await db.sinalSala.deleteMany();
  await db.reembolso.deleteMany();
  await db.remarcacaoPendente.deleteMany();
  await db.repasseAjuste.deleteMany({ where: { origemAjusteId: { not: null } } });
  await db.repasseAjuste.deleteMany();
  await db.repasseItem.deleteMany();
  await db.repasse.deleteMany();
  await db.eventoConsulta.deleteMany();
  await db.pagamento.deleteMany();
  await db.anamnese.deleteMany();
  await db.consulta.deleteMany();
  await db.sessao.deleteMany();
  await db.perfilMedico.deleteMany();
  await db.perfilPaciente.deleteMany();
  await db.user.deleteMany();
}

type Conta = { id: string; cookie: string };
async function criarConta(email: string, nome: string, role: string): Promise<Conta> {
  const u = await db.user.create({ data: { email, nome, role, senhaHash: await bcrypt.hash(SENHA, 10) } });
  if (role === "MEDICO") {
    await db.perfilMedico.create({ data: { userId: u.id, crm: "CRM-SP 000000", especialidade: "Clínica Geral", valor: 200 } });
  }
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha: SENHA }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { id: u.id, cookie };
}

async function chamar(conta: Conta, metodo: string, caminho: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", cookie: conta.cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json: json ?? {} };
}
const desfecho = (conta: Conta, id: string, tipo: string) => chamar(conta, "POST", `/api/medico/consultas/${id}/desfecho`, { tipo });

let med: Conta, med2: Conta, pac: Conta, admin: Conta;

async function consulta(inicioMs: number, opcoes: { pago?: boolean; status?: string; especialidade?: string } = {}) {
  const pago = opcoes.pago ?? true;
  const c = await db.consulta.create({
    data: {
      medicoId: med.id,
      pacienteId: pac.id,
      dataInicio: em(inicioMs),
      especialidade: opcoes.especialidade ?? "Clínica Geral",
      valor: 200,
      pago,
      status: opcoes.status ?? (pago ? "confirmada" : "em_espera"),
    },
  });
  if (pago) await db.pagamento.create({ data: { consultaId: c.id, valor: 200, status: "confirmado", via: "simulado", confirmadoEm: em(inicioMs - min(60)) } });
  return c;
}
async function presenca(consultaId: string, usuarioId: string, papel: string, entrouEm: number | null, ultimoPing: number) {
  await db.presencaSala.upsert({
    where: { consultaId_usuarioId: { consultaId, usuarioId } },
    create: { consultaId, usuarioId, papel, entrouEm: entrouEm === null ? null : em(entrouEm), ultimoPing: em(ultimoPing) },
    update: { entrouEm: entrouEm === null ? null : em(entrouEm), ultimoPing: em(ultimoPing) },
  });
}
const eventos = (consultaId: string) => db.eventoConsulta.findMany({ where: { consultaId } });
const statusDe = async (id: string) => (await db.consulta.findUnique({ where: { id }, select: { status: true } }))?.status;

async function main() {
  await limpar();
  med = await criarConta("medico@local.test", "Dra. Helena Prado", "MEDICO");
  med2 = await criarConta("medico2@local.test", "Dr. Outro Médico", "MEDICO");
  pac = await criarConta("paciente@local.test", "Marina Souza", "PACIENTE");
  admin = await criarConta("admin@local.test", "Admin Local", "ADMIN");

  // ---- Heartbeat da sala grava entrouEm e zera depois de 30 s parado ----
  {
    const c = await consulta(agora() - min(5));
    let r = await chamar(med, "GET", `/api/telemedicina/${c.id}/sala`);
    const p1 = await db.presencaSala.findUnique({ where: { consultaId_usuarioId: { consultaId: c.id, usuarioId: med.id } } });
    verifica(r.status === 200 && p1?.entrouEm, "sala: primeiro sinal grava entrouEm", r.status);
    r = await chamar(med, "GET", `/api/telemedicina/${c.id}/sala`);
    const p2 = await db.presencaSala.findUnique({ where: { consultaId_usuarioId: { consultaId: c.id, usuarioId: med.id } } });
    verifica(p2?.entrouEm?.getTime() === p1?.entrouEm?.getTime() && p2!.ultimoPing > p1!.ultimoPing, "sala: sinal contínuo mantém entrouEm");
    await db.presencaSala.update({ where: { consultaId_usuarioId: { consultaId: c.id, usuarioId: med.id } }, data: { ultimoPing: em(agora() - 40_000), entrouEm: em(agora() - min(3)) } });
    await chamar(med, "GET", `/api/telemedicina/${c.id}/sala`);
    const p3 = await db.presencaSala.findUnique({ where: { consultaId_usuarioId: { consultaId: c.id, usuarioId: med.id } } });
    verifica(p3!.entrouEm!.getTime() > agora() - 10_000, "sala: 40 s parado → entrouEm recomeça na volta");
  }

  // ---- 1. Falta antes de 15 min → 409 ----
  {
    const c = await consulta(agora() - min(5));
    await presenca(c.id, med.id, "MEDICO", agora() - min(6), agora());
    const r = await desfecho(med, c.id, "falta_paciente");
    verifica(r.status === 409 && r.json.motivo === "aguardar" && typeof r.json.liberaEm === "string", "falta antes de 15 min → 409 (aguardar, com liberaEm)", r);
    const g = await chamar(med, "GET", `/api/medico/consultas/${c.id}/desfecho`);
    const f = g.json.falta as { pode: boolean; liberaEm: string } | undefined;
    verifica(g.status === 200 && f?.pode === false && Math.abs(Date.parse(f.liberaEm) - (c.dataInicio.getTime() + min(15))) < 1000 && g.json.pacienteEsteve === false,
      "GET desfecho: ainda não pode, libera no horário + 15", g.json);
    verifica((await eventos(c.id)).length === 0, "nada gravado na recusa");
  }

  // ---- 2. Paciente com presença depois do horário → 409 ----
  {
    const c = await consulta(agora() - min(30));
    await presenca(c.id, med.id, "MEDICO", agora() - min(31), agora());
    await presenca(c.id, pac.id, "PACIENTE", agora() - min(25), agora() - min(20));
    const r = await desfecho(med, c.id, "falta_paciente");
    verifica(r.status === 409 && r.json.motivo === "paciente_esteve", "paciente esteve depois do horário → 409", r);
  }

  // ---- 3. Presença do paciente só ANTES do horário não impede ----
  let cFalta = "";
  {
    const c = await consulta(agora() - min(30));
    cFalta = c.id;
    await presenca(c.id, med.id, "MEDICO", agora() - min(31), agora());
    await presenca(c.id, pac.id, "PACIENTE", agora() - min(45), agora() - min(40));
    const r = await desfecho(med, c.id, "falta_paciente");
    verifica(r.status === 200 && r.json.desfecho === "falta_paciente", "presença só antes do horário: falta registrada (200)", r);
    const evs = await eventos(c.id);
    verifica(evs.length === 1 && evs[0].tipo === "falta_paciente" && evs[0].por === "medico" && evs[0].atorId === med.id && evs[0].motivo === "falta_paciente",
      "evento falta_paciente / por medico / atorId", evs);
    verifica((await statusDe(c.id)) === "confirmada", "falta: status não muda (o médico recebe)");
    const n = await db.notificacao.findMany({ where: { usuarioId: pac.id, titulo: "Falta registrada" } });
    verifica(n.length === 1 && /reembolso pelo app em até 7 dias/.test(n[0].texto), "falta: paciente avisado (reembolso em 7 dias)", n);
    const a = await db.auditLog.findMany({ where: { entidadeId: c.id, acao: "CONSULTA_FALTA_PACIENTE" } });
    verifica(a.length === 1 && a[0].usuarioId === med.id && a[0].role === "MEDICO" && /pelo médico/.test(a[0].detalhes ?? ""), "falta: auditoria com o médico", a);
    const cw = r.json.consulta as { falta?: boolean } | undefined;
    verifica(cw?.falta === true, "resposta traz a consulta (delta) com falta = true");
  }

  // ---- 4. Médico que entrou atrasado espera até o horário + 15 ----
  {
    const c = await consulta(agora() - min(12));
    await presenca(c.id, med.id, "MEDICO", agora() - min(2), agora()); // entrou aos +10
    let r = await desfecho(med, c.id, "falta_paciente");
    verifica(r.status === 409 && r.json.motivo === "aguardar", "entrou atrasado (+10), agora +12 → 409", r);
    const c2 = await consulta(agora() - min(16), { especialidade: "Cardiologia" });
    await presenca(c2.id, med.id, "MEDICO", agora() - min(6), agora()); // entrou aos +10, agora +16
    r = await desfecho(med, c2.id, "falta_paciente");
    verifica(r.status === 200, "entrou atrasado (+10), agora +16 → 200", r);
    const c3 = await consulta(agora() - min(20), { especialidade: "Dermatologia" });
    await presenca(c3.id, med.id, "MEDICO", agora() - min(20), agora() - min(12)); // saiu aos +8
    r = await desfecho(med, c3.id, "falta_paciente");
    verifica(r.status === 409 && r.json.motivo === "medico_nao_esteve", "saiu da sala antes de +15 → 409", r);
  }

  // ---- 5. Falha técnica: paga → aguardando reagendamento; não paga → cancelada ----
  {
    const paga = await consulta(agora() - min(10));
    let r = await desfecho(med, paga.id, "falha_tecnica");
    verifica(r.status === 200 && r.json.status === "aguardando_reagendamento", "falha técnica (paga) → aguardando_reagendamento", r);
    verifica((await statusDe(paga.id)) === "aguardando_reagendamento", "banco: aguardando_reagendamento");
    let evs = await eventos(paga.id);
    verifica(evs.length === 1 && evs[0].tipo === "falha_tecnica" && evs[0].motivo === "falha_tecnica" && evs[0].por === "medico" && evs[0].atorId === med.id,
      "evento falha_tecnica / por medico", evs);
    const n = await db.notificacao.findMany({ where: { usuarioId: pac.id, titulo: "Falha técnica na consulta" } });
    verifica(n.some((x) => /remarcar sem custo ou reembolso integral/.test(x.texto)), "paciente avisado (remarcar ou reembolso)");
    const naoPaga = await consulta(agora() - min(10), { pago: false, especialidade: "Pediatria" });
    r = await desfecho(med, naoPaga.id, "falha_tecnica");
    verifica(r.status === 200 && r.json.status === "cancelada", "falha técnica (não paga) → cancelada", r);
    evs = await eventos(naoPaga.id);
    verifica(evs.length === 1 && evs[0].por === "medico", "um evento (não paga)");
  }

  // ---- 6. Clique duplo grava um evento só ----
  {
    const c = await consulta(agora() - min(10));
    const [a, b] = await Promise.all([desfecho(med, c.id, "falha_tecnica"), desfecho(med, c.id, "falha_tecnica")]);
    verifica(a.status === 200 && b.status === 200 && (a.json.jaRegistrado === true) !== (b.json.jaRegistrado === true),
      "clique duplo (falha): os dois 200, um com jaRegistrado", [a.status, a.json.jaRegistrado, b.status, b.json.jaRegistrado, a.json.erro, b.json.erro]);
    verifica((await eventos(c.id)).length === 1, "clique duplo (falha): 1 evento");
    verifica((await db.auditLog.count({ where: { entidadeId: c.id, acao: "CONSULTA_FALHA_TECNICA" } })) === 1, "clique duplo (falha): 1 auditoria");
    const c2 = await consulta(agora() - min(20), { especialidade: "Ortopedia" });
    await presenca(c2.id, med.id, "MEDICO", agora() - min(21), agora());
    const [x, y, z] = await Promise.all([1, 2, 3].map(() => desfecho(med, c2.id, "falta_paciente")));
    verifica([x, y, z].every((q) => q.status === 200) && (await eventos(c2.id)).length === 1, "triplo clique (falta): 200 e 1 evento", [x.status, y.status, z.status]);
    const outro = await desfecho(med, c2.id, "falha_tecnica");
    verifica(outro.status === 409, "depois da falta, pedir falha técnica → 409", outro);
  }

  // ---- 7. Desfecho existente (do sistema) recusa ----
  {
    const c = await consulta(agora() - min(30));
    await db.eventoConsulta.create({ data: { consultaId: c.id, tipo: "falta_paciente", por: "sistema", dataAnterior: c.dataInicio, motivo: "falta_paciente", multaCentavos: 0 } });
    await presenca(c.id, med.id, "MEDICO", agora() - min(31), agora());
    const r1 = await desfecho(med, c.id, "falta_paciente");
    const r2 = await desfecho(med, c.id, "falha_tecnica");
    verifica(r1.status === 409 && r2.status === 409 && /já tem desfecho/.test(String(r1.json.erro)), "desfecho do sistema: médico não corrige (409)", [r1, r2]);
    verifica((await eventos(c.id)).length === 1, "desfecho do sistema continua único");
    const cc = await consulta(agora() - min(30), { status: "concluida" });
    const r3 = await desfecho(med, cc.id, "falha_tecnica");
    verifica(r3.status === 409, "consulta concluída → 409", r3);
    const ca = await consulta(agora() - min(30), { status: "cancelada" });
    verifica((await desfecho(med, ca.id, "falta_paciente")).status === 409, "consulta cancelada → 409");
  }

  // ---- 8. Outro médico, paciente, admin → 403; inexistente → 404; tipo inválido → 400 ----
  {
    const c = await consulta(agora() - min(30));
    await presenca(c.id, med.id, "MEDICO", agora() - min(31), agora());
    const r = await Promise.all([desfecho(med2, c.id, "falta_paciente"), desfecho(pac, c.id, "falta_paciente"), desfecho(admin, c.id, "falha_tecnica")]);
    verifica(r.every((x) => x.status === 403), "outro médico / paciente / admin → 403", r.map((x) => x.status));
    const g = await Promise.all([med2, pac, admin].map((q) => chamar(q, "GET", `/api/medico/consultas/${c.id}/desfecho`)));
    verifica(g.every((x) => x.status === 403), "GET desfecho: outros → 403", g.map((x) => x.status));
    verifica((await desfecho(med, "naoexiste", "falta_paciente")).status === 404, "consulta inexistente → 404");
    verifica((await desfecho(med, c.id, "concluida")).status === 400, "tipo inválido → 400");
    verifica((await eventos(c.id)).length === 0, "nada gravado pelos outros");
  }

  // ---- 9. Depois das 23:30 do dia da consulta → 409 ----
  {
    const ontem14 = agora() - 86_400_000; // mesma hora de ontem
    const c = await consulta(ontem14);
    await presenca(c.id, med.id, "MEDICO", ontem14, ontem14 + min(20));
    verifica(agora() > prazoDesfecho(ontem14), "pré-condição: o prazo de ontem já passou");
    const r1 = await desfecho(med, c.id, "falta_paciente");
    const r2 = await desfecho(med, c.id, "falha_tecnica");
    verifica(r1.status === 409 && r2.status === 409 && /23:30/.test(String(r1.json.erro)), "depois das 23:30 → 409 (falta e falha)", [r1, r2]);
  }

  // ---- 10. Concluir sem o paciente recusa (regra 4) ----
  {
    const c = await consulta(agora() - min(20));
    await presenca(c.id, med.id, "MEDICO", agora() - min(21), agora());
    let r = await chamar(med, "PATCH", `/api/consultas/${c.id}`, { acao: "concluir", resumo: "x" });
    verifica(r.status === 409 && r.json.semPaciente === true, "concluir sem o paciente → 409", r);
    await presenca(c.id, pac.id, "PACIENTE", agora() - min(40), agora() - min(30)); // só antes do horário
    r = await chamar(med, "PATCH", `/api/consultas/${c.id}`, { acao: "concluir" });
    verifica(r.status === 409, "concluir com o paciente só antes do horário → 409", r.status);
    await presenca(c.id, pac.id, "PACIENTE", agora() - min(18), agora() - min(1));
    r = await chamar(med, "PATCH", `/api/consultas/${c.id}`, { acao: "concluir", resumo: "ok" });
    verifica(r.status === 200 && (await statusDe(c.id)) === "concluida", "concluir com o paciente depois do horário → 200", r.status);
    const cf = await consulta(agora() - min(20), { especialidade: "Neurologia" });
    await presenca(cf.id, med.id, "MEDICO", agora() - min(21), agora());
    await presenca(cf.id, pac.id, "PACIENTE", agora() - min(10), agora() - min(5));
    await db.eventoConsulta.create({ data: { consultaId: cf.id, tipo: "falta_paciente", por: "sistema", dataAnterior: cf.dataInicio, motivo: "falta_paciente", multaCentavos: 0 } });
    r = await chamar(med, "PATCH", `/api/consultas/${cf.id}`, { acao: "concluir" });
    verifica(r.status === 409, "concluir consulta com desfecho → 409", r);
    const ca = await consulta(agora() - min(20), { especialidade: "Geriatria" });
    r = await chamar(admin, "PATCH", `/api/consultas/${ca.id}`, { acao: "concluir" });
    verifica(r.status === 200, "admin continua podendo concluir (corrige)", r.status);
  }

  // ---- 11. O sistema não sobrescreve um desfecho manual ----
  {
    // Falta manual; depois o paciente entra (regra 2) e cai: o sistema veria "falha técnica".
    const ini = agora() - min(130);
    const c = await consulta(ini);
    await presenca(c.id, med.id, "MEDICO", ini, ini + min(16));
    const r = await desfecho(med, c.id, "falta_paciente");
    verifica(r.status === 200, "falta manual registrada (consulta de 2h10 atrás, ainda no prazo)", r);
    await presenca(c.id, pac.id, "PACIENTE", ini + min(50), ini + min(60));
    const sis = await verificarPresencaConsulta(c.id);
    const evs = await eventos(c.id);
    verifica(sis === null && evs.length === 1 && evs[0].por === "medico" && (await statusDe(c.id)) === "confirmada",
      "verificação automática não grava por cima da falta manual", { sis, evs });
    // Regra 2: a falta vale mesmo com o paciente entrando depois; ele pede reembolso em 7 dias.
    const rr = await chamar(pac, "POST", `/api/consultas/${c.id}/reembolso`, { justificativa: "Tive um imprevisto e entrei atrasada." });
    verifica(rr.status >= 200 && rr.status < 300 && (await db.reembolso.count({ where: { pagamento: { consultaId: c.id }, origem: "manual" } })) === 1,
      "regra 2: paciente que entrou depois da falta pede reembolso (fluxo existente)", rr);
    // Falha manual (status muda): o sistema também não mexe.
    const c2 = await consulta(ini, { especialidade: "Cardiologia" });
    await presenca(c2.id, pac.id, "PACIENTE", ini, ini + min(30)); // o sistema veria "falta do médico"
    verifica((await desfecho(med, c2.id, "falha_tecnica")).status === 200, "falha manual registrada");
    verifica((await verificarPresencaConsulta(c2.id)) === null && (await eventos(c2.id)).length === 1, "verificação automática não grava por cima da falha manual");
  }

  // ---- 12. A limpeza não apaga presença nem "encerrada" de consulta sem desfecho ----
  {
    const ini = agora() - min(90);
    const c = await consulta(ini);
    await presenca(c.id, med.id, "MEDICO", ini, ini + min(16));
    await presenca(c.id, pac.id, "PACIENTE", ini - min(30), ini - min(25));
    const velho = em(agora() - min(60));
    await db.sinalSala.create({ data: { consultaId: c.id, deUsuarioId: med.id, deRole: "MEDICO", tipo: "controle", payload: '{"acao":"encerrada"}', consumido: true, createdAt: velho } });
    await db.sinalSala.create({ data: { consultaId: c.id, deUsuarioId: med.id, deRole: "MEDICO", tipo: "candidato", payload: "{}", consumido: true, createdAt: velho } });
    let l = await limparSala(c.id);
    let pres = await db.presencaSala.count({ where: { consultaId: c.id } });
    let sinais = await db.sinalSala.findMany({ where: { consultaId: c.id }, select: { tipo: true } });
    verifica(!l.temDesfecho && pres === 2 && sinais.length === 1 && sinais[0].tipo === "controle",
      "sem desfecho: guarda as 2 presenças e o 'encerrada'; apaga o candidato velho", { pres, sinais });
    await db.consulta.update({ where: { id: c.id }, data: { status: "concluida" } });
    l = await limparSala(c.id);
    pres = await db.presencaSala.count({ where: { consultaId: c.id } });
    sinais = await db.sinalSala.findMany({ where: { consultaId: c.id }, select: { tipo: true } });
    verifica(l.temDesfecho && pres === 0 && sinais.length === 0, "com desfecho: apaga presenças paradas e o 'encerrada' antigo", { pres, sinais });
  }

  // ---- 13. Pré-sala: GET ?espiar=1 só lê; janela da sala (30 min antes … 2 h depois) ----
  {
    const c = await consulta(agora() + min(10));
    await presenca(c.id, med.id, "MEDICO", agora() - min(1), agora());
    const sinal = await db.sinalSala.create({ data: { consultaId: c.id, deUsuarioId: med.id, deRole: "MEDICO", tipo: "chat", payload: '{"texto":"Olá"}' } });
    const auditAntes = await db.auditLog.count({ where: { entidadeId: c.id } });
    const r = await chamar(pac, "GET", `/api/telemedicina/${c.id}/sala?espiar=1`);
    const j = r.json as { espiar?: boolean; outroOnline?: boolean; sinais?: unknown; iceServers?: unknown; janela?: { estado: string } };
    verifica(r.status === 200 && j.espiar === true && j.outroOnline === true && j.janela?.estado === "aberta" && j.sinais === undefined && j.iceServers === undefined,
      "espiar: 200, diz que o médico está na sala, sem sinais nem iceServers", r.json);
    verifica((await db.presencaSala.count({ where: { consultaId: c.id, usuarioId: pac.id } })) === 0, "espiar: não grava presença do paciente");
    verifica((await db.auditLog.count({ where: { entidadeId: c.id } })) === auditAntes, "espiar: não grava auditoria de entrada");
    verifica((await db.sinalSala.findUnique({ where: { id: sinal.id } }))?.consumido === false, "espiar: não consome a mensagem do médico");
    // Chamada normal (pela /consulta depois de "Entrar"): agora sim grava e entrega.
    const n = await chamar(pac, "GET", `/api/telemedicina/${c.id}/sala`);
    verifica(n.status === 200 && (n.json.janela as { estado?: string })?.estado === "aberta" && (await db.presencaSala.count({ where: { consultaId: c.id, usuarioId: pac.id } })) === 1
      && (await db.sinalSala.findUnique({ where: { id: sinal.id } }))?.consumido === true
      && (await db.auditLog.count({ where: { entidadeId: c.id, acao: "TELECONSULTA_SALA_ENTRADA" } })) === 1,
      "chamada normal: grava presença, auditoria e entrega a mensagem", n.status);

    const cedo = await consulta(agora() + min(45), { especialidade: "Cedo" });
    let a = await chamar(med, "GET", `/api/telemedicina/${cedo.id}/sala`);
    verifica(a.status === 409 && /ainda não abriu/.test(String(a.json.erro)), "45 min antes: GET normal → 409", a);
    verifica((await db.presencaSala.count({ where: { consultaId: cedo.id } })) === 0, "45 min antes: nenhuma presença gravada");
    a = await chamar(med, "GET", `/api/telemedicina/${cedo.id}/sala?espiar=1`);
    verifica(a.status === 200 && (a.json.janela as { estado?: string })?.estado === "antes", "45 min antes: espiar → 200 (estado antes)", a.json);
    a = await chamar(med, "POST", `/api/telemedicina/${cedo.id}/sala`, { acao: "sinal", tipo: "chat", payload: '{"texto":"oi"}' });
    verifica(a.status === 409, "45 min antes: POST de sinal → 409", a.status);
    const limiteAbre = await consulta(agora() + min(29), { especialidade: "Limite" });
    verifica((await chamar(med, "GET", `/api/telemedicina/${limiteAbre.id}/sala`)).status === 200, "29 min antes: sala aberta (200)");

    const tarde = await consulta(agora() - min(125), { especialidade: "Tarde" });
    a = await chamar(pac, "GET", `/api/telemedicina/${tarde.id}/sala`);
    verifica(a.status === 409 && /já fechou/.test(String(a.json.erro)), "2h05 depois: GET normal → 409", a);
    verifica((await db.presencaSala.count({ where: { consultaId: tarde.id } })) === 0, "2h05 depois: nenhuma presença gravada (não vira 'paciente esteve')");
    a = await chamar(pac, "GET", `/api/telemedicina/${tarde.id}/sala?espiar=1`);
    verifica(a.status === 200 && (a.json.janela as { estado?: string })?.estado === "fechada", "2h05 depois: espiar → 200 (estado fechada)");
    a = await chamar(med, "POST", `/api/telemedicina/${tarde.id}/sala`, { acao: "sinal", tipo: "controle", payload: '{"acao":"encerrada"}' });
    verifica(a.status === 200, "2h05 depois: controle 'encerrada' ainda aceito", a.status);
    const intrusa = await chamar(med2, "GET", `/api/telemedicina/${c.id}/sala?espiar=1`);
    verifica(intrusa.status === 403, "espiar: quem não participa → 403", intrusa.status);
  }

  console.log(`\n${okN} ok, ${falhaN} falha(s)`);
  await db.$disconnect();
  if (falhaN) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });

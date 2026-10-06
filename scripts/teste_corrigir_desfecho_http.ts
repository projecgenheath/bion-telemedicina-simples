/**
 * Ponta a ponta das rotas do admin para o desfecho, contra um servidor LOCAL
 * ligado a um Postgres LOCAL descartável (nunca produção), com as migrações
 * até 20261006d_evento_correcao_desfecho aplicadas:
 *   GET/POST /api/admin/consultas/[id]/corrigir-desfecho
 *   GET      /api/admin/consultas/sem-desfecho
 *
 *   DATABASE_URL=postgresql://<usuario>@localhost:<porta>/<banco> \
 *   BASE=http://127.0.0.1:<porta-do-next> \
 *   bun --conditions react-server scripts/teste_corrigir_desfecho_http.ts
 *
 * O servidor precisa rodar SEM Supabase configurado (login legado por
 * cookie) e com o mesmo DATABASE_URL. APAGA os dados do banco local.
 */
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const url = process.env.DATABASE_URL ?? "";
const BASE = process.env.BASE ?? "http://127.0.0.1:3147";
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Só roda contra um Postgres local.");
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) throw new Error("Só roda contra um servidor local.");
const SENHA = "Senha-Teste-123";

let okN = 0;
let falhaN = 0;
function verifica(cond: unknown, nome: string, extra?: unknown) {
  if (cond) { okN++; console.log("ok    " + nome); } else { falhaN++; console.log("FALHA " + nome, extra === undefined ? "" : JSON.stringify(extra)); }
}

async function limpar() {
  await db.auditLog.deleteMany();
  await db.notificacao.deleteMany();
  await db.reembolso.deleteMany();
  await db.remarcacaoPendente.deleteMany();
  await db.repasseAjuste.deleteMany({ where: { origemAjusteId: { not: null } } });
  await db.repasseAjuste.deleteMany();
  await db.repasseItem.deleteMany();
  await db.repasse.deleteMany();
  await db.eventoConsulta.deleteMany();
  await db.pagamento.deleteMany();
  await db.consulta.deleteMany();
  await db.sessao.deleteMany();
  await db.perfilMedico.deleteMany();
  await db.user.deleteMany();
}

type Conta = { id: string; cookie: string };
async function criarConta(email: string, nome: string, role: string): Promise<Conta> {
  const u = await db.user.create({ data: { email, nome, role, senhaHash: await bcrypt.hash(SENHA, 10) } });
  if (role === "MEDICO") await db.perfilMedico.create({ data: { userId: u.id, crm: "CRM-SP 000000", especialidade: "Clínica Geral", valor: 200 } });
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha: SENHA }) });
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${await res.text()}`);
  return { id: u.id, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}
async function chamar(conta: Conta, metodo: string, caminho: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", cookie: conta.cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: res.status, json: ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown> };
}

async function main() {
  await limpar();
  const admin = await criarConta("adm@t.local", "Admin Teste", "ADMIN");
  const med = await criarConta("med@t.local", "Dra. Teste", "MEDICO");
  const pac = await criarConta("pac@t.local", "Paciente Teste", "PACIENTE");
  const ha = (h: number) => new Date(Date.now() - h * 3_600_000);
  const nova = async (quando: Date, status = "confirmada") => {
    const c = await db.consulta.create({ data: { medicoId: med.id, pacienteId: pac.id, dataInicio: quando, especialidade: "Clínica", valor: 200, pago: true, status } });
    await db.pagamento.create({ data: { consultaId: c.id, valor: 200, status: "confirmado", via: "simulado", confirmadoEm: quando } });
    return c;
  };
  const velha = await nova(ha(30)); // sem desfecho há 30 h
  const recente = await nova(ha(5)); // sem desfecho há 5 h (ainda não vai para a Fila)
  await nova(ha(40), "concluida"); // com desfecho

  const rota = `/api/admin/consultas/${velha.id}/corrigir-desfecho`;
  for (const [quem, conta] of [["médico", med], ["paciente", pac]] as const) {
    verifica((await chamar(conta, "GET", rota)).status === 403, `GET prévia: ${quem} recebe 403`);
    verifica((await chamar(conta, "POST", rota, { novo: "realizada", motivo: "Tentativa de quem não é admin." })).status === 403, `POST: ${quem} recebe 403`);
    verifica((await chamar(conta, "GET", "/api/admin/consultas/sem-desfecho")).status === 403, `sem-desfecho: ${quem} recebe 403`);
  }
  const lista = await chamar(admin, "GET", "/api/admin/consultas/sem-desfecho");
  const ids = ((lista.json.consultas as { id: string }[]) ?? []).map((c) => c.id);
  verifica(lista.status === 200 && ids.length === 1 && ids[0] === velha.id && lista.json.horas === 24, "sem-desfecho: só a de mais de 24 h", lista.json);

  const prev = await chamar(admin, "GET", rota);
  type PlanoT = { dinheiro: { efeito: string }; notificarPaciente: boolean; motivoParaPaciente: boolean; notificarMedico: boolean };
  const opcoes = (prev.json.opcoes as { novo: string; ok: boolean; plano?: PlanoT }[]) ?? [];
  verifica(prev.status === 200 && prev.json.atual === "sem_desfecho" && opcoes.length === 4, "prévia: atual sem desfecho e 4 opções", prev.json);
  verifica(opcoes.find((o) => o.novo === "realizada")?.plano?.dinheiro.efeito === "entra_no_proximo_repasse", "prévia: realizada entra no próximo repasse");
  const pR = opcoes.find((o) => o.novo === "realizada")?.plano;
  const pF = opcoes.find((o) => o.novo === "falta_paciente")?.plano;
  const pT = opcoes.find((o) => o.novo === "falha_tecnica")?.plano;
  verifica(pR?.notificarPaciente === false && pR.motivoParaPaciente === false && pR.notificarMedico === true,
    "prévia: sem desfecho → realizada não avisa o paciente (só o médico)", pR);
  verifica(pF?.notificarPaciente === true && pF.motivoParaPaciente === true, "prévia: falta do paciente leva o motivo ao paciente", pF);
  verifica(pT?.notificarPaciente === true && pT.motivoParaPaciente === false, "prévia: falha técnica avisa o paciente sem o motivo", pT);
  verifica((await chamar(admin, "GET", "/api/admin/consultas/nao-existe/corrigir-desfecho")).status === 404, "prévia: consulta inexistente 404");

  verifica((await chamar(admin, "POST", rota, { novo: "realizada", motivo: "curto" })).status === 400, "POST: motivo com menos de 10 caracteres → 400");
  verifica((await chamar(admin, "POST", rota, { novo: "concluida", motivo: "Motivo suficiente aqui." })).status === 400, "POST: desfecho inválido → 400");
  const errado = await chamar(admin, "POST", rota, { novo: "realizada", motivo: "Suporte confirmou a consulta.", esperado: "falta_paciente" });
  verifica(errado.status === 409, "POST: esperado diferente do atual → 409", errado.json);
  const r = await chamar(admin, "POST", rota, { novo: "falta_paciente", motivo: "O paciente confirmou que não entrou.", esperado: "sem_desfecho" });
  verifica(r.status === 200 && r.json.jaAplicado === false && r.json.desfecho === "falta_paciente", "POST: grava falta do paciente", r.json);
  const ev = await db.eventoConsulta.findFirst({ where: { consultaId: velha.id } });
  verifica(ev?.por === "admin" && ev.atorId === admin.id && ev.tipo === "falta_paciente", "evento por admin com o id do admin", ev);
  const de = await chamar(admin, "POST", rota, { novo: "falta_paciente", motivo: "O paciente confirmou que não entrou.", esperado: "sem_desfecho" });
  verifica(de.status === 200 && de.json.jaAplicado === true, "POST repetido: 200 jaAplicado (sem gravar de novo)", de.json);
  verifica((await db.auditLog.count({ where: { acao: "CONSULTA_DESFECHO_CORRIGIDO", entidadeId: velha.id } })) === 1, "uma auditoria só");
  // Antes do bootstrap do paciente (a avaliação de presença do Médicos roda nele
  // e grava desfecho em consulta antiga sem ninguém na sala).
  // sem desfecho → realizada: o paciente não recebe nada; o médico, sim (passa a receber).
  const antesPac = await db.notificacao.count({ where: { usuarioId: pac.id } });
  const antesMed = await db.notificacao.count({ where: { usuarioId: med.id } });
  const rr = await chamar(admin, "POST", `/api/admin/consultas/${recente.id}/corrigir-desfecho`, { novo: "realizada", motivo: "A médica confirmou que atendeu.", esperado: "sem_desfecho" });
  verifica(rr.status === 200 && rr.json.desfecho === "realizada", "POST: sem desfecho → realizada", rr.json);
  verifica((await db.notificacao.count({ where: { usuarioId: pac.id } })) === antesPac, "sem desfecho → realizada: nenhuma notificação nova para o paciente");
  verifica((await db.notificacao.count({ where: { usuarioId: med.id } })) === antesMed + 1, "sem desfecho → realizada: o médico é notificado");
  const aud2 = JSON.parse((await db.auditLog.findFirst({ where: { acao: "CONSULTA_DESFECHO_CORRIGIDO", entidadeId: recente.id } }))?.detalhes ?? "{}");
  verifica(aud2.motivoEnviadoAoPaciente === false && JSON.stringify(aud2.notificados) === JSON.stringify([med.id]), "auditoria: motivo não enviado; notificado só o médico", aud2);
  const notifs = await chamar(pac, "GET", "/api/bootstrap");
  const doPac = ((notifs.json.notificacoes as { titulo: string; texto?: string; mensagem?: string }[]) ?? []).filter((n) => n.titulo === "Registro da consulta corrigido");
  const textoPac = (doPac[0]?.texto ?? doPac[0]?.mensagem ?? "").replace(/\u00a0/g, " ");
  verifica(doPac.length === 1, "o paciente vê a notificação no bootstrap", notifs.json.notificacoes);
  verifica(/^A consulta de Clínica de \d{2}\/\d{2} às \d{2}:\d{2} foi registrada como falta\. /.test(textoPac) && textoPac.endsWith(" Motivo: O paciente confirmou que não entrou.") && !/→|_/.test(textoPac),
    "texto do paciente: sem termo interno nem seta, com o motivo (falta)", textoPac);
  const aud = await db.auditLog.findFirst({ where: { acao: "CONSULTA_DESFECHO_CORRIGIDO", entidadeId: velha.id } });
  verifica(JSON.parse(aud?.detalhes ?? "{}").motivoEnviadoAoPaciente === true, "auditoria registra que o motivo foi enviado ao paciente", aud?.detalhes);

  const semAgora = await chamar(admin, "GET", "/api/admin/consultas/sem-desfecho");
  verifica((semAgora.json.consultas as unknown[]).length === 0, "depois do desfecho, sai da lista da Fila");

  console.log(`\n${okN} ok, ${falhaN} falha(s)`);
  await limpar();
  await db.$disconnect();
  if (falhaN) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

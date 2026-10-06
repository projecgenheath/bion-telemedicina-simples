/**
 * Teste do desfecho pelo admin (financeiro.ts: aplicarFalhaTecnica com
 * {motivo, por, atorId}, desfechoDaConsulta, planejarCorrecaoDesfecho e
 * corrigirDesfecho) contra um Postgres LOCAL descartável (nunca produção),
 * com as migrações até 20261006c_evento_correcao_desfecho aplicadas.
 *   DATABASE_URL=postgresql://<usuario>@localhost:<porta>/<banco> \
 *   bun --conditions react-server scripts/teste_desfecho_admin.ts
 * APAGA os dados do banco local.
 */
import { db } from "@/lib/db";
import {
  aplicarFalhaTecnica,
  carregarEstadoCorrecao,
  corrigirDesfecho,
  desfechoDaConsulta,
  pedirReembolsoManual,
  planejarCorrecaoDesfecho,
  previaCorrecaoDesfecho,
} from "@/lib/server/financeiro";
import { fecharRepasseDoMedico, previaDoDia } from "@/lib/server/repasse";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Só roda contra um Postgres local.");

let okN = 0;
let falhaN = 0;
function verifica(cond: unknown, nome: string, extra?: unknown) {
  if (cond) { okN++; console.log("ok    " + nome); } else { falhaN++; console.log("FALHA " + nome, extra ?? ""); }
}
const sp = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

async function limpar() {
  await db.repasseAjuste.deleteMany({ where: { origemAjusteId: { not: null } } });
  await db.repasseAjuste.deleteMany();
  await db.repasseItem.deleteMany();
  await db.repasse.deleteMany();
  await db.reembolso.deleteMany();
  await db.remarcacaoPendente.deleteMany();
  await db.eventoConsulta.deleteMany();
  await db.pagamento.deleteMany();
  await db.notificacao.deleteMany();
  await db.auditLog.deleteMany();
  await db.consulta.deleteMany();
  await db.user.deleteMany();
}

let medId = "";
let pacId = "";
async function consulta(quando: Date, extra: Record<string, unknown> = {}, pagar = true) {
  const c = await db.consulta.create({
    data: { medicoId: medId, pacienteId: pacId, dataInicio: quando, especialidade: "Clínica", valor: 200, pago: pagar, status: "confirmada", ...extra },
  });
  const p = pagar ? await db.pagamento.create({ data: { consultaId: c.id, valor: 200, status: "confirmado", via: "simulado", confirmadoEm: quando } }) : null;
  return { c, p };
}
const eventos = (consultaId: string) => db.eventoConsulta.findMany({ where: { consultaId }, orderBy: { em: "asc" } });

async function main() {
  await limpar();
  const med = await db.user.create({ data: { nome: "Dra. Ana", email: "m@t", senhaHash: "x", role: "MEDICO" } });
  const pac = await db.user.create({ data: { nome: "Pac", email: "p@t", senhaHash: "x" } });
  const adm = await db.user.create({ data: { nome: "Admin", email: "a@t", senhaHash: "x", role: "ADMIN" } });
  medId = med.id;
  pacId = pac.id;
  const admin = { id: adm.id, nome: adm.nome };
  const D = "2030-05-02";
  const agora = sp(D, "20:00");
  const MOTIVO = "Conferi a gravação do suporte: a consulta aconteceu.";

  /* ---------- desfechoDaConsulta (puro) ---------- */
  const t0 = sp(D, "09:00");
  verifica(desfechoDaConsulta({ status: "confirmada", dataInicio: t0, eventos: [] }) === "sem_desfecho", "confirmada sem evento = sem desfecho");
  verifica(desfechoDaConsulta({ status: "concluida", dataInicio: t0 }) === "realizada", "concluida = realizada");
  verifica(desfechoDaConsulta({ status: "confirmada", dataInicio: t0, eventos: [{ tipo: "falta_paciente", motivo: "falta_paciente", dataAnterior: t0 }] }) === "falta_paciente", "evento falta vigente = falta do paciente");
  verifica(desfechoDaConsulta({ status: "confirmada", dataInicio: t0, eventos: [{ tipo: "falta_paciente", motivo: "falta_paciente", dataAnterior: t0, corrigidoEm: t0 }] }) === "sem_desfecho", "falta corrigida não vale");
  verifica(desfechoDaConsulta({ status: "aguardando_reagendamento", dataInicio: t0, eventos: [{ tipo: "falha_tecnica", motivo: "falta_medico", dataAnterior: t0 }] }) === "falta_medico", "falha_tecnica motivo falta_medico = falta do médico");
  verifica(desfechoDaConsulta({ status: "confirmada", dataInicio: t0, eventos: [{ tipo: "falha_tecnica", motivo: "falha_tecnica", dataAnterior: sp("2030-05-01", "09:00") }] }) === "sem_desfecho", "falha de outra data (remarcada) não é desfecho da data atual");
  verifica(desfechoDaConsulta({ status: "cancelada", dataInicio: t0, eventos: [] }) === "encerrada", "cancelada sem falta/falha = encerrada");

  /* ---------- aplicarFalhaTecnica {motivo, por, atorId} ---------- */
  const { c: a1 } = await consulta(sp(D, "08:00"));
  const r1 = await db.$transaction((tx) => aplicarFalhaTecnica(tx, a1.id));
  verifica(r1?.status === "aguardando_reagendamento" && r1.evento.por === "sistema" && r1.evento.atorId === null && r1.evento.motivo === "falha_tecnica",
    "padrão: por sistema, atorId nulo", r1?.evento);
  verifica((await db.$transaction((tx) => aplicarFalhaTecnica(tx, a1.id))) === null, "idempotente: segunda chamada não grava");
  const { c: a2 } = await consulta(sp(D, "08:10"));
  const r2 = await db.$transaction((tx) => aplicarFalhaTecnica(tx, a2.id, { motivo: "falha_tecnica", por: "medico", atorId: med.id }));
  verifica(r2?.evento.por === "medico" && r2.evento.atorId === med.id, "formato da rota do Médicos: {motivo, por: \"medico\", atorId}", r2?.evento);
  const { c: a3 } = await consulta(sp(D, "08:20"), {}, false);
  const r3 = await db.$transaction((tx) => aplicarFalhaTecnica(tx, a3.id, { motivo: "falta_medico", por: "sistema", atorId: med.id }));
  verifica(r3?.status === "cancelada" && r3.evento.atorId === null && r3.evento.motivo === "falta_medico", "não paga → cancelada; sistema ignora atorId", r3);

  /* ---------- Correção: sem desfecho → realizada ---------- */
  const { c: k1 } = await consulta(sp(D, "09:00"));
  verifica((await previaDoDia(med.id, sp(D, "23:30"))).itens.every((i) => i.consultaId !== k1.id), "sem desfecho: fora da prévia do repasse");
  const curto = await corrigirDesfecho({ consultaId: k1.id, novo: "realizada", motivo: "curto", admin, agora });
  verifica(!curto.ok && curto.status === 400, "motivo com menos de 10 caracteres: 400", curto);
  const prev1 = await previaCorrecaoDesfecho(k1.id, agora);
  const opR = prev1?.opcoes.find((o) => o.novo === "realizada");
  verifica(prev1?.atual === "sem_desfecho" && opR?.ok && opR.plano.dinheiro.efeito === "entra_no_proximo_repasse" && opR.plano.dinheiro.liquidoMedicoCentavos === 18000,
    "prévia: sem desfecho → realizada entra no próximo fechamento (R$ 180)", opR);
  const c1 = await corrigirDesfecho({ consultaId: k1.id, novo: "realizada", motivo: MOTIVO, admin, esperado: "sem_desfecho", agora });
  verifica(c1.ok && !c1.jaAplicado && c1.status === "concluida", "grava: status concluída", c1);
  const notif1 = await db.notificacao.findMany({ where: { createdAt: { gte: new Date(Date.now() - 60_000) } }, orderBy: { createdAt: "asc" } });
  verifica(notif1.some((n) => n.usuarioId === pac.id && n.tipo === "agenda" && n.titulo === "Registro da consulta corrigido" && n.texto.includes("Sem desfecho → Realizada")),
    "notifica o paciente", notif1.map((n) => n.texto));
  verifica(notif1.some((n) => n.usuarioId === med.id && n.titulo === "Desfecho corrigido pela administração" && n.texto.includes("entra no próximo repasse")),
    "notifica o médico (passa a receber)");
  const aud1 = await db.auditLog.findFirst({ where: { entidadeId: k1.id, acao: "CONSULTA_DESFECHO_CORRIGIDO" } });
  const det1 = JSON.parse(aud1?.detalhes ?? "{}");
  verifica(aud1?.usuarioId === adm.id && aud1.role === "ADMIN" && det1.antes?.desfecho === "sem_desfecho" && det1.depois?.desfecho === "realizada" && det1.antes?.status === "confirmada" && det1.depois?.status === "concluida" && det1.motivo === MOTIVO,
    "auditoria com antes/depois e motivo", det1);
  const rep1 = await corrigirDesfecho({ consultaId: k1.id, novo: "realizada", motivo: MOTIVO, admin, esperado: "sem_desfecho", agora });
  verifica(rep1.ok && rep1.jaAplicado, "repetir o mesmo pedido (clique duplo): jaAplicado, sem gravar", rep1);
  verifica((await db.auditLog.count({ where: { entidadeId: k1.id } })) === 1, "clique duplo não duplica auditoria");
  verifica((await previaDoDia(med.id, sp(D, "23:30"))).itens.some((i) => i.consultaId === k1.id), "agora entra na prévia do repasse");

  /* ---------- falta do paciente (sistema) com pedido em análise → realizada ---------- */
  const { c: k2, p: p2 } = await consulta(sp(D, "10:00"));
  await db.eventoConsulta.create({ data: { consultaId: k2.id, tipo: "falta_paciente", por: "sistema", dataAnterior: k2.dataInicio, motivo: "falta_paciente", multaCentavos: 0, em: sp(D, "12:00") } });
  const pedido = await pedirReembolsoManual({ consultaId: k2.id, pacienteId: pac.id, justificativa: "Fiquei sem internet na hora.", agora });
  verifica(pedido.ok, "paciente pede reembolso da falta (em análise)", pedido);
  const c2 = await corrigirDesfecho({ consultaId: k2.id, novo: "realizada", motivo: MOTIVO, admin, esperado: "falta_paciente", agora });
  const ev2 = await eventos(k2.id);
  const rb2 = await db.reembolso.findFirst({ where: { pagamentoId: p2!.id } });
  verifica(c2.ok && ev2[0].corrigidoEm && ev2[0].corrigidoPorId === adm.id && ev2[0].motivoCorrecao === MOTIVO, "evento antigo marcado como corrigido (quando, quem, por quê)", ev2[0]);
  verifica(rb2?.status === "negado" && rb2.respostaAdmin?.includes("corrigiu o registro") && rb2.decididoPor === adm.id, "pedido em análise encerrado (negado com explicação)", rb2);
  verifica(c2.ok && c2.plano?.notificarMedico === false, "falta → realizada: o médico já recebia, não é notificado");
  verifica((await db.consulta.findUnique({ where: { id: k2.id } }))?.status === "concluida", "status concluída");

  /* ---------- realizada já repassada → falha técnica: repasse não reabre ---------- */
  const { c: k3, p: p3 } = await consulta(sp(D, "11:00"), { status: "concluida" });
  const f2 = await fecharRepasseDoMedico(med.id, D, sp(D, "23:30"));
  verifica(f2.situacao === "fechado", "fecha o dia 2 (com a consulta das 11:00)", f2);
  const agora3 = sp("2030-05-03", "09:00");
  const prev3 = await previaCorrecaoDesfecho(k3.id, agora3);
  const op3 = prev3?.opcoes.find((o) => o.novo === "falha_tecnica");
  verifica(op3?.ok && op3.plano.dinheiro.efeito === "desconto_se_reembolso" && op3.plano.dinheiro.repasse?.competencia === D, "prévia: repasse fechado não reabre; desconto se houver reembolso", op3);
  const c3 = await corrigirDesfecho({ consultaId: k3.id, novo: "falha_tecnica", motivo: "O médico caiu e não voltou; confirmado.", admin, esperado: "realizada", agora: agora3 });
  const ev3 = await eventos(k3.id);
  verifica(c3.ok && c3.status === "aguardando_reagendamento" && ev3.length === 1 && ev3[0].por === "admin" && ev3[0].atorId === adm.id && ev3[0].tipo === "falha_tecnica",
    "grava falha técnica por admin; status aguardando reagendamento", { c3, ev3 });
  const repFechado = await db.repasse.findUnique({ where: { medicoId_competencia: { medicoId: med.id, competencia: D } }, include: { itens: true } });
  verifica(repFechado?.status === "fechado" && repFechado.itens.some((i) => i.consultaId === k3.id), "o repasse do dia 2 continua igual (não reabre)");
  // paciente escolhe o reembolso integral (automático) → vira desconto no próximo repasse
  await db.reembolso.create({ data: { pagamentoId: p3!.id, valorCentavos: 20000, multaCentavos: 0, motivo: "falha_tecnica", status: "aprovado", solicitadoPor: pac.id, criadoEm: sp("2030-05-03", "10:00") } });
  await consulta(sp("2030-05-03", "11:00"), { status: "concluida" });
  await fecharRepasseDoMedico(med.id, "2030-05-03", sp("2030-05-03", "23:30"));
  const aj3 = await db.repasseAjuste.findFirst({ where: { consultaId: k3.id, motivo: "reembolso" } });
  verifica(aj3?.valorCentavos === 18000, "reembolso depois da correção vira desconto de R$ 180 (mecanismo existente)", aj3);

  /* ---------- reembolso já aprovado → recusa clara ---------- */
  const r3b = await corrigirDesfecho({ consultaId: k3.id, novo: "realizada", motivo: MOTIVO, admin, agora: agora3 });
  verifica(!r3b.ok && r3b.status === 409 && r3b.erro.includes("reembolso aprovado"), "com reembolso aprovado: 409 com explicação", r3b);

  /* ---------- falha (aguardando) → falta do paciente ---------- */
  const { c: k4 } = await consulta(sp(D, "13:00"));
  await db.$transaction((tx) => aplicarFalhaTecnica(tx, k4.id, { por: "medico", atorId: med.id }));
  const c4 = await corrigirDesfecho({ consultaId: k4.id, novo: "falta_paciente", motivo: "Paciente não entrou; queda foi só do lado dele.", admin, esperado: "falha_tecnica", agora });
  const ev4 = await eventos(k4.id);
  const k4d = await db.consulta.findUnique({ where: { id: k4.id } });
  verifica(c4.ok && k4d?.status === "confirmada" && ev4.length === 2 && ev4[0].corrigidoEm && ev4[1].tipo === "falta_paciente" && ev4[1].por === "admin",
    "falha → falta: status confirmada, falha corrigida, falta por admin", { st: k4d?.status, ev4 });
  verifica(c4.ok && c4.plano?.notificarMedico === true && c4.plano.dinheiro.efeito === "entra_no_proximo_repasse", "médico passa a receber e é notificado");
  const pedido4 = await pedirReembolsoManual({ consultaId: k4.id, pacienteId: pac.id, justificativa: "Tive um imprevisto sério.", agora });
  verifica(pedido4.ok, "com a falta vigente, o paciente pode pedir reembolso no prazo", pedido4);
  const pedidoK2 = await pedirReembolsoManual({ consultaId: k1.id, pacienteId: pac.id, justificativa: "Tive um imprevisto sério.", agora });
  verifica(!pedidoK2.ok && pedidoK2.status === 409, "sem falta vigente: pedido de reembolso recusado");

  /* ---------- falha → falta do médico (mesmo status, motivo novo) ---------- */
  const { c: k5 } = await consulta(sp(D, "14:00"));
  await db.$transaction((tx) => aplicarFalhaTecnica(tx, k5.id));
  const c5 = await corrigirDesfecho({ consultaId: k5.id, novo: "falta_medico", motivo: "O médico não entrou; não foi falha.", admin, agora });
  const ev5 = await eventos(k5.id);
  verifica(c5.ok && c5.status === "aguardando_reagendamento" && ev5[1]?.motivo === "falta_medico" && ev5[1].por === "admin" && !!ev5[0].corrigidoEm,
    "falha → falta do médico: aguardando reagendamento, motivo falta_medico por admin", ev5);

  /* ---------- não paga: falha (cancelada) → realizada ---------- */
  const { c: k6 } = await consulta(sp(D, "15:00"), {}, false);
  await db.$transaction((tx) => aplicarFalhaTecnica(tx, k6.id));
  const c6 = await corrigirDesfecho({ consultaId: k6.id, novo: "realizada", motivo: MOTIVO, admin, agora });
  const k6d = await db.consulta.findUnique({ where: { id: k6.id } });
  verifica(c6.ok && k6d?.status === "concluida" && k6d.motivoCancelamento === null && c6.plano?.dinheiro.efeito === "sem_pagamento" && !c6.plano.notificarMedico,
    "não paga: concluída, sem motivo de cancelamento, sem efeito no dinheiro", { k6d, c6 });

  /* ---------- algo depois do desfecho (paciente cancelou) → recusa ---------- */
  const { c: k7 } = await consulta(sp(D, "16:00"));
  await db.$transaction((tx) => aplicarFalhaTecnica(tx, k7.id));
  await db.eventoConsulta.create({ data: { consultaId: k7.id, tipo: "cancelada", por: "paciente", atorId: pac.id, dataAnterior: k7.dataInicio, motivo: "pedido_paciente", multaCentavos: 0, em: new Date(Date.now() + 1000) } });
  await db.consulta.update({ where: { id: k7.id }, data: { status: "cancelada" } });
  const c7 = await corrigirDesfecho({ consultaId: k7.id, novo: "realizada", motivo: MOTIVO, admin, agora });
  verifica(!c7.ok && c7.status === 409 && c7.erro.includes("cancelada pelo paciente"), "cancelada pelo paciente depois da falha: 409 com explicação", c7);

  /* ---------- esperado diferente / futura / encerrada ---------- */
  const { c: k8 } = await consulta(sp(D, "17:00"));
  const c8 = await corrigirDesfecho({ consultaId: k8.id, novo: "falha_tecnica", motivo: MOTIVO, admin, esperado: "falta_paciente", agora });
  verifica(!c8.ok && c8.status === 409 && c8.erro.includes("mudou"), "esperado diferente do atual: 409", c8);
  const { c: k9 } = await consulta(sp("2030-05-09", "10:00"));
  const c9 = await corrigirDesfecho({ consultaId: k9.id, novo: "falta_paciente", motivo: MOTIVO, admin, agora });
  verifica(!c9.ok && c9.erro.includes("ainda não começou"), "consulta futura: recusa", c9);
  const { c: k10 } = await consulta(sp(D, "18:00"), { status: "cancelada" });
  const e10 = (await carregarEstadoCorrecao(db, k10.id))!;
  const p10 = planejarCorrecaoDesfecho(e10, "realizada", agora);
  verifica(!p10.ok && p10.status === 409, "cancelada por outro motivo: não há desfecho para corrigir", p10);

  /* ---------- concorrência: duas correções diferentes ao mesmo tempo ---------- */
  const { c: k11 } = await consulta(sp(D, "19:00"));
  const [x, y] = await Promise.all([
    corrigirDesfecho({ consultaId: k11.id, novo: "realizada", motivo: MOTIVO, admin, esperado: "sem_desfecho", agora }),
    corrigirDesfecho({ consultaId: k11.id, novo: "falha_tecnica", motivo: MOTIVO, admin, esperado: "sem_desfecho", agora }),
  ]);
  const okCount = [x, y].filter((r) => r.ok && !r.jaAplicado).length;
  verifica(okCount === 1 && [x, y].some((r) => !r.ok && r.status === 409), "simultâneas: uma grava, a outra recebe 409", [x, y]);
  verifica((await db.auditLog.count({ where: { entidadeId: k11.id } })) === 1, "simultâneas: uma auditoria só");

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

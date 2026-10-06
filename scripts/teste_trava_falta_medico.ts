/**
 * Teste da migração 20261006_trava_motivo_falta_medico contra um Postgres
 * LOCAL descartável (nunca o banco de produção), com 20261001_financeiro e
 * 20261001b_reembolso_manual já aplicadas.
 *   DATABASE_URL=postgresql://<usuario>@localhost:<porta>/<banco> \
 *   bun --conditions react-server scripts/teste_trava_falta_medico.ts
 *
 * 1. Com a trava ANTIGA (a de 20261001b): a falta do médico pela presença
 *    falha e nada muda (reproduz o defeito de produção).
 * 2. Aplica as instruções do arquivo da migração.
 * 3. INSERT com motivo 'falta_medico' passa; motivo inválido continua recusado.
 * 4. Fluxo de ponta a ponta de presenca-consulta: o paciente entrou, o médico
 *    não, consulta paga → aguardando_reagendamento, evento falha_tecnica /
 *    falta_medico, aviso ao paciente e auditoria.
 */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { CARENCIA_APOS_INICIO_MIN, verificarPresencaConsulta } from "@/lib/server/presenca-consulta";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Só roda contra um Postgres local.");

let okN = 0;
let falhaN = 0;
function verifica(cond: unknown, nome: string, extra?: unknown) {
  if (cond) { okN++; console.log("ok    " + nome); } else { falhaN++; console.log("FALHA " + nome, extra ?? ""); }
}

const TRAVA_ANTIGA = `ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_motivo_check"
  CHECK ("motivo" IN ('pedido_paciente', 'agenda_cancelada', 'falha_tecnica', 'admin', 'reagendamento', 'falta_paciente'))`;

async function limpar() {
  await db.auditLog.deleteMany();
  await db.notificacao.deleteMany();
  await db.presencaSala.deleteMany();
  await db.sinalSala.deleteMany();
  await db.reembolso.deleteMany();
  await db.remarcacaoPendente.deleteMany();
  await db.eventoConsulta.deleteMany();
  await db.pagamento.deleteMany();
  await db.consulta.deleteMany();
  await db.user.deleteMany();
}

/** Consulta paga que começou há (carência + 10 min), com o paciente na sala depois do horário. */
async function cenarioFaltaMedico(sufixo: string) {
  const medico = await db.user.create({ data: { nome: "Dr. Teste", email: `med-${sufixo}@local.test`, senhaHash: "x", role: "MEDICO" } });
  const paciente = await db.user.create({ data: { nome: "Paciente Teste", email: `pac-${sufixo}@local.test`, senhaHash: "x" } });
  const inicio = new Date(Date.now() - (CARENCIA_APOS_INICIO_MIN + 10) * 60_000);
  const c = await db.consulta.create({
    data: { medicoId: medico.id, pacienteId: paciente.id, dataInicio: inicio, especialidade: "Clínica", valor: 200, pago: true, status: "confirmada" },
  });
  await db.pagamento.create({ data: { consultaId: c.id, valor: 200, status: "confirmado", via: "simulado", confirmadoEm: inicio } });
  await db.presencaSala.create({
    data: { consultaId: c.id, usuarioId: paciente.id, papel: "PACIENTE", ultimoPing: new Date(inicio.getTime() + 20 * 60_000) },
  });
  return { c, medico, paciente };
}

async function main() {
  await limpar();

  // ---- 1. Trava antiga: reproduz o defeito -----------------------------
  await db.$executeRawUnsafe(`ALTER TABLE public."EventoConsulta" DROP CONSTRAINT IF EXISTS "EventoConsulta_motivo_check"`);
  await db.$executeRawUnsafe(TRAVA_ANTIGA);
  {
    const { c } = await cenarioFaltaMedico("antes");
    let erro = "";
    try { await verificarPresencaConsulta(c.id); } catch (e) { erro = (e as Error).message; }
    verifica(/EventoConsulta_motivo_check/.test(erro), "trava antiga: a falta do médico é recusada pelo banco", erro.slice(0, 200));
    const depois = await db.consulta.findUnique({ where: { id: c.id }, select: { status: true } });
    verifica(depois?.status === "confirmada", "trava antiga: a transação é desfeita e a consulta não muda", depois);
    verifica((await db.eventoConsulta.count({ where: { consultaId: c.id } })) === 0, "trava antiga: nenhum evento gravado");
  }
  await limpar();

  // ---- 2. Aplica a migração (as instruções do próprio arquivo) ---------
  const sql = readFileSync("supabase/migrations/20261006_trava_motivo_falta_medico.sql", "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const instrucoes = sql.split(";").map((s) => s.trim()).filter((s) => s && !/^(BEGIN|COMMIT)$/i.test(s));
  verifica(instrucoes.length === 2, "migração: DROP + ADD da trava", instrucoes.length);
  await db.$transaction(async (tx) => { for (const i of instrucoes) await tx.$executeRawUnsafe(i); });
  const [def] = await db.$queryRawUnsafe<{ def: string }[]>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'EventoConsulta_motivo_check'`,
  );
  for (const v of ["pedido_paciente", "agenda_cancelada", "falha_tecnica", "admin", "reagendamento", "falta_paciente", "falta_medico"]) {
    verifica(def.def.includes(`'${v}'`), `trava nova lista '${v}'`);
  }

  // ---- 3. INSERT direto -------------------------------------------------
  {
    const { c } = await cenarioFaltaMedico("insert");
    const base = { consultaId: c.id, tipo: "falha_tecnica", por: "sistema", dataAnterior: c.dataInicio, multaCentavos: 0 };
    let erro = "";
    try { await db.eventoConsulta.create({ data: { ...base, motivo: "falta_medico" } }); } catch (e) { erro = (e as Error).message; }
    verifica(erro === "", "INSERT com motivo 'falta_medico' passa", erro.slice(0, 200));
    erro = "";
    try { await db.eventoConsulta.create({ data: { ...base, motivo: "inventado" } }); } catch (e) { erro = (e as Error).message; }
    verifica(/EventoConsulta_motivo_check/.test(erro), "INSERT com motivo inválido continua recusado", erro.slice(0, 200));
    erro = "";
    try { await db.eventoConsulta.create({ data: { ...base, tipo: "falta_medico", motivo: "falta_medico" } }); } catch (e) { erro = (e as Error).message; }
    verifica(/EventoConsulta_tipo_check/.test(erro), "o tipo 'falta_medico' continua recusado (tipo segue falha_tecnica)", erro.slice(0, 200));
  }
  await limpar();

  // ---- 4. Fluxo de ponta a ponta ---------------------------------------
  {
    const { c, paciente } = await cenarioFaltaMedico("fluxo");
    const r = await verificarPresencaConsulta(c.id);
    verifica(r === "falta_medico", "presença: classifica e grava falta do médico", r);
    const depois = await db.consulta.findUnique({ where: { id: c.id }, select: { status: true } });
    verifica(depois?.status === "aguardando_reagendamento", "consulta paga vai para aguardando_reagendamento", depois);
    const evs = await db.eventoConsulta.findMany({ where: { consultaId: c.id } });
    verifica(evs.length === 1 && evs[0].tipo === "falha_tecnica" && evs[0].motivo === "falta_medico" && evs[0].por === "sistema",
      "um evento falha_tecnica / falta_medico / sistema", evs);
    const avisos = await db.notificacao.findMany({ where: { usuarioId: paciente.id } });
    verifica(avisos.length === 1 && avisos[0].titulo === "O médico não compareceu" && /remarcar sem custo ou reembolso integral/.test(avisos[0].texto),
      "o paciente recebe o aviso para remarcar ou pedir reembolso", avisos);
    const audit = await db.auditLog.findMany({ where: { entidadeId: c.id } });
    verifica(audit.length === 1 && audit[0].acao === "CONSULTA_FALTA_MEDICO", "auditoria CONSULTA_FALTA_MEDICO", audit);
    const de_novo = await verificarPresencaConsulta(c.id);
    verifica(de_novo === null && (await db.eventoConsulta.count({ where: { consultaId: c.id } })) === 1, "rodar de novo não grava outro evento");
  }
  await limpar();

  console.log(`\n${okN} ok, ${falhaN} falha(s)`);
  await db.$disconnect();
  if (falhaN) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });

/**
 * Integração: reembolso automático por prazo vencido (regras 4 e 5 de 21/11)
 * e reembolso manual aprovado na hora. Só Postgres LOCAL; pula sem
 * FIN_TESTE_DB.
 * Rodar: FIN_TESTE_DB=postgresql://postgres@localhost:55441/pr51_teste \
 *   DATABASE_URL=$FIN_TESTE_DB npx tsx --conditions=react-server src/lib/server/vencer-escolha-correcao.teste.ts
 */
export {};
async function main() {
if (!process.env.FIN_TESTE_DB) {
  console.log("reembolso-automatico (integração): pulado (sem FIN_TESTE_DB)");
  return;
}
if (/supabase\.(co|com)/.test(process.env.DATABASE_URL ?? "")) throw new Error("Só banco local.");

const { db } = await import("@/lib/db");
const f = await import("./financeiro");

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else { falhas++; console.error(`FALHOU ${nome}\n  obtido:   ${a}\n  esperado: ${b}`); }
}
const sufixo = Date.now().toString(36);
const usuario = (role: string) =>
  db.user.create({ data: { nome: `${role} ${sufixo}`, email: `${role}-${Math.random()}@t.local`, senhaHash: "x", role } });
const DATA = new Date("2026-11-19T14:00:00-03:00");
const VENCIMENTO = new Date("2026-11-26T14:00:00-03:00");

async function cenario(o: { status?: string; motivo?: string; pago?: boolean } = {}) {
  const pac = await usuario("PACIENTE");
  const med = await usuario("MEDICO");
  const c = await db.consulta.create({
    data: {
      pacienteId: pac.id, medicoId: med.id, especialidade: "Clínica", dataInicio: DATA,
      status: o.status ?? "aguardando_reagendamento", valor: 150, pago: o.pago ?? true,
      reembolsoAutomaticoEm: VENCIMENTO,
    },
  });
  if (o.pago !== false) {
    await db.pagamento.create({ data: { consultaId: c.id, valor: 150, status: "confirmado", via: "simulado", confirmadoEm: DATA } });
  }
  await db.eventoConsulta.create({
    data: { consultaId: c.id, tipo: "falha_tecnica", por: "admin", em: DATA, dataAnterior: DATA, motivo: o.motivo ?? "falha_tecnica", multaCentavos: 0 },
  });
  return c;
}
const estado = async (id: string) => {
  const c = await db.consulta.findUnique({ where: { id }, select: { status: true, pagamento: { select: { reembolsos: { select: { status: true, valorCentavos: true, multaCentavos: true, motivo: true } } } } } });
  return { status: c?.status, reembolsos: c?.pagamento?.reembolsos ?? [] };
};

// Puro: 7 dias corridos (não úteis).
igual("prazo = 7 dias corridos", f.prazoReembolsoAutomatico(new Date("2026-11-20T15:00:00-03:00")).toISOString(), "2026-11-27T18:00:00.000Z");
igual("texto sem PIX", /PIX/.test(f.textoReembolsoAutomatico("Clínica", "19/11", true).texto), false);

{
  const c = await cenario();
  await f.vencerReembolsosAutomaticos(new Date("2026-11-26T13:59:00-03:00"));
  igual("dentro do prazo: nada muda", await estado(c.id), { status: "aguardando_reagendamento", reembolsos: [] });
  const r = await f.vencerReembolsosAutomaticos(new Date("2026-11-26T14:01:00-03:00"));
  igual("venceu: contou", r.vencidas >= 1 && r.reembolsadas >= 1, true);
  igual("venceu: cancelada e reembolso integral aprovado", await estado(c.id), {
    status: "cancelada",
    reembolsos: [{ status: "aprovado", valorCentavos: 15000, multaCentavos: 0, motivo: "falha_tecnica" }],
  });
  await f.vencerReembolsosAutomaticos(new Date("2026-11-27T10:00:00-03:00"));
  igual("idempotente: um reembolso só", (await estado(c.id)).reembolsos.length, 1);
  igual("paciente avisado", await db.notificacao.count({ where: { usuarioId: c.pacienteId, titulo: "Reembolso automático" } }), 1);
  igual("evento cancelada pelo sistema", await db.eventoConsulta.count({ where: { consultaId: c.id, tipo: "cancelada", por: "sistema" } }), 1);
}
{
  const c = await cenario({ motivo: "falta_medico" });
  await f.vencerReembolsosAutomaticos(new Date("2026-11-27T10:00:00-03:00"));
  igual("falta do médico: motivo no reembolso", (await estado(c.id)).reembolsos.map((r) => r.motivo), ["falta_medico"]);
}
{
  const c = await cenario({ status: "confirmada" });
  await f.vencerReembolsosAutomaticos(new Date("2026-11-27T10:00:00-03:00"));
  igual("já remarcou (status fora da varredura): nada", await estado(c.id), { status: "confirmada", reembolsos: [] });
}
// Reembolso manual (legado): aprovado na hora, integral.
{
  const pac = await usuario("PACIENTE");
  const med = await usuario("MEDICO");
  const agora = new Date("2026-11-20T15:00:00-03:00");
  const c = await db.consulta.create({ data: { pacienteId: pac.id, medicoId: med.id, especialidade: "Clínica", dataInicio: DATA, status: "confirmada", valor: 150, pago: true } });
  await db.pagamento.create({ data: { consultaId: c.id, valor: 150, status: "confirmado", via: "simulado", confirmadoEm: DATA } });
  await db.eventoConsulta.create({ data: { consultaId: c.id, tipo: "falta_paciente", por: "medico", dataAnterior: DATA, motivo: "falta_paciente", multaCentavos: 0 } });
  const r = await f.pedirReembolsoManual({ consultaId: c.id, pacienteId: pac.id, justificativa: "Tive um imprevisto no trabalho", agora });
  igual("manual: aprovado na hora, integral", r.ok ? [r.reembolso.status, r.reembolso.valorCentavos, !!r.reembolso.decididoEm] : r, ["aprovado", 15000, true]);
  const r2 = await f.pedirReembolsoManual({ consultaId: c.id, pacienteId: pac.id, justificativa: "Tive um imprevisto no trabalho", agora });
  igual("manual: segundo pedido barrado", r2.ok ? "ok" : r2.status, 409);
}
// Seção 3.1: prazo de reembolso automático aberto → pedido manual é 409 com
// motivo próprio, mesmo com desfecho de falha técnica (checagem antes do desfecho).
{
  const c = await cenario();
  const r = await f.pedirReembolsoManual({ consultaId: c.id, pacienteId: c.pacienteId, justificativa: "Tive um imprevisto no trabalho" });
  igual("automático aberto: 409 com motivo", r.ok ? "ok" : [r.status, r.motivo], [409, "reembolso_automatico"]);
  igual("automático aberto: previstoPara", r.ok ? null : r.automatico?.previstoPara, VENCIMENTO.toISOString());
}

await db.$disconnect();
console.log(`reembolso-automatico: ${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

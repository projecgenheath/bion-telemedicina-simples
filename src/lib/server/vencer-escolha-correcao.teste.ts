/**
 * Integração: reembolso automático quando o prazo de escolha (7 dias úteis
 * depois da correção) vence, e reembolso manual aprovado na hora. Só Postgres
 * LOCAL; pula sem FIN_TESTE_DB.
 * Rodar: FIN_TESTE_DB=postgresql://postgres@localhost:55441/pr51_teste \
 *   DATABASE_URL=$FIN_TESTE_DB npx tsx --conditions=react-server src/lib/server/vencer-escolha-correcao.teste.ts
 */
export {};
async function main() {
if (!process.env.FIN_TESTE_DB) {
  console.log("vencer-escolha-correcao (integração): pulado (sem FIN_TESTE_DB)");
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

// Correção feita na terça 20/10/2026 às 15:00 (SP). Prazo: fim de qui 29/10 (SP).
const CORRIGIDO = new Date("2026-10-20T15:00:00-03:00");
const DATA = new Date("2026-10-19T14:00:00-03:00");
async function cenario(o: { status?: string; corrigidoEm?: Date | null; por?: string; motivo?: string } = {}) {
  const pac = await usuario("PACIENTE");
  const med = await usuario("MEDICO");
  const c = await db.consulta.create({
    data: { pacienteId: pac.id, medicoId: med.id, especialidade: "Clínica", dataInicio: DATA, status: o.status ?? "aguardando_reagendamento", valor: 150, pago: true },
  });
  await db.pagamento.create({ data: { consultaId: c.id, valor: 150, status: "confirmado", via: "simulado", confirmadoEm: DATA } });
  await db.eventoConsulta.create({
    data: { consultaId: c.id, tipo: "falha_tecnica", por: o.por ?? "admin", em: CORRIGIDO, dataAnterior: DATA, motivo: o.motivo ?? "falha_tecnica", multaCentavos: 0, corrigidoEm: o.corrigidoEm ?? null },
  });
  return c;
}
const estado = async (id: string) => {
  const c = await db.consulta.findUnique({ where: { id }, select: { status: true, pagamento: { select: { reembolsos: { select: { status: true, valorCentavos: true, multaCentavos: true, motivo: true } } } } } });
  return { status: c?.status, reembolsos: c?.pagamento?.reembolsos ?? [] };
};

// Puro: prazo e vencimento.
igual("prazo = fim de qui 29/10 (SP)", f.prazoEscolhaCorrecao(CORRIGIDO).toISOString(), "2026-10-30T02:59:59.999Z");
igual("29/10 23:59 não venceu", f.escolhaCorrecaoVencida(CORRIGIDO, new Date("2026-10-29T23:59:00-03:00")), false);
igual("30/10 00:00 venceu", f.escolhaCorrecaoVencida(CORRIGIDO, new Date("2026-10-30T00:00:00-03:00")), true);

{
  const c = await cenario();
  await f.vencerEscolhasCorrecao(new Date("2026-10-29T23:59:00-03:00"));
  igual("dentro do prazo: nada muda", await estado(c.id), { status: "aguardando_reagendamento", reembolsos: [] });
  const r = await f.vencerEscolhasCorrecao(new Date("2026-10-30T00:01:00-03:00"));
  igual("venceu: contou", r.vencidas >= 1 && r.reembolsadas >= 1, true);
  igual("venceu: cancelada e reembolso integral aprovado", await estado(c.id), {
    status: "cancelada",
    reembolsos: [{ status: "aprovado", valorCentavos: 15000, multaCentavos: 0, motivo: "falha_tecnica" }],
  });
  await f.vencerEscolhasCorrecao(new Date("2026-10-31T10:00:00-03:00"));
  igual("idempotente: um reembolso só", (await estado(c.id)).reembolsos.length, 1);
  igual("paciente avisado", await db.notificacao.count({ where: { usuarioId: c.pacienteId, titulo: "Reembolso automático" } }), 1);
  igual("evento cancelada pelo sistema", await db.eventoConsulta.count({ where: { consultaId: c.id, tipo: "cancelada", por: "sistema" } }), 1);
}
{
  const c = await cenario({ motivo: "falta_medico" });
  await f.vencerEscolhasCorrecao(new Date("2026-11-02T10:00:00-03:00"));
  igual("falta do médico: motivo no reembolso", (await estado(c.id)).reembolsos.map((r) => r.motivo), ["falta_medico"]);
}
{
  const c = await cenario({ status: "confirmada" });
  await f.vencerEscolhasCorrecao(new Date("2026-11-02T10:00:00-03:00"));
  igual("já remarcou: nada", await estado(c.id), { status: "confirmada", reembolsos: [] });
}
{
  const c = await cenario({ por: "sistema" });
  await f.vencerEscolhasCorrecao(new Date("2026-11-02T10:00:00-03:00"));
  igual("falha sem correção do admin: fora desta regra", await estado(c.id), { status: "aguardando_reagendamento", reembolsos: [] });
}
{
  const c = await cenario({ corrigidoEm: new Date("2026-10-21T10:00:00-03:00") });
  await f.vencerEscolhasCorrecao(new Date("2026-11-02T10:00:00-03:00"));
  igual("evento corrigido de novo: não vale", (await estado(c.id)).reembolsos, []);
}
// Reembolso manual (falta do paciente): aprovado na hora, integral.
{
  const pac = await usuario("PACIENTE");
  const med = await usuario("MEDICO");
  const agora = new Date("2026-10-20T15:00:00-03:00");
  const c = await db.consulta.create({ data: { pacienteId: pac.id, medicoId: med.id, especialidade: "Clínica", dataInicio: DATA, status: "confirmada", valor: 150, pago: true } });
  await db.pagamento.create({ data: { consultaId: c.id, valor: 150, status: "confirmado", via: "simulado", confirmadoEm: DATA } });
  await db.eventoConsulta.create({ data: { consultaId: c.id, tipo: "falta_paciente", por: "medico", dataAnterior: DATA, motivo: "falta_paciente", multaCentavos: 0 } });
  const r = await f.pedirReembolsoManual({ consultaId: c.id, pacienteId: pac.id, justificativa: "Tive um imprevisto no trabalho", agora });
  igual("manual: aprovado na hora, integral", r.ok ? [r.reembolso.status, r.reembolso.valorCentavos, !!r.reembolso.decididoEm] : r, ["aprovado", 15000, true]);
  const r2 = await f.pedirReembolsoManual({ consultaId: c.id, pacienteId: pac.id, justificativa: "Tive um imprevisto no trabalho", agora });
  igual("manual: segundo pedido barrado", r2.ok ? "ok" : r2.status, 409);
}

await db.$disconnect();
console.log(`vencer-escolha-correcao: ${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

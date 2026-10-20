/**
 * Teste de integração da espera do médico contra um Postgres LOCAL
 * (nunca produção). Pula sem ESPERA_TESTE_DB.
 * Rodar: ESPERA_TESTE_DB=postgresql://postgres@localhost:55490/postgres \
 *   DATABASE_URL=$ESPERA_TESTE_DB BION_PAGAMENTO_SIMULADO= \
 *   bun --conditions=react-server src/lib/server/espera-medico.teste.ts
 */
export {};
if (!process.env.ESPERA_TESTE_DB) {
  console.log("espera-medico (integração): pulado (sem ESPERA_TESTE_DB)");
  process.exit(0);
}
if (/supabase\.(co|com)/.test(process.env.DATABASE_URL ?? "")) throw new Error("Só banco local.");

const { db } = await import("@/lib/db");
const m = await import("./espera-medico");

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else { falhas++; console.error(`FALHOU ${nome}\n  obtido:   ${a}\n  esperado: ${b}`); }
}

const sufixo = Date.now().toString(36);
async function usuario(role: string, extra: Record<string, unknown> = {}) {
  return db.user.create({ data: { nome: `${role} ${sufixo}`, email: `${role}-${Math.random()}@t.local`, senhaHash: "x", role, ...extra } });
}
async function medico(valor: number, comPix = true) {
  const u = await usuario("MEDICO", { perfilMedico: { create: { crm: "1", especialidade: "Clínica", valor } } });
  if (comPix) await db.dadosRecebimentoMedico.create({ data: { medicoId: u.id, pixTipo: "email", pixChave: "a@b.c", titularTipo: "pf", titularNome: "X", titularDocumento: "11111111111" } });
  return u;
}
// 15:00 de São Paulo (fora da janela vedada).
const AGORA = new Date("2026-10-19T18:00:00.000Z");
async function cenario(valorAntigo = 150) {
  const pac = await usuario("PACIENTE");
  const med = await medico(valorAntigo);
  const c = await db.consulta.create({ data: { pacienteId: pac.id, medicoId: med.id, especialidade: "Clínica", dataInicio: new Date(AGORA.getTime() - 15 * 60_000), status: "confirmada", valor: valorAntigo, pago: true } });
  await db.pagamento.create({ data: { consultaId: c.id, valor: valorAntigo, status: "confirmado", via: "simulado", confirmadoEm: AGORA } });
  return { pac, med, c };
}

// --- abrir: idempotente e expiraEm no servidor
{
  const { c } = await cenario();
  const entrada = new Date(AGORA.getTime() - 14 * 60_000);
  const e1 = await m.abrirEspera(c.id, entrada);
  const e2 = await m.abrirEspera(c.id, new Date());
  igual("abrir idempotente", e1?.id, e2?.id);
  igual("expiraEm = entrada + 10", e1?.expiraEm.toISOString(), new Date(entrada.getTime() + 10 * 60_000).toISOString());
  igual("fechar medico_entrou", await m.fecharEsperaMedicoEntrou(c.id, AGORA), true);
  igual("fechar de novo é no-op", await m.fecharEsperaMedicoEntrou(c.id, AGORA), false);
}

// --- cancelar: só expirada, reembolso integral, idempotente
{
  const { pac, c } = await cenario(150);
  await m.abrirEspera(c.id, new Date(AGORA.getTime() - 5 * 60_000));
  const cedo = await m.cancelarPorEspera({ consultaId: c.id, pacienteId: pac.id, agora: AGORA });
  igual("cancelar antes de expirar → 409", cedo.ok ? 200 : cedo.status, 409);
  const outro = await usuario("PACIENTE");
  const depois = new Date(AGORA.getTime() + 6 * 60_000);
  const alheio = await m.cancelarPorEspera({ consultaId: c.id, pacienteId: outro.id, agora: depois });
  igual("outro paciente → 403", alheio.ok ? 200 : alheio.status, 403);
  const r1 = await m.cancelarPorEspera({ consultaId: c.id, pacienteId: pac.id, agora: depois });
  const r2 = await m.cancelarPorEspera({ consultaId: c.id, pacienteId: pac.id, agora: depois });
  igual("cancelar ok", r1.ok && !r1.jaProcessada, true);
  igual("cancelar repetido é idempotente", r2.ok && r2.jaProcessada, true);
  const reembolsos = await db.reembolso.findMany({ where: { pagamento: { consultaId: c.id } } });
  igual("um reembolso integral", reembolsos.map((x) => [x.valorCentavos, x.multaCentavos, x.status]), [[15000, 0, "aprovado"]]);
  igual("consulta cancelada", (await db.consulta.findUnique({ where: { id: c.id } }))?.status, "cancelada");
  const rem = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: "x", diferencaEsperadaCentavos: 0, agora: depois });
  igual("remarcar depois de cancelar → 409", rem.ok ? 200 : rem.status, 409);
}

// --- remarcar: preço mudou, médico indisponível, diferença negativa e positiva
{
  const { pac, med, c } = await cenario(200);
  await m.abrirEspera(c.id, new Date(AGORA.getTime() - 15 * 60_000));
  const depois = new Date(AGORA.getTime() + 60_000);
  const barato = await medico(120.5);
  const semPix = await medico(100, false);
  const ocupado = await medico(100);
  await db.consulta.create({ data: { pacienteId: pac.id, medicoId: ocupado.id, especialidade: "Clínica", dataInicio: new Date(depois.getTime() + 20 * 60_000), status: "confirmada", valor: 100 } });

  const mudou = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: barato.id, diferencaEsperadaCentavos: -5000, agora: depois });
  igual("preco_mudou → 409 com diferença atual", mudou.ok ? null : [mudou.status, mudou.erro, mudou.extra], [409, "preco_mudou", { diferencaAtualCentavos: -7950 }]);
  igual("preco_mudou não mexe na consulta", (await db.consulta.findUnique({ where: { id: c.id } }))?.status, "confirmada");
  for (const [nome, id] of [["sem PIX", semPix.id], ["com consulta em 40 min", ocupado.id], ["o mesmo médico", med.id]] as const) {
    const r = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: id, diferencaEsperadaCentavos: -10000, agora: depois });
    igual(`médico ${nome} → 409 medico_indisponivel`, r.ok ? null : [r.status, r.erro], [409, "medico_indisponivel"]);
  }
  const r1 = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: barato.id, diferencaEsperadaCentavos: -7950, agora: depois });
  const r2 = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: barato.id, diferencaEsperadaCentavos: -7950, agora: depois });
  igual("remarcar ok", r1.ok && !r1.jaProcessada, true);
  igual("remarcar repetido idempotente (mesma consulta nova)", r2.ok && r2.jaProcessada && r2.consultaNovaId === (r1.ok ? r1.consultaNovaId : ""), true);
  const nova = await db.consulta.findUnique({ where: { id: r1.ok ? r1.consultaNovaId! : "" }, include: { pagamento: true } });
  igual("nova: médico, valor, origem, confirmada", [nova?.medicoId, nova?.valor, nova?.consultaOrigemId, nova?.status, nova?.pagamento?.status], [barato.id, 120.5, c.id, "confirmada", "confirmado"]);
  const reemb = await db.reembolso.findMany({ where: { pagamento: { consultaId: c.id } } });
  igual("devolve a diferença no pagamento antigo", reemb.map((x) => x.valorCentavos), [7950]);
  const e = await db.esperaMedico.findUnique({ where: { consultaId: c.id } });
  igual("espera remarcada com valores", [e?.status, e?.valorAntigoCentavos, e?.valorNovoCentavos, e?.diferencaCentavos], ["remarcada", 20000, 12050, -7950]);
  const audit = await db.auditLog.findFirst({ where: { entidadeId: c.id, acao: "ESPERA_MEDICO_REMARCADA" } });
  igual("auditoria só com ids", audit?.detalhes?.includes("Clínica") || audit?.detalhes?.includes("120"), false);
}
{
  const { pac, c } = await cenario(150);
  await m.abrirEspera(c.id, new Date(AGORA.getTime() - 15 * 60_000));
  const caro = await medico(200);
  const r = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: caro.id, diferencaEsperadaCentavos: 5000, agora: new Date(AGORA.getTime() + 60_000) });
  const nova = r.ok ? await db.consulta.findUnique({ where: { id: r.consultaNovaId! }, include: { pagamento: true } }) : null;
  igual("mais caro: cobra só a diferença", r.ok ? [r.cobranca?.valorCentavos, nova?.pagamento?.valor] : null, [5000, 50]);
  igual("sem reembolso no mais caro", await db.reembolso.count({ where: { pagamento: { consultaId: c.id } } }), 0);
}

// --- job: expira as aguardando vencidas
{
  const { c } = await cenario();
  await m.abrirEspera(c.id, new Date(AGORA.getTime() - 15 * 60_000));
  const r = await m.rodarEsperaMedico(AGORA);
  igual("job marca expirada", (await db.esperaMedico.findUnique({ where: { consultaId: c.id } }))?.status, "expirada");
  igual("job conta", r.expiradas >= 1, true);
  const fila = await m.listarEsperasFila(AGORA);
  igual("fila mostra a expirada", fila.some((x) => x.consultaId === c.id && x.status === "expirada"), true);
}

await db.$disconnect();
console.log(`espera-medico (integração): ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

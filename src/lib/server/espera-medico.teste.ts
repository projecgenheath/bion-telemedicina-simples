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
  igual("fechar medico_entrou", await m.fecharEsperaMedicoEntrou(c.id, AGORA), { resultado: "fechada" });
  igual("fechar de novo é no-op", await m.fecharEsperaMedicoEntrou(c.id, AGORA), { resultado: "ja_fechada" });
  igual("fechar sem espera", await m.fecharEsperaMedicoEntrou("nao-existe", AGORA), { resultado: "ja_fechada" });
}

// --- chamada dupla simultânea e uso dentro de $transaction
{
  const { c } = await cenario();
  const entrada = new Date(AGORA.getTime() - 3 * 60_000);
  const [a, b, d] = await Promise.all([m.abrirEspera(c.id, entrada), m.abrirEspera(c.id, entrada), m.abrirEspera(c.id, new Date(AGORA.getTime() - 60_000))]);
  igual("abrir simultâneo: mesma espera", new Set([a?.id, b?.id, d?.id]).size, 1);
  igual("abrir simultâneo: uma linha", await db.esperaMedico.count({ where: { consultaId: c.id } }), 1);
  const [f1, f2] = await Promise.all([m.fecharEsperaMedicoEntrou(c.id, AGORA), m.fecharEsperaMedicoEntrou(c.id, AGORA)]);
  igual("fechar simultâneo: um fechada, outro ja_fechada", [f1.resultado, f2.resultado].sort(), ["fechada", "ja_fechada"]);
}
{
  const { c } = await cenario();
  const entrada = new Date(AGORA.getTime() - 3 * 60_000);
  const r = await db.$transaction(async (tx) => {
    const e1 = await m.abrirEspera(c.id, entrada, tx);
    const e2 = await m.abrirEspera(c.id, entrada, tx); // repetir na mesma tx não aborta
    const fechou = await m.fecharEsperaMedicoEntrou(c.id, AGORA, tx);
    return { mesma: e1?.id === e2?.id, fechou: fechou.resultado === "fechada" };
  });
  igual("dentro de $transaction", r, { mesma: true, fechou: true });
  igual("tx commitou medico_entrou", (await db.esperaMedico.findUnique({ where: { consultaId: c.id } }))?.status, "medico_entrou");
  const { c: c2 } = await cenario();
  await db.$transaction(async (tx) => {
    await m.abrirEspera(c2.id, entrada, tx);
    throw new Error("rollback");
  }).catch(() => null);
  igual("rollback da tx desfaz a abertura", await db.esperaMedico.count({ where: { consultaId: c2.id } }), 0);
}
// fechar não mexe em espera com escolha do paciente
{
  const { pac, c } = await cenario();
  await m.abrirEspera(c.id, new Date(AGORA.getTime() - 15 * 60_000));
  await m.cancelarPorEspera({ consultaId: c.id, pacienteId: pac.id, agora: AGORA });
  igual("fechar depois de cancelada → espera_encerrada", await m.fecharEsperaMedicoEntrou(c.id, AGORA), { resultado: "espera_encerrada", desfecho: "cancelada" });
  igual("esperaEncerrada cancelada", await m.esperaEncerrada(c.id), "cancelada");
  igual("continua cancelada", (await db.esperaMedico.findUnique({ where: { consultaId: c.id } }))?.status, "cancelada");
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
// --- médico mais caro: remarcando até pagar (gateway por webhook, sem simulado)
process.env.BION_PAGAMENTO_WEBHOOK_SECRET = "teste-local";
const ANTES = AGORA.getTime();
async function remarcandoCaro() {
  const { pac, c } = await cenario(150);
  await m.abrirEspera(c.id, new Date(ANTES - 15 * 60_000));
  const caro = await medico(200);
  const r = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: caro.id, diferencaEsperadaCentavos: 5000, agora: new Date(ANTES + 60_000) });
  if (!r.ok || !r.cobranca) throw new Error("remarcar caro falhou");
  return { pac, c, caro, r, cobranca: r.cobranca };
}
const confirmarNoGateway = (id: string) => db.pagamento.update({ where: { id }, data: { status: "confirmado", confirmadoEm: new Date() } }).then(() => db.consulta.updateMany({ where: { pagamento: { id }, status: "em_espera" }, data: { status: "confirmada", pago: true } }));
{
  const { pac, c, caro, r, cobranca } = await remarcandoCaro();
  const e = await db.esperaMedico.findUnique({ where: { consultaId: c.id } });
  igual("caro: espera remarcando com reserva de 10 min", [e?.status, e?.reservaExpiraEm?.toISOString()], ["remarcando", new Date(ANTES + 11 * 60_000).toISOString()]);
  igual("caro: antiga continua valendo", (await db.consulta.findUnique({ where: { id: c.id } }))?.status, "confirmada");
  const nova = await db.consulta.findUnique({ where: { id: r.consultaNovaId! }, include: { pagamento: true } });
  igual("caro: nova em_espera, cobra só a diferença", [nova?.status, nova?.pagamento?.valor, cobranca.valorCentavos], ["em_espera", 50, 5000]);
  igual("caro: cancelar enquanto remarcando → 409", await m.cancelarPorEspera({ consultaId: c.id, pacienteId: pac.id, agora: new Date(ANTES + 2 * 60_000) }).then((x) => (x.ok ? null : x.erro)), "remarcando");
  igual("caro: médico entrando → espera_encerrada remarcando", await m.fecharEsperaMedicoEntrou(c.id), { resultado: "espera_encerrada", desfecho: "remarcando" });
  const rep2 = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: caro.id, diferencaEsperadaCentavos: 5000, agora: new Date(ANTES + 2 * 60_000) });
  igual("caro: repetir devolve a mesma cobrança", rep2.ok && rep2.jaProcessada && rep2.cobranca?.pagamentoId === cobranca.pagamentoId, true);
  await confirmarNoGateway(cobranca.pagamentoId);
  igual("caro: webhook troca", await m.confirmarRemarcacaoEspera(cobranca.pagamentoId), "remarcada");
  igual("caro: webhook repetido idempotente", await m.confirmarRemarcacaoEspera(cobranca.pagamentoId), "ja_remarcada");
  igual("caro: antiga cancelada depois do pagamento", (await db.consulta.findUnique({ where: { id: c.id } }))?.status, "cancelada");
  igual("caro: espera remarcada", (await db.esperaMedico.findUnique({ where: { consultaId: c.id } }))?.status, "remarcada");
  igual("caro: sem reembolso", await db.reembolso.count({ where: { pagamento: { consultaId: { in: [c.id, r.consultaNovaId!] } } } }), 0);
}
{
  // Reserva vence sem pagar: cron cancela cobrança e nova; espera volta; paciente cancela com reembolso integral.
  const { pac, c, r, cobranca } = await remarcandoCaro();
  const job = await m.rodarEsperaMedico(new Date(ANTES + 12 * 60_000));
  igual("vence: cron expira a reserva", job.reservasExpiradas >= 1, true);
  const nova = await db.consulta.findUnique({ where: { id: r.consultaNovaId! }, include: { pagamento: true } });
  igual("vence: nova cancelada, cobrança falhou", [nova?.status, nova?.pagamento?.status], ["cancelada", "falhou"]);
  const e = await db.esperaMedico.findUnique({ where: { consultaId: c.id } });
  igual("vence: espera volta para expirada", [e?.status, e?.consultaNovaId, e?.reservaExpiraEm], ["expirada", null, null]);
  const canc = await m.cancelarPorEspera({ consultaId: c.id, pacienteId: pac.id, agora: new Date(ANTES + 13 * 60_000) });
  igual("vence: pode cancelar com reembolso integral", canc.ok, true);
  igual("vence: reembolso integral da antiga", (await db.reembolso.findMany({ where: { pagamento: { consultaId: c.id } } })).map((x) => x.valorCentavos), [15000]);
  // PIX atrasado: chega depois de a reserva vencer → reembolsa esse pagamento.
  await confirmarNoGateway(cobranca.pagamentoId);
  igual("atrasado: reembolsa", await m.confirmarRemarcacaoEspera(cobranca.pagamentoId), "reembolsada");
  igual("atrasado: reembolso da diferença", (await db.reembolso.findMany({ where: { pagamentoId: cobranca.pagamentoId } })).map((x) => x.valorCentavos), [5000]);
  igual("atrasado: nova segue cancelada", (await db.consulta.findUnique({ where: { id: r.consultaNovaId! } }))?.status, "cancelada");
  igual("atrasado: repetir não duplica", (await m.confirmarRemarcacaoEspera(cobranca.pagamentoId), await db.reembolso.count({ where: { pagamentoId: cobranca.pagamentoId } })), 1);
}
{
  // Desistir: cobrança e nova canceladas, médico liberado, pode remarcar de novo.
  const { pac, c, caro, r, cobranca } = await remarcandoCaro();
  const d1 = await m.desistirRemarcacao({ consultaId: c.id, pacienteId: pac.id, agora: new Date(ANTES + 3 * 60_000) });
  const d2 = await m.desistirRemarcacao({ consultaId: c.id, pacienteId: pac.id, agora: new Date(ANTES + 3 * 60_000) });
  igual("desistir ok e idempotente", [d1.ok && !d1.jaProcessada, d2.ok && d2.jaProcessada], [true, true]);
  const nova = await db.consulta.findUnique({ where: { id: r.consultaNovaId! }, include: { pagamento: true } });
  igual("desistir: nova cancelada e cobrança falhou", [nova?.status, nova?.pagamento?.status], ["cancelada", "falhou"]);
  igual("desistir: espera expirada", (await db.esperaMedico.findUnique({ where: { consultaId: c.id } }))?.status, "expirada");
  const de2 = await m.remarcarPorEspera({ consultaId: c.id, pacienteId: pac.id, medicoId: caro.id, diferencaEsperadaCentavos: 5000, agora: new Date(ANTES + 4 * 60_000) });
  igual("desistir: médico volta a estar livre (remarca de novo)", de2.ok && !de2.jaProcessada && de2.consultaNovaId !== r.consultaNovaId, true);
  const outro = await usuario("PACIENTE");
  igual("desistir de outro paciente → 403", await m.desistirRemarcacao({ consultaId: c.id, pacienteId: outro.id }).then((x) => (x.ok ? 200 : x.status)), 403);
  void cobranca;
}
{
  // Pagou no limite: cron vê confirmado e troca em vez de expirar.
  const { c, cobranca } = await remarcandoCaro();
  await confirmarNoGateway(cobranca.pagamentoId);
  const job = await m.rodarEsperaMedico(new Date(ANTES + 12 * 60_000));
  igual("limite: cron troca", [job.remarcadasNoJob >= 1, (await db.esperaMedico.findUnique({ where: { consultaId: c.id } }))?.status], [true, "remarcada"]);
}
{
  // O médico atendeu antes da escolha: 409 medico_entrou e a espera fecha.
  const { pac, med, c } = await cenario(150);
  await m.abrirEspera(c.id, new Date(ANTES - 15 * 60_000));
  await db.chamadaConsulta.create({ data: { consultaId: c.id, tentativa: 1, paraUsuarioId: med.id, papel: "medico", status: "atendida", expiraEm: new Date(ANTES), respondidaEm: new Date(ANTES - 60_000) } });
  const r = await m.cancelarPorEspera({ consultaId: c.id, pacienteId: pac.id, agora: new Date(ANTES + 60_000) });
  igual("medico_entrou → 409", r.ok ? null : [r.status, r.erro], [409, "medico_entrou"]);
  igual("medico_entrou: espera fechada e consulta segue", [(await db.esperaMedico.findUnique({ where: { consultaId: c.id } }))?.status, (await db.consulta.findUnique({ where: { id: c.id } }))?.status], ["medico_entrou", "confirmada"]);
  igual("medico_entrou: sem reembolso", await db.reembolso.count({ where: { pagamento: { consultaId: c.id } } }), 0);
}
delete process.env.BION_PAGAMENTO_WEBHOOK_SECRET;

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

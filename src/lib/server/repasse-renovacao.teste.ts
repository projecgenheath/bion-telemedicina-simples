/** Testes do repasse da renovação paga. Rodar: bun src/lib/server/repasse-renovacao.teste.ts */
import { itensElegiveis, consultaForaPorRenovacao, consultaForaPorValorZero, type CandidatoConsulta, type CandidatoRenovacao } from "./repasse";

let ok = 0, falhas = 0;
const igual = (n: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhas++; console.error(`✗ ${n}\n  obtido ${JSON.stringify(a)}\n  esperado ${JSON.stringify(b)}`); }
};
const corte = new Date("2026-10-20T23:00:00-03:00");
const antes = new Date("2026-10-20T10:00:00-03:00");
const ped = (o: Partial<CandidatoRenovacao>): CandidatoRenovacao => ({
  id: "p1", status: "renovada", respondidoEm: antes,
  valorCentavos: 10000, pagamentoId: "pg1", pagamentoStatus: "confirmado", reembolsos: [], ...o,
});
const cons = (o: Record<string, unknown>) => ({
  id: "c1", dataInicio: antes, status: "concluida", valor: 100, pago: true, eventos: [],
  pagamento: { status: "confirmado", reembolsos: [] }, ...o,
}) as unknown as CandidatoConsulta;
const run = (renovacoes: CandidatoRenovacao[], consultas: CandidatoConsulta[] = [], extra = {}) =>
  itensElegiveis({ corte, consultas, multasCancelamento: [], multasRemarcacao: [], renovacoes, ...extra });

igual("renovada entra 90%", run([ped({})]).map((i) => [i.chave, i.brutoCentavos, i.liquidoCentavos]), [["renovacao:p1", 10000, 9000]]);
igual("chamada_marcada entra", run([ped({ status: "chamada_marcada" })]).length, 1);
for (const st of ["recusada", "cancelado", "pendente", "aguardando_pagamento"]) igual(`${st} fora`, run([ped({ status: st })]).length, 0);
igual("sem pagamentoId fora", run([ped({ pagamentoId: null })]).length, 0);
igual("pagamento não confirmado fora", run([ped({ pagamentoStatus: "pendente" })]).length, 0);
igual("sem valorCentavos fora", run([ped({ valorCentavos: undefined })]).length, 0);
igual("respondidoEm depois do corte fora", run([ped({ respondidoEm: new Date(corte.getTime() + 1) })]).length, 0);
igual("item grava pedidoRenovacaoId e consultaId nulo", run([ped({})]).map((i) => [i.consultaId, i.pedidoRenovacaoId]), [[null, "p1"]]);
igual("data = respondidoEm", run([ped({})])[0].quando, antes.toISOString());
igual("mesmo pagamento em 2 pedidos: 1 vez", run([ped({}), ped({ id: "p2" })]).length, 1);
igual("pagamento já repassado fora", run([ped({})], [], { pagamentosJaRepassados: new Set(["pg1"]) }).length, 0);
igual("consulta e pedido com mesmo pagamento: só a consulta",
  run([ped({})], [cons({ pagamentoId: "pg1" })]).map((i) => i.tipo), ["consulta"]);
igual("consulta renovacao valor 0 fora", run([], [cons({ tipoAtendimento: "renovacao", valor: 0 })]).length, 0);
igual("consulta renovacao com valor entra", run([], [cons({ tipoAtendimento: "renovacao", valor: 100 })]).length, 1);
igual("consultaForaPorRenovacao normal", consultaForaPorRenovacao({ tipoAtendimento: "normal", valor: 0 }), false);
// Retorno em até 30 dias é grátis: valor 0 e sem pagamento.
igual("retorno grátis sem pagamento fora", run([], [cons({ tipoAtendimento: "retorno", valor: 0, pagamento: null, pago: false })]).length, 0);
igual("retorno grátis fora mesmo com Pagamento confirmado", run([], [cons({ tipoAtendimento: "retorno", valor: 0 })]).length, 0);
igual("qualquer consulta valor 0 fora (nenhum item de R$ 0)", run([], [cons({ tipoAtendimento: "padrao", valor: 0 })]).length, 0);
igual("retorno pago (fora dos 30 dias) entra", run([], [cons({ tipoAtendimento: "retorno", valor: 100 })]).length, 1);
igual("consultaForaPorValorZero retorno 0", consultaForaPorValorZero({ tipoAtendimento: "retorno", valor: 0 }), true);
igual("consultaForaPorValorZero com valor", consultaForaPorValorZero({ tipoAtendimento: "retorno", valor: 100 }), false);
igual("reembolso total zera", run([ped({ reembolsos: [{ status: "processado", valorCentavos: 10000 }] })]).map((i) => i.liquidoCentavos), [0]);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

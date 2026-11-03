/** Cobrança direta fora do repasse PIX. Rodar: bun src/lib/server/repasse-cobranca-direta.teste.ts */
import { cobradoDiretoNoStripe, itensElegiveis, totalRecebidoDireto, type CandidatoConsulta, type CandidatoRenovacao } from "./repasse";

let ok = 0, falhas = 0;
const igual = (n: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhas++; console.error(`✗ ${n}\n  obtido ${JSON.stringify(a)}\n  esperado ${JSON.stringify(b)}`); }
};
const corte = new Date("2026-11-03T23:30:00-03:00");
const antes = new Date("2026-11-03T10:00:00-03:00");
const cons = (o: Record<string, unknown> = {}) => ({
  id: "c1", dataInicio: antes, status: "concluida", valor: 100, pago: true, eventos: [], pagamentoId: "pg1",
  pagamento: { status: "confirmado", reembolsos: [] }, ...o,
}) as unknown as CandidatoConsulta;
const ped = (o: Partial<CandidatoRenovacao> = {}): CandidatoRenovacao => ({
  id: "p1", status: "renovada", respondidoEm: antes, valorCentavos: 5000, pagamentoId: "pg2", pagamentoStatus: "confirmado", reembolsos: [], ...o,
});
const run = (x: Partial<Parameters<typeof itensElegiveis>[0]>) =>
  itensElegiveis({ corte, consultas: [], multasCancelamento: [], multasRemarcacao: [], renovacoes: [], ...x });

igual("helper: conta preenchida", cobradoDiretoNoStripe({ stripeContaDireta: "acct_1" }), true);
igual("helper: nulo", cobradoDiretoNoStripe({ stripeContaDireta: null }), false);
igual("helper: vazio", cobradoDiretoNoStripe({ stripeContaDireta: "  " }), false);
igual("helper: sem pagamento", cobradoDiretoNoStripe(null), false);

igual("consulta PIX/plataforma entra", run({ consultas: [cons()] }).length, 1);
igual("consulta cobrada direto fora", run({ consultas: [cons({ cobrancaDireta: true })] }).length, 0);
igual("renovação plataforma entra", run({ renovacoes: [ped()] }).length, 1);
igual("renovação cobrada direto fora", run({ renovacoes: [ped({ cobrancaDireta: true })] }).length, 0);
const multaC = { consultaId: "c9", em: antes, multaCentavos: 3000, valorConsulta: 100, reembolsos: [] };
igual("multa de cancelamento plataforma entra", run({ multasCancelamento: [multaC] }).length, 1);
igual("multa de cancelamento direta fora", run({ multasCancelamento: [{ ...multaC, cobrancaDireta: true }] }).length, 0);
const multaR = { remarcacaoId: "r1", consultaId: "c8", quando: antes, multaCentavos: 2000, reembolso: null };
igual("multa de remarcação plataforma entra", run({ multasRemarcacao: [multaR] }).length, 1);
igual("multa de remarcação direta fora", run({ multasRemarcacao: [{ ...multaR, cobrancaDireta: true }] }).length, 0);
igual(
  "mistura: só a legada entra",
  run({ consultas: [cons(), cons({ id: "c2", pagamentoId: "pg3", cobrancaDireta: true })] }).map((i) => i.chave),
  ["consulta:c1"],
);
igual(
  "total recebido direto",
  totalRecebidoDireto([
    { tipo: "consulta", data: "x", brutoCentavos: 10000, reembolsosCentavos: 0 },
    { tipo: "multa_remarcacao", data: "y", brutoCentavos: 2000, reembolsosCentavos: 2000 },
  ]),
  { brutoCentavos: 12000, reembolsosCentavos: 2000, liquidoCentavos: 10000 },
);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

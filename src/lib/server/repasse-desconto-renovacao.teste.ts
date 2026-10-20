/** Desconto de reembolso de renovação depois do fechamento. Rodar: bun --conditions react-server src/lib/server/repasse-desconto-renovacao.teste.ts */
import { ajustesNovos, type ItemGravado, type ReembolsoParaAjuste } from "./repasse";

let ok = 0, falhas = 0;
const igual = (n: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhas++; console.error(`✗ ${n}\n  obtido ${JSON.stringify(a)}\n  esperado ${JSON.stringify(b)}`); }
};
const fechado = new Date("2026-10-20T23:30:00-03:00");
const depois = new Date("2026-10-21T10:00:00-03:00");
const antes = new Date("2026-10-20T12:00:00-03:00");
const item = (o: Partial<ItemGravado> = {}): Map<string, ItemGravado> =>
  new Map([["renovacao:p1", { chave: "renovacao:p1", criadoEm: fechado, liquidoCentavos: 9000, ...o }]]);
const re = (o: Partial<ReembolsoParaAjuste> = {}): ReembolsoParaAjuste => ({
  id: "r1", valorCentavos: 10000, efetivoEm: depois, consultaId: "", remarcacaoId: null, pedidoRenovacaoId: "p1", ...o,
});
const run = (reembolsos: ReembolsoParaAjuste[], itens = item(), jaAjustado = new Map<string, number>()) =>
  ajustesNovos({ reembolsos, itens, jaAjustado });

igual("integral depois do fechamento: desconta 90%", run([re()]), [{ reembolsoId: "r1", consultaId: null, chaveItem: "renovacao:p1", valorCentavos: 9000 }]);
igual("parcial: 90% do parcial", run([re({ valorCentavos: 5000 })]).map((a) => a.valorCentavos), [4500]);
igual("antes do fechamento: já está no item", run([re({ efetivoEm: antes })]), []);
igual("mesmo instante do item: não desconta", run([re({ efetivoEm: fechado })]), []);
igual("item não gravado (outro médico / fora do repasse): nada", run([re()], new Map()), []);
igual("já descontado: não desconta de novo", run([re()], item(), new Map([["renovacao:p1", 9000]])), []);
igual("limitado ao líquido do item", run([re({ valorCentavos: 6000 }), re({ id: "r2", valorCentavos: 6000, efetivoEm: new Date(depois.getTime() + 1) })]).map((a) => a.valorCentavos), [5400, 3600]);
igual("líquido menor (parcial antes do item)", run([re()], item({ liquidoCentavos: 4500 })).map((a) => a.valorCentavos), [4500]);
igual("sem consulta e sem pedido: ignora", run([re({ pedidoRenovacaoId: null })]), []);
igual("consulta continua igual",
  ajustesNovos({ reembolsos: [re({ consultaId: "c1", pedidoRenovacaoId: null })], itens: new Map([["consulta:c1", { chave: "consulta:c1", criadoEm: fechado, liquidoCentavos: 9000 }]]), jaAjustado: new Map() })
    .map((a) => [a.chaveItem, a.consultaId, a.valorCentavos]), [["consulta:c1", "c1", 9000]]);

console.log(`${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);

/** Taxa real do gateway e application fee do Connect. Rodar: bun --conditions=react-server test ./src/lib/server/financeiro-taxa-stripe.teste.ts */
import { describe, expect, test } from "bun:test";
import { divisaoDaMulta, liquidoComReembolso, liquidoDaConsulta, taxaGatewayValida, taxaPlataformaConnectCentavos } from "./financeiro";
import { ajustesNovos, itemDaConsulta, itemDaRenovacao, type CandidatoConsulta } from "./repasse";

const consulta = (taxa: number | null, reembolsos: { valorCentavos: number }[] = []): CandidatoConsulta =>
  ({
    id: "c1", dataInicio: new Date("2026-10-20T10:00:00-03:00"), status: "concluida", valor: 100, pago: true,
    pagamento: { status: "confirmado", taxaGatewayCentavos: taxa, reembolsos: reembolsos.map((r, i) => ({ id: `r${i}`, status: "aprovado", efetivoEm: new Date("2026-10-20T12:00:00-03:00"), ...r })) },
  }) as unknown as CandidatoConsulta;

describe("taxa real do gateway na cobrança normal", () => {
  test("sem taxa: 90%", () => expect(liquidoDaConsulta(10000).liquidoCentavos).toBe(9000));
  test("taxa sai dos 90% do médico", () => expect(liquidoDaConsulta(10000, 399)).toEqual({ brutoCentavos: 10000, comissaoCentavos: 1000, taxaCentavos: 399, liquidoCentavos: 8601 }));
  test("taxa null/negativa/NaN = 0", () => {
    expect(taxaGatewayValida(null, 10000)).toBe(0);
    expect(taxaGatewayValida(-5, 10000)).toBe(0);
    expect(taxaGatewayValida(Number.NaN, 10000)).toBe(0);
  });
  test("comissão de 10% não muda com a taxa", () => expect(liquidoDaConsulta(10000, 399).comissaoCentavos).toBe(1000));
  test("item da consulta usa a taxa", () => {
    const i = itemDaConsulta(consulta(399));
    expect([i.taxasCentavos, i.liquidoCentavos]).toEqual([399, 8601]);
  });
  test("item da renovação usa a taxa", () => {
    const i = itemDaRenovacao({ id: "p1", status: "renovada", respondidoEm: new Date(), valorCentavos: 5000, taxaGatewayCentavos: 200, reembolsos: [] });
    expect([i.taxasCentavos, i.liquidoCentavos]).toEqual([200, 4300]);
  });
});

describe("reembolso: tudo ao paciente, taxa com o app", () => {
  test("integral: médico 0 e taxa não cobrada dele", () => {
    const l = liquidoComReembolso(10000, 399, 10000);
    expect([l.taxaCentavos, l.reembolsosCentavos, l.liquidoCentavos]).toEqual([0, 9000, 0]);
  });
  test("parcial: taxa da parte mantida fica no médico, sai 90% do reembolsado", () => {
    const l = liquidoComReembolso(10000, 399, 5000);
    expect([l.taxaCentavos, l.reembolsosCentavos, l.liquidoCentavos]).toEqual([399, 4500, 4101]);
  });
  test("item da consulta com reembolso integral antes do fechamento", () => {
    const i = itemDaConsulta(consulta(399, [{ valorCentavos: 10000 }]));
    expect([i.taxasCentavos, i.liquidoCentavos]).toEqual([0, 0]);
  });
  test("reembolso depois do fechamento: desconta no repasse seguinte, até o líquido pago", () => {
    const fechado = new Date("2026-10-20T23:30:00-03:00");
    const a = ajustesNovos({
      reembolsos: [{ id: "r1", valorCentavos: 10000, efetivoEm: new Date("2026-10-21T10:00:00-03:00"), consultaId: "c1", remarcacaoId: null, pedidoRenovacaoId: null }],
      itens: new Map([["consulta:c1", { chave: "consulta:c1", criadoEm: fechado, liquidoCentavos: 8601 }]]),
      jaAjustado: new Map(),
    });
    expect(a.map((x) => x.valorCentavos)).toEqual([8601]);
  });
  test("multa 50/50 sem comissão", () => expect(divisaoDaMulta(5000)).toEqual({ medicoCentavos: 2500, appCentavos: 2500 }));
});

describe("taxaPlataformaConnectCentavos (application_fee_amount)", () => {
  test("consulta: 10%, sem taxa", () => expect(taxaPlataformaConnectCentavos({ tipo: "consulta", valorCentavos: 10000 })).toBe(1000));
  test("renovação: 10%", () => expect(taxaPlataformaConnectCentavos({ tipo: "renovacao", valorCentavos: 4999 })).toBe(500));
  test("multa: parte do app (50%)", () => expect(taxaPlataformaConnectCentavos({ tipo: "multa", multaCentavos: 5001 })).toBe(2500));
  test("valor negativo = 0", () => expect(taxaPlataformaConnectCentavos({ tipo: "consulta", valorCentavos: -1 })).toBe(0));
});

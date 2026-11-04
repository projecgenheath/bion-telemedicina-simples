/** Comissão da BION no Connect. Rodar: bun --conditions=react-server test ./src/lib/server/comissao-connect.teste.ts */
import { describe, expect, test } from "bun:test";
import { divisaoDaMulta, taxaPlataformaConnectCentavos } from "./financeiro";
import { comissaoPlataformaConnect } from "./gateway-pagamento";

describe("comissão da BION no Connect (application_fee_amount)", () => {
  test("consulta: 10%", () => expect(comissaoPlataformaConnect("consulta", 15000)).toBe(1500));
  test("renovação: 10%", () => expect(comissaoPlataformaConnect("renovacao", 8000)).toBe(800));
  test("diferença da sala de espera: 10%", () => expect(comissaoPlataformaConnect("espera", 4990)).toBe(499));
  test("multa de remarcação: 50% (divisaoDaMulta().appCentavos)", () => {
    expect(comissaoPlataformaConnect("multa", 5000)).toBe(2500);
    expect(comissaoPlataformaConnect("multa", 5001)).toBe(divisaoDaMulta(5001).appCentavos);
    expect(comissaoPlataformaConnect("multa", 5001)).toBe(taxaPlataformaConnectCentavos({ tipo: "multa", multaCentavos: 5001 }));
  });
  test("multa nunca usa os 10%", () => expect(comissaoPlataformaConnect("multa", 10000)).not.toBe(1000));
  test("não lança mais erro de #116", () => expect(() => comissaoPlataformaConnect("consulta", 100)).not.toThrow());
  test("taxa do cartão não entra na comissão (sai da parte do médico)", () =>
    expect(comissaoPlataformaConnect("consulta", 10000)).toBe(10000 * 0.1));
  test("valor negativo vira 0", () => expect(comissaoPlataformaConnect("consulta", -100)).toBe(0));
});

/** Chave live barrada em todo movimento de dinheiro (fábrica stripe()). Rodar: bun --conditions=react-server test ./src/lib/server/chave-live-dinheiro.teste.ts */
import { afterEach, describe, expect, test } from "bun:test";
import { ChaveLiveBloqueadaError } from "./stripe";
import { devolverFeeChargeback, transferirFalhaBion, type DbFee, type DbTransfer } from "./chargeback";
import { devolverTaxaAoMedico, type DbTaxa } from "./reembolso-taxa-medico";

const original = process.env.STRIPE_SECRET_KEY;
afterEach(() => { if (original === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = original; });

// DB que conta qualquer acesso: com chave live nada pode ser lido/gravado.
function dbEspiao() {
  const n = { acessos: 0 };
  const conta = async () => { n.acessos++; return null; };
  const tx: any = { $queryRaw: conta, chargeback: { findUnique: conta, update: conta, updateMany: conta } };
  tx.$transaction = async (fn: any) => { n.acessos++; return fn(tx); };
  return { d: tx, n };
}

describe.each(["sk_live_x", "rk_live_x"])("chave %p", (chave) => {
  test("transferência da falha da BION lança antes de tudo", async () => {
    process.env.STRIPE_SECRET_KEY = chave; const { d, n } = dbEspiao();
    await expect(transferirFalhaBion("cb1", { d: d as DbTransfer, moeda: "brl" })).rejects.toBeInstanceOf(ChaveLiveBloqueadaError);
    expect(n.acessos).toBe(0);
  });
  test("refund da application fee lança antes de tudo", async () => {
    process.env.STRIPE_SECRET_KEY = chave; const { d, n } = dbEspiao();
    await expect(devolverFeeChargeback("cb1", { d: d as DbFee })).rejects.toBeInstanceOf(ChaveLiveBloqueadaError);
    expect(n.acessos).toBe(0);
  });
  test("devolução da taxa no reembolso lança sem gravar linha", async () => {
    process.env.STRIPE_SECRET_KEY = chave;
    const criadas: unknown[] = [];
    const r = { id: "rb1", status: "processado", motivo: "falta_paciente", valorCentavos: 15000, multaCentavos: 0, stripeRefundId: "re_1",
      pagamento: { valor: 150, stripePaymentIntentId: "pi_1", stripeTaxaCentavos: 649, consulta: { medico: { perfilMedico: { stripeAccountId: "acct_med" } } } } };
    const d = { reembolso: { findUnique: async () => r }, reembolsoTaxaMedico: { findUnique: async () => null, create: async (a: unknown) => { criadas.push(a); return a; }, update: async () => ({}), updateMany: async () => ({ count: 0 }) } };
    const env = { BION_PAGAMENTO_STRIPE: "true", STRIPE_SECRET_KEY: chave, STRIPE_CONNECT: "true", STRIPE_MODO_COBRANCA: "direta" };
    await expect(devolverTaxaAoMedico("re_1", { d: d as unknown as DbTaxa, env, audit: (async () => undefined) as never })).rejects.toBeInstanceOf(ChaveLiveBloqueadaError);
    expect(criadas.length).toBe(0);
  });
});

/** Chave live barrada em todo movimento de dinheiro (fábrica stripe()). Rodar: bun --conditions=react-server test ./src/lib/server/chave-live-dinheiro.teste.ts */
import { afterEach, describe, expect, test } from "bun:test";
import { ChaveLiveBloqueadaError } from "./stripe";
import { cobrarTaxasChargebackPlataforma, devolverFeeChargeback, transferirFalhaBion, type DbFee, type DbTaxas, type DbTransfer } from "./chargeback";
import { enviarTransferencia, type DbTransferencia } from "./transferencia-medico";

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
  test("cobrança das taxas do chargeback (plataforma) lança antes de tudo", async () => {
    process.env.STRIPE_SECRET_KEY = chave; const { d, n } = dbEspiao();
    await expect(cobrarTaxasChargebackPlataforma("cb1", { d: d as unknown as DbTaxas })).rejects.toBeInstanceOf(ChaveLiveBloqueadaError);
    expect(n.acessos).toBe(0);
  });
  test("transferência ao médico fica desligada e não toca no banco", async () => {
    process.env.STRIPE_SECRET_KEY = chave;
    const { d, n } = dbEspiao();
    const env = { BION_PAGAMENTO_STRIPE: "true", STRIPE_SECRET_KEY: chave, STRIPE_CONNECT: "true", STRIPE_MODO_COBRANCA: "plataforma" };
    const r = await enviarTransferencia("t1", { d: d as unknown as DbTransferencia, env, audit: (async () => undefined) as never });
    expect(r).toEqual({ enviado: false, motivo: "desligado" });
    expect(n.acessos).toBe(0);
  });
});

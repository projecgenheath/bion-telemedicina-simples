/** Trava da chave live na fábrica stripe(). Rodar: bun --conditions=react-server test ./src/lib/server/stripe-chave-live.teste.ts */
import { afterEach, describe, expect, test } from "bun:test";
import { ChaveLiveBloqueadaError, enviarReembolsoStripe, exigirChaveNaoLive, stripe } from "./stripe";

const original = process.env.STRIPE_SECRET_KEY;
afterEach(() => { if (original === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = original; });

describe("fábrica stripe()", () => {
  test.each(["sk_live_x", "rk_live_x", "  sk_live_x "])("lança com %p", (k) => {
    process.env.STRIPE_SECRET_KEY = k;
    expect(() => stripe()).toThrow(ChaveLiveBloqueadaError);
    expect(() => exigirChaveNaoLive(k)).toThrow(ChaveLiveBloqueadaError);
  });
  test.each(["sk_test_x", "rk_test_x"])("funciona com %p", (k) => {
    process.env.STRIPE_SECRET_KEY = k;
    expect(stripe()).toBeTruthy();
  });
  test("cliente em cache não escapa da trava quando a chave vira live", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; stripe();
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    expect(() => stripe()).toThrow(ChaveLiveBloqueadaError);
  });
});

describe("reembolso com chave live", () => {
  test("lança antes do Stripe e não grava nada", async () => {
    process.env.STRIPE_SECRET_KEY = "rk_live_x";
    let gravou = 0;
    const d = {
      reembolso: {
        findUnique: async () => ({ id: "r1", status: "aprovado", valorCentavos: 1000, stripeRefundId: null, pagamento: { stripePaymentIntentId: "pi_1", consulta: null, pedidoRenovacao: null }, remarcacao: null }),
        update: async () => { gravou++; return {}; },
      },
    };
    await expect(enviarReembolsoStripe("r1", { d: d as never, connect: false })).rejects.toBeInstanceOf(ChaveLiveBloqueadaError);
    expect(gravou).toBe(0);
  });
});

describe("webhook com chave live", () => {
  test("recusa com 503 antes de reivindicar o evento (nada marcado como feito)", async () => {
    const { readFileSync } = await import("node:fs");
    const wh = readFileSync(new URL("./stripe-webhook.ts", import.meta.url), "utf8");
    expect(/bloqueioChaveLive\("plataforma"\)[\s\S]*?status: 503[\s\S]*?reivindicarEvento\(evento\.id/.test(wh)).toBe(true);
  });
});

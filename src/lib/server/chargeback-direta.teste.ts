/** Chargeback na cobrança direta. Rodar: bun --conditions=react-server test ./src/lib/server/chargeback-direta.teste.ts */
import { describe, expect, test } from "bun:test";
import { chaveIdempotenciaFalhaBion, descontoChargebackCentavos, marcarFalhaBion, registrarDisputaStripe, transferirFalhaBion, valorTransferenciaFalhaBion, type DbChargeback, type DbDisputa, type DbTransfer, type StripeTransfer } from "./chargeback";

type Cb = {
  id: string; falhaBion: boolean; statusStripe: string; stripeConta: string | null; taxaDisputaCentavos: number | null;
  transferFalhaBionId: string | null; transferFalhaBionStatus: string | null; transferFalhaBionCentavos: number | null; transferFalhaBionErro?: string | null;
  pagamento: { stripeTaxaCentavos: number | null } | null;
};
const base = (x: Partial<Cb> = {}): Cb => ({
  id: "cb1", falhaBion: true, statusStripe: "lost", stripeConta: "acct_med", taxaDisputaCentavos: 1500,
  transferFalhaBionId: null, transferFalhaBionStatus: null, transferFalhaBionCentavos: null, pagamento: { stripeTaxaCentavos: 450 }, ...x,
});
function fakeDb(cb: Cb | null): DbTransfer & { travas: number } {
  const tx = {
    travas: 0,
    $queryRaw: async () => { tx.travas++; return []; },
    chargeback: {
      findUnique: async () => (cb ? structuredClone(cb) : null),
      update: async (a: any) => { Object.assign(cb!, a.data); return {}; },
      updateMany: async (a: any) => { if (cb && cb.transferFalhaBionStatus !== "enviado") { Object.assign(cb, a.data); return { count: 1 }; } return { count: 0 }; },
    },
  };
  return Object.assign(tx, { $transaction: async <T>(fn: (t: any) => Promise<T>) => fn(tx) }) as any;
}
function fakeStripe(opts: { falha?: boolean; existente?: string } = {}) {
  const chamadas: { p: any; o: any }[] = [];
  const s: StripeTransfer = {
    transfers: {
      list: async () => ({ data: opts.existente ? [{ id: opts.existente, metadata: { chargebackId: "cb1", tipo: "chargeback_falha_bion" } }] : [] }),
      create: async (p, o) => { chamadas.push({ p, o }); if (opts.falha) throw new Error("balance_insufficient"); return { id: "tr_1" }; },
    },
  };
  return { s, chamadas };
}

describe("desconto no PIX", () => {
  test("cobrança direta: nada a descontar do repasse", () => {
    expect(descontoChargebackCentavos({ falhaBion: false, medicoId: "m1", statusStripe: "lost", taxaDisputaCentavos: 1500, stripeConta: "acct_x" })).toBe(0);
  });
  test("plataforma continua descontando a dispute fee", () => {
    expect(descontoChargebackCentavos({ falhaBion: false, medicoId: "m1", statusStripe: "lost", taxaDisputaCentavos: 1500, stripeConta: null })).toBe(1500);
  });
});

describe("transferirFalhaBion", () => {
  test("valor = taxa do cartão + dispute fee", () => {
    expect(valorTransferenciaFalhaBion({ taxaDisputaCentavos: 1500, pagamento: { stripeTaxaCentavos: 450 } })).toBe(1950);
    expect(valorTransferenciaFalhaBion({ taxaDisputaCentavos: null, pagamento: null })).toBe(0);
  });
  test("perdida + falha da BION: transfere com idempotência e grupo", async () => {
    const cb = base(); const d = fakeDb(cb); const { s, chamadas } = fakeStripe();
    const r = await transferirFalhaBion("cb1", { d, s, moeda: "brl" });
    expect(r).toEqual({ enviado: true, transferId: "tr_1", valorCentavos: 1950 });
    expect(chamadas[0].p).toMatchObject({ amount: 1950, currency: "brl", destination: "acct_med", transfer_group: "chargeback_cb1" });
    expect(chamadas[0].o).toEqual({ idempotencyKey: chaveIdempotenciaFalhaBion("cb1") });
    expect(cb.transferFalhaBionStatus).toBe("enviado");
    expect(d.travas).toBe(1);
  });
  test("repetir não transfere de novo", async () => {
    const cb = base(); const d = fakeDb(cb); const { s, chamadas } = fakeStripe();
    await transferirFalhaBion("cb1", { d, s, moeda: "brl" });
    expect(await transferirFalhaBion("cb1", { d, s, moeda: "brl" })).toEqual({ enviado: false, motivo: "ja_enviado" });
    expect(chamadas.length).toBe(1);
  });
  test("transferência anterior no transfer_group é reaproveitada (chave expirada)", async () => {
    const cb = base({ transferFalhaBionStatus: "pendente", transferFalhaBionCentavos: 1950 }); const { s, chamadas } = fakeStripe({ existente: "tr_velha" });
    expect(await transferirFalhaBion("cb1", { d: fakeDb(cb), s, moeda: "brl" })).toEqual({ enviado: true, transferId: "tr_velha", valorCentavos: 1950 });
    expect(chamadas.length).toBe(0);
  });
  test("valor congelado na primeira tentativa", async () => {
    const cb = base({ transferFalhaBionStatus: "falhou", transferFalhaBionCentavos: 1000 }); const { s, chamadas } = fakeStripe();
    await transferirFalhaBion("cb1", { d: fakeDb(cb), s, moeda: "brl" });
    expect(chamadas[0].p.amount).toBe(1000);
  });
  test("erro do Stripe: grava falhou e relança", async () => {
    const cb = base(); const { s } = fakeStripe({ falha: true });
    await expect(transferirFalhaBion("cb1", { d: fakeDb(cb), s, moeda: "brl" })).rejects.toThrow();
    expect(cb.transferFalhaBionStatus).toBe("falhou");
  });
  test.each([
    ["nao_direta", { stripeConta: null }],
    ["sem_falha_bion", { falhaBion: false }],
    ["aguardando_desfecho", { statusStripe: "needs_response" }],
    ["aguardando_desfecho", { statusStripe: "won" }],
    ["valor_zero", { taxaDisputaCentavos: 0, pagamento: { stripeTaxaCentavos: 0 } }],
  ] as const)("não transfere: %s", async (motivo, x) => {
    const { s, chamadas } = fakeStripe();
    expect(await transferirFalhaBion("cb1", { d: fakeDb(base(x as Partial<Cb>)), s, moeda: "brl" })).toEqual({ enviado: false, motivo });
    expect(chamadas.length).toBe(0);
  });
  test("não encontrado", async () => {
    const { s } = fakeStripe();
    expect(await transferirFalhaBion("x", { d: fakeDb(null), s, moeda: "brl" })).toEqual({ enviado: false, motivo: "nao_encontrado" });
  });
});

describe("marcação e webhook", () => {
  test("desmarcar depois da transferência: 409", async () => {
    const cb = { id: "cb1", falhaBion: true, medicoId: "m1", statusStripe: "lost", taxaDisputaCentavos: 1500, stripeConta: "acct", transferFalhaBionStatus: "enviado" };
    const tx = { $queryRaw: async () => [], chargeback: { findUnique: async () => ({ ...cb }), update: async () => ({}) }, repasseAjuste: { findFirst: async () => null, deleteMany: async () => ({ count: 0 }) }, auditLog: { create: async () => ({}) } };
    const d = { $transaction: async (fn: any) => fn(tx) } as unknown as DbChargeback;
    const r = await marcarFalhaBion({ chargebackId: "cb1", admin: { id: "a", nome: "A", role: "ADMIN" }, falhaBion: false, motivo: "motivo qualquer longo" }, d);
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "transferencia_enviada" });
  });
  test("disputa nova de evento Connect grava a conta do médico", async () => {
    let criado: any = null;
    const tx = {
      $queryRaw: async () => [],
      pagamento: { findFirst: async () => ({ id: "p1", consultaId: "c1", consulta: { medicoId: "m1" }, pedidoRenovacao: null }) },
      remarcacaoPendente: { findFirst: async () => null },
      chargeback: { findUnique: async () => null, create: async (a: any) => { criado = a.data; return { id: "cb1" }; }, update: async () => ({}) },
      repasseAjuste: { findFirst: async () => null, deleteMany: async () => ({ count: 0 }) },
    };
    const d = { $transaction: async (fn: any) => fn(tx) } as unknown as DbDisputa;
    await registrarDisputaStripe({ id: "evt1", created: 1, type: "charge.dispute.created", account: "acct_med", data: { object: { id: "dp_1", amount: 10000, status: "needs_response", charge: "ch_1" } } }, d);
    expect(criado.stripeConta).toBe("acct_med");
  });
});

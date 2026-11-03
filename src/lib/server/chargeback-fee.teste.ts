/** Devolução dos 10% no chargeback perdido (cobrança direta). Rodar: bun --conditions=react-server test ./src/lib/server/chargeback-fee.teste.ts */
import { describe, expect, test } from "bun:test";
import { chaveIdempotenciaFeeChargeback, devolverFeeChargeback, registrarDisputaStripe, type DbDisputa, type DbFee, type StripeFee } from "./chargeback";

type Cb = { id: string; statusStripe: string; stripeConta: string | null; stripeChargeId: string | null; feeRefundStatus: string | null; feeRefundId: string | null; feeRefundCentavos: number | null; feeRefundErro?: string | null };
const base = (x: Partial<Cb> = {}): Cb => ({ id: "cb1", statusStripe: "lost", stripeConta: "acct_med", stripeChargeId: "ch_1", feeRefundStatus: "pendente", feeRefundId: null, feeRefundCentavos: null, ...x });
const FINAIS = ["enviado", "ja_devolvida", "sem_fee"];
function fakeDb(cb: Cb | null): DbFee & { travas: number } {
  const tx = {
    travas: 0,
    $queryRaw: async () => { tx.travas++; return []; },
    chargeback: {
      findUnique: async () => (cb ? structuredClone(cb) : null),
      update: async (a: any) => { Object.assign(cb!, a.data); return {}; },
      updateMany: async (a: any) => { if (cb && !FINAIS.includes(cb.feeRefundStatus ?? "")) { Object.assign(cb, a.data); return { count: 1 }; } return { count: 0 }; },
    },
  };
  return Object.assign(tx, { $transaction: async <T>(fn: (t: any) => Promise<T>) => fn(tx) }) as any;
}
function fakeStripe(o: { fee?: number; devolvido?: number; falhas?: number; semFee?: boolean } = {}) {
  const estado = { amount: o.fee ?? 1000, refunded: o.devolvido ?? 0, refunds: [] as any[], falhas: o.falhas ?? 0 };
  const criados: { p: any; o: any }[] = [];
  const contas: string[] = [];
  const s: StripeFee = {
    charges: { retrieve: async (_id, _p, op) => { contas.push(op.stripeAccount); return { application_fee: o.semFee ? null : "fee_1" }; } },
    applicationFees: {
      retrieve: async () => ({ id: "fee_1", amount: estado.amount, amount_refunded: estado.refunded }),
      listRefunds: async () => ({ data: estado.refunds }),
      createRefund: async (_id, p, op) => {
        criados.push({ p, o: op });
        if (estado.falhas-- > 0) throw new Error("api_error");
        const r = { id: `fr_${criados.length}`, amount: p.amount, metadata: p.metadata };
        estado.refunds.push(r); estado.refunded += p.amount; return r;
      },
    },
  };
  return { s, criados, contas, estado };
}

describe("devolverFeeChargeback", () => {
  test("perdida: exatamente um refund, com chave e conta do médico", async () => {
    const cb = base(); const d = fakeDb(cb); const st = fakeStripe();
    expect(await devolverFeeChargeback("cb1", { d, s: st.s })).toEqual({ enviado: true, refundId: "fr_1", valorCentavos: 1000 });
    expect(st.criados.length).toBe(1);
    expect(st.criados[0].o).toEqual({ idempotencyKey: chaveIdempotenciaFeeChargeback("cb1") });
    expect(st.contas).toEqual(["acct_med"]);
    expect(cb).toMatchObject({ feeRefundStatus: "enviado", feeRefundId: "fr_1", feeRefundCentavos: 1000 });
    expect(d.travas).toBe(1);
  });
  test("repetido/atrasado não devolve de novo", async () => {
    const cb = base(); const d = fakeDb(cb); const st = fakeStripe();
    await devolverFeeChargeback("cb1", { d, s: st.s });
    expect(await devolverFeeChargeback("cb1", { d, s: st.s })).toEqual({ enviado: false, motivo: "ja_enviado" });
    expect(st.criados.length).toBe(1);
  });
  test("refund nosso já no Stripe (chave expirada, DB não gravou): reaproveita", async () => {
    const st = fakeStripe(); st.estado.refunds.push({ id: "fr_velho", amount: 1000, metadata: { chargebackId: "cb1", tipo: "chargeback_fee_refund" } }); st.estado.refunded = 1000;
    const cb = base();
    expect(await devolverFeeChargeback("cb1", { d: fakeDb(cb), s: st.s })).toEqual({ enviado: true, refundId: "fr_velho", valorCentavos: 1000 });
    expect(st.criados.length).toBe(0);
  });
  test("fee já toda devolvida (reembolso integral): pula", async () => {
    const cb = base(); const st = fakeStripe({ devolvido: 1000 });
    expect(await devolverFeeChargeback("cb1", { d: fakeDb(cb), s: st.s })).toEqual({ enviado: false, motivo: "ja_devolvida" });
    expect(st.criados.length).toBe(0);
    expect(cb.feeRefundStatus).toBe("ja_devolvida");
  });
  test("fee parcialmente devolvida: só o saldo", async () => {
    const st = fakeStripe({ devolvido: 300 });
    expect(await devolverFeeChargeback("cb1", { d: fakeDb(base()), s: st.s })).toMatchObject({ enviado: true, valorCentavos: 700 });
  });
  test("sem application fee: sem_fee", async () => {
    const st = fakeStripe({ semFee: true });
    expect(await devolverFeeChargeback("cb1", { d: fakeDb(base()), s: st.s })).toEqual({ enviado: false, motivo: "sem_fee" });
  });
  test("falha do Stripe e depois retry dá certo, uma vez só", async () => {
    const cb = base(); const d = fakeDb(cb); const st = fakeStripe({ falhas: 1 });
    await expect(devolverFeeChargeback("cb1", { d, s: st.s })).rejects.toThrow();
    expect(cb.feeRefundStatus).toBe("falhou");
    expect(await devolverFeeChargeback("cb1", { d, s: st.s })).toMatchObject({ enviado: true, valorCentavos: 1000 });
    expect(st.estado.refunds.length).toBe(1);
    expect(st.criados[1].o.idempotencyKey).toBe("chargeback-fee-refund-cb1");
  });
  test.each([
    ["nao_perdida", { statusStripe: "won" }],
    ["nao_perdida", { statusStripe: "needs_response" }],
    ["nao_direta", { stripeConta: null }],
  ] as const)("não devolve: %s", async (motivo, x) => {
    const st = fakeStripe();
    expect(await devolverFeeChargeback("cb1", { d: fakeDb(base(x as Partial<Cb>)), s: st.s })).toEqual({ enviado: false, motivo });
    expect(st.criados.length).toBe(0);
  });
});

describe("registrarDisputaStripe marca a devolução", () => {
  function tx(atual: any) {
    let upd: any = null;
    const t = {
      $queryRaw: async () => [],
      pagamento: { findFirst: async () => null }, remarcacaoPendente: { findFirst: async () => null },
      chargeback: { findUnique: async () => atual, create: async () => ({ id: "cb1" }), update: async (a: any) => { upd = a.data; return {}; } },
      repasseAjuste: { findFirst: async () => null, deleteMany: async () => ({ count: 0 }) },
    };
    return { d: { $transaction: async (fn: any) => fn(t) } as unknown as DbDisputa, upd: () => upd };
  }
  const atual = (x: any = {}) => ({ id: "cb1", statusStripe: "needs_response", ultimoEventoId: "e0", ultimoEventoEm: new Date(0), falhaBion: false, medicoId: "m1", taxaDisputaCentavos: 1500, creditoPendente: false, creditoDevolvidoEm: null, stripeConta: "acct_med", feeRefundStatus: null, ...x });
  const ev = (status: string, id = "e1") => ({ id, created: 10, type: "charge.dispute.closed", account: "acct_med", data: { object: { id: "dp_1", amount: 10000, status, charge: "ch_1" } } });
  test("lost na direta: pendente", async () => { const t = tx(atual()); await registrarDisputaStripe(ev("lost"), t.d); expect(t.upd().feeRefundStatus).toBe("pendente"); });
  test("won: nada", async () => { const t = tx(atual()); await registrarDisputaStripe(ev("won"), t.d); expect(t.upd().feeRefundStatus).toBeUndefined(); });
  test("lost repetido depois de enviado: não reabre", async () => { const t = tx(atual({ statusStripe: "lost", feeRefundStatus: "enviado" })); await registrarDisputaStripe(ev("lost", "e2"), t.d); expect(t.upd().feeRefundStatus).toBeUndefined(); });
  test("modo plataforma: não afeta", async () => { const t = tx(atual({ stripeConta: null })); await registrarDisputaStripe(ev("lost"), t.d); expect(t.upd().feeRefundStatus).toBeUndefined(); });
});

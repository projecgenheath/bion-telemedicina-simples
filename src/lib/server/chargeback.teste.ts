/** Chargeback + "falha da BION". Rodar: bun --conditions=react-server test ./src/lib/server/chargeback.teste.ts */
import { describe, expect, test } from "bun:test";
import { descontoChargebackCentavos, marcarFalhaBion, registrarDisputaStripe, taxaDaDisputa, validarPedidoFalhaBion, type DbChargeback } from "./chargeback";

type Estado = {
  cb: { id: string; falhaBion: boolean; falhaBionMotivo: string | null; falhaBionPorId: string | null; falhaBionEm: Date | null; medicoId: string; valorCentavos: number; taxaCartaoCentavos: number | null; taxaDisputaCentavos: number | null } | null;
  ajuste: { id: string; repasseId: string | null } | null;
  audits: { data: Record<string, unknown> }[];
};
const novo = (x: Partial<Estado> = {}): Estado => ({
  cb: { id: "cb1", falhaBion: false, falhaBionMotivo: null, falhaBionPorId: null, falhaBionEm: null, medicoId: "m1", valorCentavos: 15000, taxaCartaoCentavos: 600, taxaDisputaCentavos: 1500 },
  ajuste: { id: "aj1", repasseId: null },
  audits: [],
  ...x,
});
/** Transação falsa: em erro, volta ao estado anterior (rollback). */
function fakeDb(e: Estado, auditFalha = false): DbChargeback {
  return {
    async $transaction(fn) {
      const antes = structuredClone(e);
      const tx = {
        chargeback: {
          findUnique: async () => (e.cb ? { ...e.cb } : null),
          update: async (a: any) => { Object.assign(e.cb!, a.data); return {}; },
        },
        repasseAjuste: {
          findFirst: async () => (e.ajuste ? { ...e.ajuste } : null),
          deleteMany: async (a: any) => { if (e.ajuste && e.ajuste.id === a.where.id && e.ajuste.repasseId === null) { e.ajuste = null; return { count: 1 }; } return { count: 0 }; },
        },
        auditLog: { create: async (a: any) => { if (auditFalha) throw new Error("db fora"); e.audits.push(a); return {}; } },
      };
      try { return await fn(tx as any); } catch (err) { Object.assign(e, antes); throw err; }
    },
  };
}
const admin = { id: "adm1", nome: "Admin", role: "ADMIN" };
const MOTIVO = "Falha de antifraude da BION liberou a cobrança";

describe("desconto", () => {
  test("sem marcação: taxa do cartão + dispute fee", () => expect(descontoChargebackCentavos({ falhaBion: false, taxaCartaoCentavos: 600, taxaDisputaCentavos: 1500 })).toBe(2100));
  test("falha da BION: zero", () => expect(descontoChargebackCentavos({ falhaBion: true, taxaCartaoCentavos: 600, taxaDisputaCentavos: 1500 })).toBe(0));
  test("taxas ausentes contam 0", () => expect(descontoChargebackCentavos({ falhaBion: false, taxaCartaoCentavos: null, taxaDisputaCentavos: 1500 })).toBe(1500));
  test("dispute fee pela soma das balance_transactions", () => expect(taxaDaDisputa([{ fee: 1500 }, { fee: 0 }, { fee: -10 }])).toBe(1500));
  test("sem balance_transactions: null", () => expect(taxaDaDisputa([])).toBe(null));
});

describe("validação", () => {
  test("motivo curto: erro", () => expect(validarPedidoFalhaBion({ falhaBion: true, motivo: "curto" }).ok).toBe(false));
  test("sem motivo: erro", () => expect(validarPedidoFalhaBion({ falhaBion: true }).ok).toBe(false));
  test("falhaBion não booleano: erro", () => expect(validarPedidoFalhaBion({ falhaBion: "sim", motivo: MOTIVO }).ok).toBe(false));
  test("ok com trim", () => expect(validarPedidoFalhaBion({ falhaBion: true, motivo: `  ${MOTIVO} ` })).toEqual({ ok: true, falhaBion: true, motivo: MOTIVO }));
});

describe("marcarFalhaBion", () => {
  test("marcar: nada é descontado, ajuste pendente removido, auditoria gravada", async () => {
    const e = novo();
    const r = await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: true, motivo: MOTIVO }, fakeDb(e));
    expect(r).toEqual({ ok: true, mudou: true, falhaBion: true, descontoCentavos: 0, ajusteRemovido: true });
    expect(e.ajuste).toBe(null);
    expect([e.cb!.falhaBion, e.cb!.falhaBionMotivo, e.cb!.falhaBionPorId]).toEqual([true, MOTIVO, "adm1"]);
    expect(e.audits.length).toBe(1);
    expect(e.audits[0].data.acao).toBe("CHARGEBACK_FALHA_BION_MARCADA");
    expect(e.audits[0].data.usuarioId).toBe("adm1");
    expect(String(e.audits[0].data.detalhes)).toContain(MOTIVO);
  });
  test("idempotente: marcar de novo não muda nem audita", async () => {
    const e = novo();
    const d = fakeDb(e);
    await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: true, motivo: MOTIVO }, d);
    const r = await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: true, motivo: MOTIVO }, d);
    expect(r).toMatchObject({ ok: true, mudou: false, descontoCentavos: 0 });
    expect(e.audits.length).toBe(1);
  });
  test("desmarcar: volta o desconto (cartão + dispute fee) e audita", async () => {
    const e = novo({ ajuste: null });
    const d = fakeDb(e);
    await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: true, motivo: MOTIVO }, d);
    const r = await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: false, motivo: "Marcado por engano no chargeback" }, d);
    expect(r).toMatchObject({ ok: true, mudou: true, falhaBion: false, descontoCentavos: 2100 });
    expect([e.cb!.falhaBion, e.cb!.falhaBionMotivo, e.cb!.falhaBionPorId, e.cb!.falhaBionEm]).toEqual([false, null, null, null]);
    expect(e.audits.map((a) => a.data.acao)).toEqual(["CHARGEBACK_FALHA_BION_MARCADA", "CHARGEBACK_FALHA_BION_DESMARCADA"]);
  });
  test("sem marcação o desconto continua", async () => {
    const e = novo();
    expect(descontoChargebackCentavos(e.cb!)).toBe(2100);
    expect(e.ajuste).not.toBe(null);
  });
  test("desconto já num repasse: 409 e nada muda", async () => {
    const e = novo({ ajuste: { id: "aj1", repasseId: "rp1" } });
    const r = await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: true, motivo: MOTIVO }, fakeDb(e));
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "repasse_liquidado" });
    expect([e.cb!.falhaBion, e.ajuste?.id, e.audits.length]).toEqual([false, "aj1", 0]);
  });
  test("falha na auditoria: rollback e 503", async () => {
    const e = novo();
    const r = await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: true, motivo: MOTIVO }, fakeDb(e, true));
    expect(r).toMatchObject({ ok: false, status: 503, codigo: "auditoria_indisponivel" });
    expect([e.cb!.falhaBion, e.cb!.falhaBionMotivo, e.ajuste?.id]).toEqual([false, null, "aj1"]);
  });
  test("chargeback inexistente: 404", async () => {
    const r = await marcarFalhaBion({ chargebackId: "x", admin, falhaBion: true, motivo: MOTIVO }, fakeDb(novo({ cb: null })));
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});

describe("registrarDisputaStripe", () => {
  test("cria com médico, taxa do cartão e dispute fee; update não mexe na marcação", async () => {
    let arg: any = null;
    const d = {
      pagamento: { findFirst: async () => ({ id: "pg1", consultaId: "c1", stripeTaxaCentavos: 600, consulta: { medicoId: "m1" }, pedidoRenovacao: null }) },
      chargeback: { upsert: async (a: unknown) => { arg = a; return {}; } },
    };
    await registrarDisputaStripe({ id: "dp_1", amount: 15000, status: "needs_response", reason: "fraudulent", charge: "ch_1", balance_transactions: [{ fee: 1500 }] }, d as any);
    expect(arg.create).toMatchObject({ stripeDisputeId: "dp_1", pagamentoId: "pg1", medicoId: "m1", valorCentavos: 15000, taxaDisputaCentavos: 1500, taxaCartaoCentavos: 600 });
    expect(Object.keys(arg.update).some((k) => k.startsWith("falhaBion"))).toBe(false);
  });
});

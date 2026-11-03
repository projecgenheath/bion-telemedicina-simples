/** Chargeback + "falha da BION". Rodar: bun --conditions=react-server test ./src/lib/server/chargeback.teste.ts */
import { describe, expect, test } from "bun:test";
import { registrarCreditoDevolvido, type DbCredito, composicaoDescontoChargeback, descontoChargebackCentavos, marcarFalhaBion, registrarDisputaStripe, taxaDaDisputa, validarPedidoFalhaBion, type DbChargeback, type DbDisputa } from "./chargeback";

type Estado = {
  cb: { id: string; falhaBion: boolean; falhaBionMotivo: string | null; falhaBionPorId: string | null; falhaBionEm: Date | null; medicoId: string; statusStripe: string; taxaDisputaCentavos: number | null } | null;
  ajuste: { id: string; repasseId: string | null } | null;
  audits: { data: Record<string, unknown> }[];
};
const novo = (x: Partial<Estado> = {}): Estado => ({
  cb: { id: "cb1", falhaBion: false, falhaBionMotivo: null, falhaBionPorId: null, falhaBionEm: null, medicoId: "m1", statusStripe: "needs_response", taxaDisputaCentavos: 1500 },
  ajuste: { id: "aj1", repasseId: null },
  audits: [],
  ...x,
});
/** Transação falsa: em erro, volta ao estado anterior (rollback). */
let travas: string[] = [];
function fakeDb(e: Estado, auditFalha = false, corrida = false): DbChargeback {
  return {
    async $transaction(fn) {
      const antes = structuredClone(e);
      const tx = {
        $queryRaw: async (q: TemplateStringsArray, ...v: unknown[]) => { travas.push(`${q.join("?")}|${v.join(",")}`); return []; },
        chargeback: {
          findUnique: async () => (e.cb ? { ...e.cb } : null),
          update: async (a: any) => { Object.assign(e.cb!, a.data); return {}; },
        },
        repasseAjuste: {
          findFirst: async () => { const r = e.ajuste ? { ...e.ajuste } : null; if (corrida && e.ajuste) e.ajuste.repasseId = "rp_corrida"; return r; },
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

const cbD = (x = {}) => ({ falhaBion: false, medicoId: "m1", statusStripe: "lost", taxaDisputaCentavos: 1500, ...x });
describe("desconto", () => {
  test("sem dupla taxa do cartão: só a dispute fee", () => {
    expect(descontoChargebackCentavos(cbD())).toBe(1500);
    expect(composicaoDescontoChargeback(cbD())).toEqual({ taxaDisputaCentavos: 1500, taxaCartaoCentavos: 0, valorDisputadoCentavos: 0, totalCentavos: 1500 });
  });
  test("falha da BION: zero", () => expect(descontoChargebackCentavos(cbD({ falhaBion: true }))).toBe(0));
  test("disputa ganha: zero", () => expect(descontoChargebackCentavos(cbD({ statusStripe: "won" }))).toBe(0));
  test("sem médico (multa só da BION): zero", () => expect(descontoChargebackCentavos(cbD({ medicoId: null }))).toBe(0));
  test("fee ausente conta 0", () => expect(descontoChargebackCentavos(cbD({ taxaDisputaCentavos: null }))).toBe(0));
  test("fee líquida: devolução negativa abate, nunca < 0", () => {
    expect(taxaDaDisputa([{ fee: 1500 }, { fee: -1500 }])).toBe(0);
    expect(taxaDaDisputa([{ fee: 1500 }, { fee: -2000 }])).toBe(0);
    expect(taxaDaDisputa([{ fee: 1500 }, { fee: 0 }])).toBe(1500);
  });
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
    expect(r).toMatchObject({ ok: true, mudou: true, falhaBion: false, descontoCentavos: 1500 });
    expect([e.cb!.falhaBion, e.cb!.falhaBionMotivo, e.cb!.falhaBionPorId, e.cb!.falhaBionEm]).toEqual([false, null, null, null]);
    expect(e.audits.map((a) => a.data.acao)).toEqual(["CHARGEBACK_FALHA_BION_MARCADA", "CHARGEBACK_FALHA_BION_DESMARCADA"]);
  });
  test("sem marcação o desconto continua", async () => {
    const e = novo();
    expect(descontoChargebackCentavos(e.cb!)).toBe(1500);
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
  test("trava a linha do Chargeback FOR UPDATE antes de ler", async () => {
    travas = [];
    await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: true, motivo: MOTIVO }, fakeDb(novo()));
    expect(travas.length).toBe(1);
    expect(travas[0]).toContain("FOR UPDATE");
    expect(travas[0]).toContain("cb1");
  });
  test("corrida: ajuste aplicado entre leitura e delete → 409 e nada muda", async () => {
    const e = novo();
    const r = await marcarFalhaBion({ chargebackId: "cb1", admin, falhaBion: true, motivo: MOTIVO }, fakeDb(e, false, true));
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "repasse_liquidado" });
    expect([e.cb!.falhaBion, e.audits.length, e.ajuste?.repasseId]).toEqual([false, 0, "rp_corrida"]);
  });
  test("chargeback inexistente: 404", async () => {
    const r = await marcarFalhaBion({ chargebackId: "x", admin, falhaBion: true, motivo: MOTIVO }, fakeDb(novo({ cb: null })));
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});

type EstD = { cb: any; ajuste: { id: string; repasseId: string | null } | null; pag: any; rem: any };
function fakeDisputa(e: EstD, corrida = false): DbDisputa {
  return {
    async $transaction(fn) {
      return fn({
        $queryRaw: async (q: TemplateStringsArray, ...v: unknown[]) => { travas.push(`${q.join("?")}|${v.join(",")}`); return []; },
        pagamento: { findFirst: async () => e.pag },
        remarcacaoPendente: { findFirst: async (a: any) => (e.rem && a.where.gatewayRef === e.rem.gatewayRef ? e.rem : null) },
        chargeback: {
          findUnique: async () => (e.cb ? { ...e.cb } : null),
          create: async (a: any) => { e.cb = { id: "cb1", falhaBion: false, creditoPendente: false, ...a.data }; return { id: "cb1" }; },
          update: async (a: any) => { Object.assign(e.cb, a.data); return {}; },
        },
        repasseAjuste: {
          findFirst: async () => { const r = e.ajuste ? { ...e.ajuste } : null; if (corrida && e.ajuste) e.ajuste.repasseId = "rp_corrida"; return r; },
          deleteMany: async () => { const n = e.ajuste && !e.ajuste.repasseId ? 1 : 0; if (n) e.ajuste = null; return { count: n }; },
        },
      } as any);
    },
  };
}
const ev = (id: string, created: number, status: string, bts: { fee: number }[] = [{ fee: 1500 }], extra = {}) => ({
  id, created, type: "charge.dispute.updated",
  data: { object: { id: "dp_1", amount: 15000, status, reason: "fraudulent", charge: "ch_1", payment_intent: "pi_1", balance_transactions: bts, ...extra } },
});
const pagC = { id: "pg1", consultaId: "c1", consulta: { medicoId: "m1" }, pedidoRenovacao: null };

describe("registrarDisputaStripe", () => {
  test("cria com médico e dispute fee", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: pagC, rem: null };
    expect(await registrarDisputaStripe(ev("evt_1", 100, "needs_response"), fakeDisputa(e))).toBe("criada");
    expect(e.cb).toMatchObject({ stripeDisputeId: "dp_1", medicoId: "m1", taxaDisputaCentavos: 1500, ultimoEventoId: "evt_1" });
    expect("taxaCartaoCentavos" in e.cb).toBe(false);
  });
  test("evento repetido ignorado", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: pagC, rem: null };
    const d = fakeDisputa(e);
    await registrarDisputaStripe(ev("evt_1", 100, "needs_response"), d);
    expect(await registrarDisputaStripe(ev("evt_1", 100, "under_review"), d)).toBe("repetido");
    expect(e.cb.statusStripe).toBe("needs_response");
  });
  test("updated atrasado depois de closed é ignorado", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: pagC, rem: null };
    const d = fakeDisputa(e);
    await registrarDisputaStripe(ev("evt_1", 100, "needs_response"), d);
    await registrarDisputaStripe(ev("evt_3", 300, "lost"), d);
    expect(await registrarDisputaStripe(ev("evt_2", 200, "under_review"), d)).toBe("fora_de_ordem");
    expect(await registrarDisputaStripe(ev("evt_4", 400, "under_review"), d)).toBe("fora_de_ordem"); // final não volta
    expect(e.cb.statusStripe).toBe("lost");
  });
  test("ganha: desconto 0 e pendente removido; fee devolvida zera", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: pagC, rem: null };
    const d = fakeDisputa(e);
    await registrarDisputaStripe(ev("evt_1", 100, "needs_response"), d);
    e.ajuste = { id: "aj1", repasseId: null };
    await registrarDisputaStripe(ev("evt_2", 200, "won", [{ fee: 1500 }, { fee: -1500 }]), d);
    expect([e.cb.statusStripe, e.cb.taxaDisputaCentavos, e.ajuste, e.cb.creditoPendente]).toEqual(["won", 0, null, false]);
    expect(descontoChargebackCentavos(e.cb)).toBe(0);
  });
  test("ganha depois do repasse: creditoPendente", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: pagC, rem: null };
    const d = fakeDisputa(e);
    await registrarDisputaStripe(ev("evt_1", 100, "needs_response"), d);
    e.ajuste = { id: "aj1", repasseId: "rp1" };
    await registrarDisputaStripe(ev("evt_2", 200, "won"), d);
    expect([e.cb.creditoPendente, e.ajuste?.id]).toEqual([true, "aj1"]);
  });
  test("corrida: ganha com ajuste aplicado entre leitura e delete → creditoPendente", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: pagC, rem: null };
    await registrarDisputaStripe(ev("evt_1", 100, "needs_response"), fakeDisputa(e));
    e.ajuste = { id: "aj1", repasseId: null };
    travas = [];
    await registrarDisputaStripe(ev("evt_2", 200, "won"), fakeDisputa(e, true));
    expect([e.cb.creditoPendente, e.ajuste?.repasseId]).toEqual([true, "rp_corrida"]);
    expect(travas[0]).toContain("FOR UPDATE");
    expect(travas[0]).toContain("dp_1");
  });
  test("multa de remarcação: médico pela RemarcacaoPendente", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: null, rem: { gatewayRef: "stripe_pi:pi_1", consultaId: "c9", consulta: { medicoId: "m9" } } };
    await registrarDisputaStripe(ev("evt_1", 100, "needs_response"), fakeDisputa(e));
    expect([e.cb.medicoId, e.cb.consultaId, e.cb.pagamentoId]).toEqual(["m9", "c9", null]);
  });
  test("multa sem médico: medicoId nulo e nenhum desconto", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: null, rem: null };
    await registrarDisputaStripe(ev("evt_1", 100, "lost"), fakeDisputa(e));
    expect(e.cb.medicoId).toBe(null);
    expect(descontoChargebackCentavos(e.cb)).toBe(0);
  });
  test("update nunca mexe na marcação", async () => {
    const e: EstD = { cb: null, ajuste: null, pag: pagC, rem: null };
    const d = fakeDisputa(e);
    await registrarDisputaStripe(ev("evt_1", 100, "needs_response"), d);
    e.cb.falhaBion = true;
    await registrarDisputaStripe(ev("evt_2", 200, "lost"), d);
    expect(e.cb.falhaBion).toBe(true);
  });
});

function fakeCredito(cb: any, auditFalha = false): DbCredito & { audits: unknown[] } {
  const audits: unknown[] = [];
  return {
    audits,
    async $transaction(fn) {
      const antes = cb ? { ...cb } : null;
      try {
        return await fn({
          $queryRaw: async () => [],
          chargeback: { findUnique: async () => (cb ? { ...cb } : null), update: async (a: any) => { Object.assign(cb, a.data); return {}; } },
          auditLog: { create: async (a: unknown) => { if (auditFalha) throw new Error("x"); audits.push(a); return {}; } },
        } as any);
      } catch (err) { if (cb && antes) { for (const k of Object.keys(cb)) delete cb[k]; Object.assign(cb, antes); } throw err; }
    },
  } as any;
}
describe("crédito devolvido", () => {
  test("limpa creditoPendente, grava quem/quando/por quê e audita", async () => {
    const cb: any = { id: "cb1", creditoPendente: true, creditoDevolvidoEm: null };
    const d = fakeCredito(cb);
    expect(await registrarCreditoDevolvido({ chargebackId: "cb1", admin, motivo: "PIX manual de R$ 15,00 em 03/11" }, d)).toEqual({ ok: true, mudou: true });
    expect([cb.creditoPendente, cb.creditoDevolvidoPorId, cb.creditoDevolvidoMotivo]).toEqual([false, "adm1", "PIX manual de R$ 15,00 em 03/11"]);
    expect(d.audits.length).toBe(1);
    expect(await registrarCreditoDevolvido({ chargebackId: "cb1", admin, motivo: "PIX manual de R$ 15,00 em 03/11" }, d)).toEqual({ ok: true, mudou: false });
  });
  test("sem crédito pendente: 409", async () => {
    const r = await registrarCreditoDevolvido({ chargebackId: "cb1", admin, motivo: "PIX manual de R$ 15,00" }, fakeCredito({ id: "cb1", creditoPendente: false, creditoDevolvidoEm: null }));
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "sem_credito_pendente" });
  });
  test("auditoria falha: rollback e 503", async () => {
    const cb: any = { id: "cb1", creditoPendente: true, creditoDevolvidoEm: null };
    const r = await registrarCreditoDevolvido({ chargebackId: "cb1", admin, motivo: "PIX manual de R$ 15,00" }, fakeCredito(cb, true));
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(cb.creditoPendente).toBe(true);
  });
});

/**
 * Taxas do chargeback no modo plataforma (alternativa B, decisão 27/11,
 * migração 20261127c): cobrança por reversão/desconto e consumo da dívida no
 * envio da TransferenciaMedico.
 * Rodar: bun --conditions=react-server test ./src/lib/server/chargeback-taxas.teste.ts
 */
import { describe, expect, test } from "bun:test";
import {
  ajustarDescontoChargeback, chaveIdempotenciaTaxasPlataforma, cobrarTaxasChargebackPlataforma, estornarDescontoChargeback,
  type DbDesconto, type DbTaxas, type StripeTaxas, type TxDesconto,
} from "./chargeback";

/* ------------------------------------------------------------------ */
/* Fake da cobrança (cobrarTaxasChargebackPlataforma)                  */
/* ------------------------------------------------------------------ */

type Cb = {
  id: string; falhaBion: boolean; medicoId: string | null; statusStripe: string; stripeConta: string | null;
  taxaDisputaCentavos: number | null; pagamentoId: string | null; remarcacaoId: string | null;
  taxasPlataformaStatus: string | null; taxasPlataformaCentavos: number | null;
  taxasPlataformaReversalId?: string | null; taxasPlataformaReversalCentavos: number | null;
  taxasPlataformaDescontadoCentavos: number; taxasPlataformaErro?: string | null; taxasPlataformaEm?: Date | null;
  creditoPendente?: boolean; creditoDevolvidoEm: Date | null;
};
const cbBase = (x: Partial<Cb> = {}): Cb => ({
  id: "cb1", falhaBion: false, medicoId: "m1", statusStripe: "lost", stripeConta: null,
  taxaDisputaCentavos: 1500, pagamentoId: "pg1", remarcacaoId: null,
  taxasPlataformaStatus: null, taxasPlataformaCentavos: null,
  taxasPlataformaReversalCentavos: null, taxasPlataformaDescontadoCentavos: 0,
  creditoDevolvidoEm: null, ...x,
});
type EstCobranca = {
  cb: Cb | null;
  transfer: { id: string; liquidoCentavos: number; descontoChargebackCentavos: number; stripeTransferId: string | null } | null;
  reversoesReembolso: number[]; // reversões de reembolso da mesma cobrança
  reversoesOutrosCb: number[]; // reversões de taxas de OUTROS chargebacks
};
const est = (x: Partial<EstCobranca> = {}): EstCobranca => ({ cb: cbBase(), transfer: null, reversoesReembolso: [], reversoesOutrosCb: [], ...x });

function fakeCobranca(e: EstCobranca) {
  const travas: string[] = [];
  const d = {
    async $transaction(fn: (tx: unknown) => Promise<unknown>) {
      const tx = {
        $queryRaw: async (q: TemplateStringsArray, ...v: unknown[]) => { travas.push(`${q.join("?")}|${v.join(",")}`); return []; },
        chargeback: {
          findUnique: async () => (e.cb ? { ...e.cb } : null),
          findMany: async () => e.reversoesOutrosCb.map((v) => ({ taxasPlataformaReversalCentavos: v })),
          update: async (a: any) => { Object.assign(e.cb!, a.data); return {}; },
          updateMany: async (a: any) => {
            const st = e.cb?.taxasPlataformaStatus ?? null;
            const notIn: string[] = a.where.taxasPlataformaStatus?.notIn ?? [];
            const not: string | undefined = a.where.taxasPlataformaStatus?.not;
            if (e.cb && !notIn.includes(st ?? "") && st !== not) { Object.assign(e.cb, a.data); return { count: 1 }; }
            return { count: 0 };
          },
        },
        transferenciaMedico: { findFirst: async () => (e.transfer ? { ...e.transfer } : null) },
        reembolso: { findMany: async () => e.reversoesReembolso.map((v) => ({ stripeReversalValorCentavos: v })) },
      };
      return fn(tx);
    },
    chargeback: {
      updateMany: async (a: any) => {
        const st = e.cb?.taxasPlataformaStatus ?? null;
        const notIn: string[] = a.where.taxasPlataformaStatus?.notIn ?? [];
        if (e.cb && !notIn.includes(st ?? "")) { Object.assign(e.cb, a.data); return { count: 1 }; }
        return { count: 0 };
      },
    },
  } as unknown as DbTaxas;
  return { d, travas };
}

function fakeStripeTaxas(o: { existentes?: { id: string; amount: number; metadata?: Record<string, string> }[]; erro?: Error; amount?: number } = {}) {
  const chamadas: { metodo: string; args: unknown[] }[] = [];
  const s = {
    transfers: {
      listReversals: async (transferId: string, p: unknown) => { chamadas.push({ metodo: "listReversals", args: [transferId, p] }); return { data: o.existentes ?? [] }; },
      createReversal: async (transferId: string, p: any, op: any) => {
        chamadas.push({ metodo: "createReversal", args: [transferId, p, op] });
        if (o.erro) throw o.erro;
        return { id: "trr_1", amount: o.amount ?? p.amount };
      },
    },
  } as unknown as StripeTaxas;
  return { s, chamadas };
}

const audits: { acao: string; severidade?: string; detalhes: string }[] = [];
const audit = (async (_u: unknown, dados: any) => { audits.push(dados); }) as never;
const AGORA = new Date("2026-11-27T12:00:00Z");
const enviada = (x: Partial<NonNullable<EstCobranca["transfer"]>> = {}) => ({ id: "t1", liquidoCentavos: 17300, descontoChargebackCentavos: 0, stripeTransferId: "tr_1", ...x });

describe("cobrarTaxasChargebackPlataforma — guardas", () => {
  test("inexistente", async () => {
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(est({ cb: null })).d, audit });
    expect(r).toEqual({ cobrado: false, motivo: "nao_encontrado" });
  });
  test("cobrança direta (legado): não cobra por aqui", async () => {
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(est({ cb: cbBase({ stripeConta: "acct_m" }) })).d, audit });
    expect(r).toEqual({ cobrado: false, motivo: "nao_plataforma" });
  });
  test("sem médico", async () => {
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(est({ cb: cbBase({ medicoId: null }) })).d, audit });
    expect(r).toEqual({ cobrado: false, motivo: "sem_medico" });
  });
  test("falha da BION", async () => {
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(est({ cb: cbBase({ falhaBion: true }) })).d, audit });
    expect(r).toEqual({ cobrado: false, motivo: "falha_bion" });
  });
  test("disputa não perdida: aguarda desfecho", async () => {
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(est({ cb: cbBase({ statusStripe: "needs_response" }) })).d, audit });
    expect(r).toEqual({ cobrado: false, motivo: "aguardando_desfecho" });
  });
  test("sem taxa de contestação: sem_taxa gravado", async () => {
    const e = est({ cb: cbBase({ taxaDisputaCentavos: null }) });
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, audit });
    expect(r).toEqual({ cobrado: false, motivo: "sem_taxa" });
    expect(e.cb!.taxasPlataformaStatus).toBe("sem_taxa");
  });
  test("já quitado não repete", async () => {
    const e = est({ cb: cbBase({ taxasPlataformaStatus: "quitado", taxasPlataformaCentavos: 1500, taxasPlataformaReversalCentavos: 1500 }) });
    const { s, chamadas } = fakeStripeTaxas();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit });
    expect(r).toEqual({ cobrado: false, motivo: "ja_cobrado" });
    expect(chamadas.length).toBe(0);
  });
  test("cancelado (ganha/falha da BION) não cobra", async () => {
    const e = est({ cb: cbBase({ taxasPlataformaStatus: "cancelado", taxasPlataformaCentavos: 1500 }) });
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, audit });
    expect(r).toEqual({ cobrado: false, motivo: "cancelado" });
    expect(e.cb!.taxasPlataformaStatus).toBe("cancelado");
  });
  test("pendente (em andamento) não duplica", async () => {
    const e = est({ cb: cbBase({ taxasPlataformaStatus: "pendente", taxasPlataformaCentavos: 1500 }) });
    const { s, chamadas } = fakeStripeTaxas();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit });
    expect(r).toEqual({ cobrado: false, motivo: "em_andamento" });
    expect(chamadas.length).toBe(0);
  });
  test("trava FOR UPDATE antes de ler", async () => {
    const { d, travas } = fakeCobranca(est());
    await cobrarTaxasChargebackPlataforma("cb1", { d, audit });
    expect(travas[0]).toContain("FOR UPDATE");
    expect(travas[0]).toContain("cb1");
  });
});

describe("cobrarTaxasChargebackPlataforma — desconto futuro", () => {
  test("sem transferência enviada: dívida registrada e auditada", async () => {
    audits.length = 0;
    const e = est();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, audit, agora: AGORA });
    expect(r).toEqual({ cobrado: true, via: "desconto_futuro", valorCentavos: 1500 });
    expect([e.cb!.taxasPlataformaStatus, e.cb!.taxasPlataformaCentavos, e.cb!.taxasPlataformaEm]).toEqual(["aguardando_desconto", 1500, AGORA]);
    expect(audits.map((a) => a.acao)).toEqual(["CHARGEBACK_TAXAS_DESCONTO_REGISTRADO"]);
  });
  test("multa de remarcação: acha a transferência pelo remarcacaoId", async () => {
    const e = est({ cb: cbBase({ pagamentoId: null, remarcacaoId: "rem1" }), transfer: enviada({ liquidoCentavos: 4500 }) });
    const { s, chamadas } = fakeStripeTaxas();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit });
    expect(r).toMatchObject({ cobrado: true, via: "reversao", valorCentavos: 1500 });
    expect(chamadas.find((c) => c.metodo === "createReversal")?.args[0]).toBe("tr_1");
  });
  test("retentativa depois de falha desconta o que já foi abatido", async () => {
    const e = est({ cb: cbBase({ taxasPlataformaStatus: "falhou", taxasPlataformaCentavos: 1500, taxasPlataformaDescontadoCentavos: 500 }) });
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, audit });
    expect(r).toEqual({ cobrado: true, via: "desconto_futuro", valorCentavos: 1000 });
  });
  test("dívida congelada: fee nova não muda o valor da 1ª tentativa", async () => {
    const e = est({ cb: cbBase({ taxasPlataformaStatus: "falhou", taxasPlataformaCentavos: 1500, taxaDisputaCentavos: 2500 }) });
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, audit });
    expect(r).toEqual({ cobrado: true, via: "desconto_futuro", valorCentavos: 1500 });
    expect(e.cb!.taxasPlataformaCentavos).toBe(1500);
  });
  test("tudo já abatido: fecha como quitado sem cobrar de novo", async () => {
    const e = est({ cb: cbBase({ taxasPlataformaStatus: "aguardando_desconto", taxasPlataformaCentavos: 1500, taxasPlataformaDescontadoCentavos: 1500 }) });
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, audit });
    expect(r).toEqual({ cobrado: false, motivo: "ja_cobrado" });
    expect(e.cb!.taxasPlataformaStatus).toBe("quitado");
  });
});

describe("cobrarTaxasChargebackPlataforma — reversão", () => {
  test("transferência enviada: reversão integral com Idempotency-Key e metadata", async () => {
    audits.length = 0;
    const e = est({ transfer: enviada() });
    const { s, chamadas } = fakeStripeTaxas();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit, agora: AGORA });
    expect(r).toEqual({ cobrado: true, via: "reversao", reversalId: "trr_1", valorCentavos: 1500, restanteCentavos: 0 });
    const create = chamadas.find((c) => c.metodo === "createReversal")!.args;
    expect(create[0]).toBe("tr_1");
    expect((create[1] as any).amount).toBe(1500);
    expect((create[1] as any).metadata).toEqual({ chargebackId: "cb1", tipo: "chargeback_taxas_plataforma" });
    expect((create[2] as any).idempotencyKey).toBe(chaveIdempotenciaTaxasPlataforma("cb1", 1500));
    expect([e.cb!.taxasPlataformaStatus, e.cb!.taxasPlataformaReversalId, e.cb!.taxasPlataformaReversalCentavos]).toEqual(["quitado", "trr_1", 1500]);
    expect(audits.map((a) => a.acao)).toEqual(["CHARGEBACK_TAXAS_REVERTIDAS"]);
  });
  test("líquido menor que a taxa: reverte o que cabe, resto vira dívida", async () => {
    const e = est({ transfer: enviada({ liquidoCentavos: 1000 }) });
    const { s } = fakeStripeTaxas();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit });
    expect(r).toEqual({ cobrado: true, via: "reversao", reversalId: "trr_1", valorCentavos: 1000, restanteCentavos: 500 });
    expect([e.cb!.taxasPlataformaStatus, e.cb!.taxasPlataformaReversalCentavos]).toEqual(["aguardando_desconto", 1000]);
  });
  test("reversões de reembolso da mesma cobrança limitam a reversão", async () => {
    const e = est({ transfer: enviada(), reversoesReembolso: [16500] });
    const { s } = fakeStripeTaxas();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit });
    expect(r).toMatchObject({ via: "reversao", valorCentavos: 800, restanteCentavos: 700 });
  });
  test("reversões de outros chargebacks e desconto já aplicado também limitam", async () => {
    const e = est({ transfer: enviada({ descontoChargebackCentavos: 300 }), reversoesOutrosCb: [16000] });
    const { s } = fakeStripeTaxas();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit });
    expect(r).toMatchObject({ via: "reversao", valorCentavos: 1000, restanteCentavos: 500 });
  });
  test("nada resta para reverter: dívida inteira em recebimentos futuros", async () => {
    const e = est({ transfer: enviada(), reversoesReembolso: [17300] });
    const { s, chamadas } = fakeStripeTaxas();
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit });
    expect(r).toEqual({ cobrado: true, via: "desconto_futuro", valorCentavos: 1500 });
    expect(chamadas.length).toBe(0);
  });
  test("reversão anterior no metadata é reaproveitada (chave expira em 24 h)", async () => {
    const e = est({ transfer: enviada() });
    const { s, chamadas } = fakeStripeTaxas({ existentes: [{ id: "trr_antigo", amount: 1500, metadata: { chargebackId: "cb1", tipo: "chargeback_taxas_plataforma" } }] });
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit });
    expect(r).toMatchObject({ via: "reversao", reversalId: "trr_antigo" });
    expect(chamadas.some((c) => c.metodo === "createReversal")).toBe(false);
    expect(e.cb!.taxasPlataformaStatus).toBe("quitado");
  });
  test("erro do Stripe: falhou + auditoria critical + relança (webhook reentrega)", async () => {
    audits.length = 0;
    const e = est({ transfer: enviada() });
    const { s } = fakeStripeTaxas({ erro: new Error("saldo insuficiente") });
    await expect(cobrarTaxasChargebackPlataforma("cb1", { d: fakeCobranca(e).d, s, audit })).rejects.toThrow("saldo insuficiente");
    expect([e.cb!.taxasPlataformaStatus, e.cb!.taxasPlataformaErro]).toEqual(["falhou", "saldo insuficiente"]);
    expect(audits.map((a) => [a.acao, a.severidade])).toEqual([["CHARGEBACK_TAXAS_REVERSAO_FALHOU", "critical"]]);
  });
  test("disputa ganha enquanto o Stripe respondia: creditoPendente e nada mais cobrado", async () => {
    const e = est({ transfer: enviada() });
    const { d } = fakeCobranca(e);
    // Simula a virada lost→won entre o preparo e a gravação final.
    const sComVirada = {
      transfers: {
        listReversals: async () => ({ data: [] }),
        createReversal: async (_t: string, p: any) => { e.cb!.statusStripe = "won"; return { id: "trr_1", amount: p.amount }; },
      },
    } as unknown as StripeTaxas;
    const r = await cobrarTaxasChargebackPlataforma("cb1", { d, s: sComVirada, audit });
    expect(r).toMatchObject({ via: "reversao", valorCentavos: 1500 });
    expect([e.cb!.taxasPlataformaStatus, e.cb!.creditoPendente, e.cb!.taxasPlataformaReversalCentavos]).toEqual(["cancelado", true, 1500]);
  });
});

/* ------------------------------------------------------------------ */
/* Fake do consumo (ajustarDescontoChargeback / estornar)              */
/* ------------------------------------------------------------------ */

type Debito = { id: string; statusStripe: string; falhaBion: boolean; taxasPlataformaStatus: string | null; taxasPlataformaCentavos: number | null; taxasPlataformaReversalCentavos: number | null; taxasPlataformaDescontadoCentavos: number };
const deb = (id: string, centavos: number, x: Partial<Debito> = {}): Debito => ({
  id, statusStripe: "lost", falhaBion: false, taxasPlataformaStatus: "aguardando_desconto",
  taxasPlataformaCentavos: centavos, taxasPlataformaReversalCentavos: null, taxasPlataformaDescontadoCentavos: 0, ...x,
});
type EstConsumo = { descontoGravado: number; cbs: Debito[] }; // cbs em ordem de criação (asc)
function fakeConsumo(e: EstConsumo) {
  const chamadas: { metodo: string; args: any }[] = [];
  const tx = {
    $queryRaw: async () => [],
    transferenciaMedico: {
      findUnique: async () => ({ id: "t1", descontoChargebackCentavos: e.descontoGravado }),
      update: async (a: any) => { chamadas.push({ metodo: "updateTransfer", args: a }); e.descontoGravado = a.data.descontoChargebackCentavos; return {}; },
    },
    chargeback: {
      findUnique: async (a: any) => { const c = e.cbs.find((x) => x.id === a.where.id); return c ? { ...c } : null; },
      findMany: async (a: any) => {
        if (a.where.taxasPlataformaDescontadoCentavos?.gt === 0) {
          return [...e.cbs].reverse().filter((c) => c.taxasPlataformaDescontadoCentavos > 0).map((c) => ({ id: c.id }));
        }
        const statuses: string[] = a.where.taxasPlataformaStatus?.in ?? [];
        return e.cbs.filter((c) => statuses.includes(c.taxasPlataformaStatus ?? "")).map((c) => ({ id: c.id }));
      },
      update: async (a: any) => { chamadas.push({ metodo: "updateCb", args: a }); Object.assign(e.cbs.find((x) => x.id === a.where.id)!, a.data); return {}; },
    },
  };
  const d = { $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) } as unknown as DbDesconto;
  return { d, tx: tx as unknown as TxDesconto, chamadas };
}

describe("ajustarDescontoChargeback", () => {
  test("sem dívida: zero, nada gravado", async () => {
    const { d, chamadas } = fakeConsumo({ descontoGravado: 0, cbs: [] });
    expect(await ajustarDescontoChargeback("t1", "m1", 17300, { d })).toBe(0);
    expect(chamadas.length).toBe(0);
  });
  test("dívida menor que o líquido: consome tudo e quita", async () => {
    const e: EstConsumo = { descontoGravado: 0, cbs: [deb("cb1", 1500)] };
    const { d } = fakeConsumo(e);
    expect(await ajustarDescontoChargeback("t1", "m1", 17300, { d })).toBe(1500);
    expect([e.cbs[0].taxasPlataformaStatus, e.cbs[0].taxasPlataformaDescontadoCentavos, e.descontoGravado]).toEqual(["quitado", 1500, 1500]);
  });
  test("dívida maior que o líquido: consome o líquido e segue aguardando", async () => {
    const e: EstConsumo = { descontoGravado: 0, cbs: [deb("cb1", 20000)] };
    const { d } = fakeConsumo(e);
    expect(await ajustarDescontoChargeback("t1", "m1", 17300, { d })).toBe(17300);
    expect([e.cbs[0].taxasPlataformaStatus, e.cbs[0].taxasPlataformaDescontadoCentavos]).toEqual(["aguardando_desconto", 17300]);
  });
  test("duas dívidas: mais antiga primeiro, parcial na mais nova", async () => {
    const e: EstConsumo = { descontoGravado: 0, cbs: [deb("cb_velho", 1000), deb("cb_novo", 1000)] };
    const { d } = fakeConsumo(e);
    expect(await ajustarDescontoChargeback("t1", "m1", 1500, { d })).toBe(1500);
    expect([e.cbs[0].taxasPlataformaStatus, e.cbs[0].taxasPlataformaDescontadoCentavos]).toEqual(["quitado", 1000]);
    expect([e.cbs[1].taxasPlataformaStatus, e.cbs[1].taxasPlataformaDescontadoCentavos]).toEqual(["aguardando_desconto", 500]);
  });
  test("dívida 'falhou' também é descontada; cancelada/pendente não", async () => {
    const e: EstConsumo = { descontoGravado: 0, cbs: [deb("cb_falhou", 800, { taxasPlataformaStatus: "falhou" }), deb("cb_cancelado", 900, { taxasPlataformaStatus: "cancelado" }), deb("cb_pendente", 900, { taxasPlataformaStatus: "pendente" })] };
    const { d } = fakeConsumo(e);
    expect(await ajustarDescontoChargeback("t1", "m1", 17300, { d })).toBe(800);
    expect(e.cbs[1].taxasPlataformaDescontadoCentavos).toBe(0);
    expect(e.cbs[2].taxasPlataformaDescontadoCentavos).toBe(0);
  });
  test("desconto já gravado é reaproveitado (crash entre gravar e enviar)", async () => {
    const e: EstConsumo = { descontoGravado: 1500, cbs: [deb("cb1", 1500, { taxasPlataformaStatus: "quitado", taxasPlataformaDescontadoCentavos: 1500 })] };
    const { d, chamadas } = fakeConsumo(e);
    expect(await ajustarDescontoChargeback("t1", "m1", 17300, { d })).toBe(1500);
    expect(chamadas.length).toBe(0);
  });
  test("líquido caiu abaixo do desconto gravado: excesso volta ao chargeback", async () => {
    const e: EstConsumo = { descontoGravado: 1500, cbs: [deb("cb1", 1500, { taxasPlataformaStatus: "quitado", taxasPlataformaDescontadoCentavos: 1500 })] };
    const { d } = fakeConsumo(e);
    expect(await ajustarDescontoChargeback("t1", "m1", 800, { d })).toBe(800);
    expect([e.descontoGravado, e.cbs[0].taxasPlataformaDescontadoCentavos, e.cbs[0].taxasPlataformaStatus]).toEqual([800, 800, "aguardando_desconto"]);
  });
  test("reversão parcial já recuperada conta na quitação", async () => {
    const e: EstConsumo = { descontoGravado: 0, cbs: [deb("cb1", 1500, { taxasPlataformaReversalCentavos: 1000 })] };
    const { d } = fakeConsumo(e);
    expect(await ajustarDescontoChargeback("t1", "m1", 17300, { d })).toBe(500);
    expect([e.cbs[0].taxasPlataformaStatus, e.cbs[0].taxasPlataformaDescontadoCentavos]).toEqual(["quitado", 500]);
  });
});

describe("estornarDescontoChargeback", () => {
  test("devolve o consumo e reabre a dívida (transferência removida antes do envio)", async () => {
    const e: EstConsumo = { descontoGravado: 1500, cbs: [deb("cb1", 1500, { taxasPlataformaStatus: "quitado", taxasPlataformaDescontadoCentavos: 1500 })] };
    const { tx } = fakeConsumo(e);
    await estornarDescontoChargeback(tx, "m1", 1500);
    expect([e.cbs[0].taxasPlataformaDescontadoCentavos, e.cbs[0].taxasPlataformaStatus]).toEqual([0, "aguardando_desconto"]);
  });
  test("disputa ganha: devolve mas NÃO reabre a cobrança", async () => {
    const e: EstConsumo = { descontoGravado: 1500, cbs: [deb("cb1", 1500, { statusStripe: "won", taxasPlataformaStatus: "quitado", taxasPlataformaDescontadoCentavos: 1500 })] };
    const { tx } = fakeConsumo(e);
    await estornarDescontoChargeback(tx, "m1", 1500);
    expect([e.cbs[0].taxasPlataformaDescontadoCentavos, e.cbs[0].taxasPlataformaStatus]).toEqual([0, "quitado"]);
  });
  test("estorno parcial: devolve só o pedido, do mais recente para o mais antigo", async () => {
    const e: EstConsumo = { descontoGravado: 1500, cbs: [deb("cb_velho", 1000, { taxasPlataformaStatus: "quitado", taxasPlataformaDescontadoCentavos: 1000 }), deb("cb_novo", 500, { taxasPlataformaStatus: "quitado", taxasPlataformaDescontadoCentavos: 500 })] };
    const { tx } = fakeConsumo(e);
    await estornarDescontoChargeback(tx, "m1", 700);
    expect(e.cbs[1].taxasPlataformaDescontadoCentavos).toBe(0);
    expect(e.cbs[0].taxasPlataformaDescontadoCentavos).toBe(800);
  });
});

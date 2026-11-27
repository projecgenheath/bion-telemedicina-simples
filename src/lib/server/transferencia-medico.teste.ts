/** Envio da TransferenciaMedico (modelo 21/11). Rodar: npx bun --conditions=react-server test ./src/lib/server/transferencia-medico.teste.ts */
import { describe, expect, test } from "bun:test";
import { enviarTransferencia, transferenciaAtiva, type DbTransferencia, type StripeTransferencia } from "./transferencia-medico";

const ENV = {
  BION_PAGAMENTO_RETIDO: "1",
  BION_PAGAMENTO_STRIPE: "true",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_CONNECT: "true",
  STRIPE_MODO_COBRANCA: "plataforma",
};

type Linha = {
  id: string; tipo: string; status: string; liquidoCentavos: number; descontoChargebackCentavos: number;
  medicoId: string; consultaId: string | null; remarcacaoId: string | null;
  pagamento: { stripeChargeId: string | null; stripePaymentIntentId: string | null } | null;
  remarcacao: { gatewayRef: string | null } | null;
  medico: { perfilMedico: { stripeAccountId: string | null } | null } | null;
};

const linha = (o: Partial<Linha> = {}): Linha => ({
  id: "t1", tipo: "consulta", status: "pendente", liquidoCentavos: 17300, descontoChargebackCentavos: 0,
  medicoId: "m1", consultaId: "c1", remarcacaoId: null,
  pagamento: { stripeChargeId: "ch_1", stripePaymentIntentId: "pi_1" },
  remarcacao: null,
  medico: { perfilMedico: { stripeAccountId: "acct_m" } },
  ...o,
});

function fakeDb(l: Linha) {
  const chamadas: { metodo: string; args: any }[] = [];
  const d = {
    transferenciaMedico: {
      findUnique: async () => l,
      findMany: async () => [{ id: l.id }],
      update: async (a: any) => { chamadas.push({ metodo: "update", args: a }); return {}; },
      updateMany: async (a: any) => { chamadas.push({ metodo: "updateMany", args: a }); return { count: 1 }; },
    },
  } as unknown as DbTransferencia;
  return { d, chamadas };
}

function fakeStripe(o: { existentes?: { id: string; metadata?: Record<string, string> }[]; erro?: Error } = {}) {
  const chamadas: { metodo: string; args: unknown[] }[] = [];
  const s = {
    transfers: {
      list: async (p: unknown) => { chamadas.push({ metodo: "list", args: [p] }); return { data: o.existentes ?? [] }; },
      create: async (p: unknown, op: unknown) => {
        chamadas.push({ metodo: "create", args: [p, op] });
        if (o.erro) throw o.erro;
        return { id: "tr_1" };
      },
    },
    paymentIntents: {
      retrieve: async () => ({ latest_charge: "ch_pi" }),
    },
  } as unknown as StripeTransferencia;
  return { s, chamadas };
}

const audit = (async () => undefined) as never;
// Sem dívida de chargeback por padrão; o consumo real é testado em
// chargeback-taxas.teste.ts (ajustarDescontoChargeback).
const semDesconto = async () => 0;

describe("transferenciaAtiva", () => {
  test("plataforma ligada: ativa", () => expect(transferenciaAtiva(ENV)).toBe(true));
  test("modo direta legado: desligada (não pagar em dobro)", () => expect(transferenciaAtiva({ ...ENV, STRIPE_MODO_COBRANCA: "direta" })).toBe(false));
  test("chave do modelo desligada: não envia", () => expect(transferenciaAtiva({ ...ENV, BION_PAGAMENTO_RETIDO: "0" })).toBe(false));
  test("chave live: desligada", () => expect(transferenciaAtiva({ ...ENV, STRIPE_SECRET_KEY: "sk_live_x" })).toBe(false));
  test("sem Stripe: desligada", () => expect(transferenciaAtiva({ ...ENV, BION_PAGAMENTO_STRIPE: "false" })).toBe(false));
});

describe("enviarTransferencia", () => {
  test("desligada não toca no banco", async () => {
    const { d, chamadas } = fakeDb(linha());
    const r = await enviarTransferencia("t1", { d, env: { ...ENV, STRIPE_MODO_COBRANCA: "direta" }, audit });
    expect(r).toEqual({ enviado: false, motivo: "desligado" });
    expect(chamadas.length).toBe(0);
  });

  test("envia com source_transaction da charge e grava enviada", async () => {
    const l = linha();
    const { d, chamadas } = fakeDb(l);
    const { s, chamadas: sc } = fakeStripe();
    const r = await enviarTransferencia("t1", { d, s, env: ENV, audit, agora: new Date("2026-11-27T12:00:00Z"), ajustarDesconto: semDesconto });
    expect(r).toEqual({ enviado: true, transferId: "tr_1", valorCentavos: 17300 });
    const create = sc.find((c) => c.metodo === "create")?.args;
    expect((create?.[0] as { source_transaction?: string }).source_transaction).toBe("ch_1");
    expect((create?.[0] as { amount: number }).amount).toBe(17300);
    expect((create?.[1] as { idempotencyKey: string }).idempotencyKey).toBe("transferencia-medico-t1");
    const upd = chamadas.find((c) => c.metodo === "updateMany")?.args;
    expect([upd.data.status, upd.data.stripeTransferId, upd.data.enviadaEm]).toEqual(["enviada", "tr_1", new Date("2026-11-27T12:00:00Z")]);
  });

  test("transferência anterior no group é reaproveitada", async () => {
    const { d } = fakeDb(linha());
    const { s, chamadas } = fakeStripe({ existentes: [{ id: "tr_antigo", metadata: { transferenciaMedicoId: "t1" } }] });
    const r = await enviarTransferencia("t1", { d, s, env: ENV, audit, ajustarDesconto: semDesconto });
    expect(r.enviado).toBe(true);
    expect(r.enviado && r.transferId).toBe("tr_antigo");
    expect(chamadas.some((c) => c.metodo === "create")).toBe(false);
  });

  test("sem charge e sem PI: não envia", async () => {
    const { d } = fakeDb(linha({ pagamento: { stripeChargeId: null, stripePaymentIntentId: null } }));
    const { s, chamadas } = fakeStripe();
    const r = await enviarTransferencia("t1", { d, s, env: ENV, audit, ajustarDesconto: semDesconto });
    expect(r).toEqual({ enviado: false, motivo: "sem_charge" });
    expect(chamadas.some((c) => c.metodo === "create")).toBe(false);
  });

  test("erro do Stripe: falhou com motivo", async () => {
    const l = linha();
    const { d, chamadas } = fakeDb(l);
    const { s } = fakeStripe({ erro: new Error("saldo insuficiente") });
    const r = await enviarTransferencia("t1", { d, s, env: ENV, audit, ajustarDesconto: semDesconto });
    expect(r).toEqual({ enviado: false, motivo: "saldo insuficiente" });
    const upd = chamadas.find((c) => c.metodo === "updateMany")?.args;
    expect(upd.data.status).toBe("falhou");
    expect(upd.data.erro).toBe("saldo insuficiente");
  });

  test("dívida de chargeback parcial: envia líquido − desconto", async () => {
    const { d } = fakeDb(linha());
    const { s, chamadas: sc } = fakeStripe();
    const r = await enviarTransferencia("t1", { d, s, env: ENV, audit, ajustarDesconto: async () => 1500 });
    expect(r).toEqual({ enviado: true, transferId: "tr_1", valorCentavos: 15800 });
    const create = sc.find((c) => c.metodo === "create")?.args;
    expect((create?.[0] as { amount: number }).amount).toBe(15800);
  });

  test("dívida consome o líquido todo: status descontada, nada no Stripe", async () => {
    const { d, chamadas } = fakeDb(linha());
    const { s, chamadas: sc } = fakeStripe();
    const r = await enviarTransferencia("t1", { d, s, env: ENV, audit, agora: new Date("2026-11-27T12:00:00Z"), ajustarDesconto: async () => 17300 });
    expect(r).toEqual({ enviado: false, motivo: "zero" });
    expect(sc.length).toBe(0);
    const upd = chamadas.find((c) => c.metodo === "updateMany")?.args;
    expect([upd.data.status, upd.data.enviadaEm]).toEqual(["descontada", new Date("2026-11-27T12:00:00Z")]);
  });
});

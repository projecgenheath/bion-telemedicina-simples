import { describe, expect, test } from "bun:test";
import { retentarTaxaAoMedico, chaveIdempotenciaTaxa, devolverTaxaAoMedico, devolucaoTaxaAtiva, refundsDoEvento, type DbTaxa } from "./reembolso-taxa-medico";

const ENV = { BION_PAGAMENTO_STRIPE: "true", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_CONNECT: "true", STRIPE_MODO_COBRANCA: "direta", STRIPE_MOEDA: "brl" };

function reembolso(x: Record<string, unknown> = {}) {
  return {
    id: "rb1", status: "processado", motivo: "falta_paciente", valorCentavos: 15000, multaCentavos: 0, stripeRefundId: "re_1",
    pagamento: { valor: 150, stripePaymentIntentId: "pi_1", stripeTaxaCentavos: 649, consulta: { medico: { perfilMedico: { stripeAccountId: "acct_med" } } } },
    ...x,
  };
}

function fakeDb(r = reembolso()) {
  const linhas: any[] = [];
  const d = {
    linhas,
    reembolso: { async findUnique(a: any) { return a.where.stripeRefundId === r.stripeRefundId ? r : null; } },
    reembolsoTaxaMedico: {
      async create(a: any) {
        if (linhas.some((l) => l.reembolsoId === a.data.reembolsoId)) throw Object.assign(new Error("dup"), { code: "P2002" });
        const l = { id: "t" + linhas.length, tentativas: 0, stripeTransferId: null, ...a.data }; linhas.push(l); return l;
      },
      async findUnique(a: any) { return linhas.find((l) => l.reembolsoId === a.where.reembolsoId) ?? null; },
      async update(a: any) { const l = linhas.find((x) => x.id === a.where.id); if (a.data.tentativas) l.tentativas++; return l; },
      async updateMany(a: any) {
        let count = 0;
        for (const l of linhas) if (l.id === a.where.id && l.status !== "enviado") { Object.assign(l, a.data); count++; }
        return { count };
      },
    },
  };
  return d as typeof d & DbTaxa;
}

function fakeStripe(falhar = 0, erro: any = new Error("Stripe indisponível"), existentes: any[] = []) {
  const chamadas: any[] = [];
  const porChave = new Map<string, string>();
  return {
    chamadas,
    transfers: {
      async create(p: any, o: any) {
        chamadas.push([p, o]);
        if (falhar-- > 0) throw erro;
        if (!porChave.has(o.idempotencyKey)) porChave.set(o.idempotencyKey, "tr_" + porChave.size);
        return { id: porChave.get(o.idempotencyKey)! };
      },
      async list(p: any) { return { data: existentes.filter((t) => t.transfer_group === p.transfer_group) }; },
    },
    paymentIntents: { async retrieve() { return { latest_charge: { balance_transaction: { fee: 700 } } }; } },
  };
}
const audit = (logs: any[]) => (async (_u: unknown, l: any) => { logs.push(l.acao); }) as any;

describe("devolverTaxaAoMedico", () => {
  test("cria uma transferência com valor, conta e chave certos", async () => {
    const d = fakeDb(); const s = fakeStripe(); const logs: string[] = [];
    const r = await devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit(logs) });
    expect(r).toEqual({ enviado: true, transferId: "tr_0", valorCentavos: 649 });
    expect(s.chamadas.length).toBe(1);
    const [p, o] = s.chamadas[0];
    expect(p.amount).toBe(649); expect(p.destination).toBe("acct_med"); expect(p.currency).toBe("brl");
    expect(o.idempotencyKey).toBe(chaveIdempotenciaTaxa("re_1"));
    expect(o.stripeAccount).toBeUndefined();
    expect(d.linhas[0].status).toBe("enviado");
    expect(logs).toEqual(["REEMBOLSO_TAXA_MEDICO_DEVOLVIDA"]);
  });

  test("chamada repetida não faz nada", async () => {
    const d = fakeDb(); const s = fakeStripe();
    await devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit([]) });
    const r = await devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit([]) });
    expect(r).toEqual({ enviado: false, motivo: "ja_enviado" });
    expect(s.chamadas.length).toBe(1);
  });

  test("concorrente: um cria a linha, os dois usam a mesma chave, uma transferência só", async () => {
    const d = fakeDb(); const s = fakeStripe();
    await Promise.all([1, 2].map(() => devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit([]) })));
    expect(d.linhas.length).toBe(1);
    expect(new Set(s.chamadas.map((c) => c[1].idempotencyKey)).size).toBe(1);
  });

  test("taxa ausente no banco: lê do Stripe na conta do médico", async () => {
    const r0 = reembolso(); (r0.pagamento as any).stripeTaxaCentavos = null;
    const s = fakeStripe();
    const r = await devolverTaxaAoMedico("re_1", { d: fakeDb(r0), s: s as any, env: ENV, audit: audit([]) });
    expect(r).toEqual({ enviado: true, transferId: "tr_0", valorCentavos: 700 });
  });

  test("flag desligada não faz nada", async () => {
    const s = fakeStripe();
    for (const env of [{ ...ENV, BION_PAGAMENTO_STRIPE: "false" }, { ...ENV, BION_PAGAMENTO_STRIPE: undefined }]) {
      expect(await devolverTaxaAoMedico("re_1", { d: fakeDb(), s: s as any, env, audit: audit([]) })).toEqual({ enviado: false, motivo: "desligado" });
    }
    expect(s.chamadas.length).toBe(0);
  });

  test("fora da cobrança direta não faz nada", async () => {
    const s = fakeStripe();
    for (const env of [{ ...ENV, STRIPE_MODO_COBRANCA: "destino" }, { ...ENV, STRIPE_MODO_COBRANCA: "plataforma" }, { ...ENV, STRIPE_CONNECT: "" }]) {
      expect(devolucaoTaxaAtiva(env)).toBe(false);
      expect((await devolverTaxaAoMedico("re_1", { d: fakeDb(), s: s as any, env, audit: audit([]) })).enviado).toBe(false);
    }
    expect(s.chamadas.length).toBe(0);
  });

  test("reembolso parcial, outro motivo ou ainda não processado não faz nada", async () => {
    const s = fakeStripe();
    const casos: [Record<string, unknown>, string][] = [
      [{ valorCentavos: 7500 }, "parcial"],
      [{ multaCentavos: 100 }, "parcial"],
      [{ motivo: "pedido_paciente" }, "motivo"],
      [{ status: "aprovado" }, "status"],
    ];
    for (const [x, motivo] of casos) {
      expect(await devolverTaxaAoMedico("re_1", { d: fakeDb(reembolso(x)), s: s as any, env: ENV, audit: audit([]) })).toEqual({ enviado: false, motivo });
    }
    expect(s.chamadas.length).toBe(0);
  });

  test("erro do Stripe: registra, relança e a nova tentativa paga uma vez só", async () => {
    const d = fakeDb(); const s = fakeStripe(1); const logs: string[] = [];
    await expect(devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit(logs) })).rejects.toThrow("Stripe indisponível");
    expect(d.linhas[0].status).toBe("falhou");
    expect(logs).toEqual(["REEMBOLSO_TAXA_MEDICO_FALHOU"]);
    const r = await devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit(logs) });
    expect(r.enviado).toBe(true);
    expect(d.linhas.length).toBe(1);
    expect(d.linhas[0].tentativas).toBe(2);
    expect(s.chamadas.map((c) => c[1].idempotencyKey)).toEqual([chaveIdempotenciaTaxa("re_1"), chaveIdempotenciaTaxa("re_1")]);
    expect(await devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit(logs) })).toEqual({ enviado: false, motivo: "ja_enviado" });
  });

  test("médico sem conta: registra e não transfere", async () => {
    const r0 = reembolso(); (r0.pagamento as any).consulta.medico.perfilMedico.stripeAccountId = null;
    const s = fakeStripe(); const logs: string[] = [];
    expect(await devolverTaxaAoMedico("re_1", { d: fakeDb(r0), s: s as any, env: ENV, audit: audit(logs) })).toEqual({ enviado: false, motivo: "sem_conta_medico" });
    expect(logs).toEqual(["REEMBOLSO_TAXA_MEDICO_SEM_CONTA"]);
  });

  test("chave expirada: transferência já existe no transfer_group → marca enviado sem criar outra", async () => {
    const d = fakeDb();
    d.linhas.push({ id: "t0", reembolsoId: "rb1", contaStripe: "acct_med", valorCentavos: 649, status: "pendente", tentativas: 1, stripeTransferId: null });
    const s = fakeStripe(0, undefined, [{ id: "tr_antiga", transfer_group: "reembolso_rb1", metadata: { reembolsoId: "rb1", tipo: "taxa_reembolso_falta" } }]);
    const logs: string[] = [];
    const r = await devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit(logs) });
    expect(r).toEqual({ enviado: true, transferId: "tr_antiga", valorCentavos: 649 });
    expect(s.chamadas.length).toBe(0);
    expect(d.linhas[0].status).toBe("enviado");
    expect(d.linhas[0].stripeTransferId).toBe("tr_antiga");
  });

  test("transfer_group com transferência de outro tipo não conta", async () => {
    const s = fakeStripe(0, undefined, [{ id: "tr_x", transfer_group: "reembolso_rb1", metadata: { tipo: "outro" } }]);
    const r = await devolverTaxaAoMedico("re_1", { d: fakeDb(), s: s as any, env: ENV, audit: audit([]) });
    expect(r).toEqual({ enviado: true, transferId: "tr_0", valorCentavos: 649 });
  });

  test("saldo insuficiente: auditoria própria (critical)", async () => {
    const d = fakeDb(); const logs: string[] = [];
    const s = fakeStripe(1, Object.assign(new Error("Insufficient funds"), { code: "balance_insufficient" }));
    await expect(devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit(logs) })).rejects.toThrow();
    expect(logs).toEqual(["REEMBOLSO_TAXA_MEDICO_SALDO_INSUFICIENTE"]);
    expect(d.linhas[0].status).toBe("falhou");
  });

  test("retentarTaxaAoMedico: falhou → enviado; depois não faz nada", async () => {
    const d = fakeDb(); const s = fakeStripe(1);
    const dbReembolso = { reembolso: { async findUnique(a: any) { return a.where.id === "rb1" ? { stripeRefundId: "re_1" } : null; } } };
    await expect(devolverTaxaAoMedico("re_1", { d, s: s as any, env: ENV, audit: audit([]) })).rejects.toThrow();
    expect((await retentarTaxaAoMedico("rb1", { d, s: s as any, env: ENV, audit: audit([]), dbReembolso })).enviado).toBe(true);
    expect(await retentarTaxaAoMedico("rb1", { d, s: s as any, env: ENV, audit: audit([]), dbReembolso })).toEqual({ enviado: false, motivo: "ja_enviado" });
    expect(await retentarTaxaAoMedico("x", { d, s: s as any, env: ENV, audit: audit([]), dbReembolso })).toEqual({ enviado: false, motivo: "nao_encontrado" });
  });

  test("refundsDoEvento", () => {
    expect(refundsDoEvento({ type: "refund.updated", data: { object: { id: "re_9" } } })).toEqual(["re_9"]);
    expect(refundsDoEvento({ type: "charge.refunded", data: { object: { refunds: { data: [{ id: "re_a" }] } } } })).toEqual(["re_a"]);
    expect(refundsDoEvento({ type: "refund.failed", data: { object: { id: "re_9" } } })).toEqual([]);
  });
});

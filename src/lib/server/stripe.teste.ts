/** Base do Stripe (reembolso e eventos). Rodar: npx tsx src/lib/server/stripe.teste.ts */
import { enviarReembolsoStripe, paymentIntentDoGatewayRef, registrarEventoReembolsoStripe, statusReembolsoDoStripe, stripeConnectAtivo, modoCobrancaStripe, jaProcessado, marcarEvento, reivindicarEvento, liberarEvento } from "./stripe";

let ok = 0, falhas = 0;
const igual = (n: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhas++; console.error(`✗ ${n}\n  obtido ${JSON.stringify(a)}\n  esperado ${JSON.stringify(b)}`); }
};

type R = { id: string; status: string; valorCentavos: number; stripeRefundId: string | null; pagamento: any; remarcacao?: any; processadoEm?: Date };
function fakeDb(linhas: R[]) {
  return {
    linhas,
    reembolso: {
      async findUnique(a: any) { return linhas.find((l) => l.id === a.where.id) ?? null; },
      async findFirst() { return null; },
      async update(a: any) { Object.assign(linhas.find((l) => l.id === a.where.id)!, a.data); return {}; },
      async updateMany(a: any) {
        let count = 0;
        for (const l of linhas) if (l.stripeRefundId === a.where.stripeRefundId && a.where.status.in.includes(l.status)) { Object.assign(l, a.data); count++; }
        return { count };
      },
    },
  };
}
function fakeStripe(status = "pending") {
  const chamadas: any[] = [];
  return { chamadas, refunds: { async create(p: any, o: any) { chamadas.push([p, o]); return { id: "re_" + o.idempotencyKey, status }; } } };
}
const base = (x: Partial<R> = {}): R => ({ id: "r1", status: "aprovado", valorCentavos: 15000, stripeRefundId: null, pagamento: { stripePaymentIntentId: "pi_1" }, ...x });

async function main() {
  igual("connect off por padrão", stripeConnectAtivo(undefined), false);
  igual("connect true", stripeConnectAtivo("true"), true);
  igual("succeeded", statusReembolsoDoStripe("succeeded"), "processado");
  igual("failed", statusReembolsoDoStripe("failed"), "falhou");
  igual("pending", statusReembolsoDoStripe("pending"), null);

  { const d = fakeDb([base()]); const s = fakeStripe();
    const r = await enviarReembolsoStripe("r1", { d: d as any, s: s as any });
    igual("envia", r, { enviado: true, refundId: "re_r1", status: "pending" });
    igual("idempotency key = id", s.chamadas[0][1], { idempotencyKey: "r1" });
    igual("valor e PI", [s.chamadas[0][0].amount, s.chamadas[0][0].payment_intent], [15000, "pi_1"]);
    igual("grava refund e segue aprovado", [d.linhas[0].stripeRefundId, d.linhas[0].status], ["re_r1", "aprovado"]);
    igual("não reenvia", await enviarReembolsoStripe("r1", { d: d as any, s: s as any }), { enviado: false, motivo: "ja_enviado" });
    igual("uma chamada só", s.chamadas.length, 1);
  }
  { const d = fakeDb([base()]); const s = fakeStripe("succeeded");
    await enviarReembolsoStripe("r1", { d: d as any, s: s as any });
    igual("succeeded na hora fecha", d.linhas[0].status, "processado");
  }
  { const d = fakeDb([base({ status: "solicitado" }), base({ id: "r2", pagamento: { stripePaymentIntentId: null } }), base({ id: "r3", valorCentavos: 0 })]); const s = fakeStripe();
    igual("só aprovado", await enviarReembolsoStripe("r1", { d: d as any, s: s as any }), { enviado: false, motivo: "status" });
    igual("sem stripe", await enviarReembolsoStripe("r2", { d: d as any, s: s as any }), { enviado: false, motivo: "sem_stripe" });
    igual("valor zero", await enviarReembolsoStripe("r3", { d: d as any, s: s as any }), { enviado: false, motivo: "valor_zero" });
    igual("inexistente", await enviarReembolsoStripe("x", { d: d as any, s: s as any }), { enviado: false, motivo: "nao_encontrado" });
    igual("nenhuma chamada", s.chamadas.length, 0);
  }
  { const d = fakeDb([base({ stripeRefundId: "re_a" }), base({ id: "r2", stripeRefundId: "re_b" })]);
    igual("refund.updated succeeded", await registrarEventoReembolsoStripe({ id: "e1", type: "refund.updated", data: { object: { id: "re_a", status: "succeeded" } } }, { d: d as any }), 1);
    igual("refund.failed", await registrarEventoReembolsoStripe({ id: "e2", type: "refund.failed", data: { object: { id: "re_b", status: "pending" } } }, { d: d as any }), 1);
    igual("status", d.linhas.map((l) => l.status), ["processado", "falhou"]);
    igual("processado não volta a falhou", await registrarEventoReembolsoStripe({ id: "e3", type: "refund.failed", data: { object: { id: "re_a", status: "failed" } } }, { d: d as any }), 0);
    igual("charge.refunded", await registrarEventoReembolsoStripe({ id: "e4", type: "charge.refunded", data: { object: { refunds: { data: [{ id: "re_b", status: "succeeded" }] } } } }, { d: d as any }), 1);
    igual("outro evento ignora", await registrarEventoReembolsoStripe({ id: "e5", type: "charge.succeeded", data: { object: {} } }, { d: d as any }), 0);
  }
  { const m = new Map<string, any>();
    const d = { stripeEvento: { async findUnique(a: any) { return m.get(a.where.id) ?? null; }, async upsert(a: any) { m.set(a.where.id, { ...a.create }); } } };
    igual("evento novo", await jaProcessado("evt_1", d as any), false);
    await marcarEvento("evt_1", "refund.updated", d as any);
    igual("evento repetido", await jaProcessado("evt_1", d as any), true);
  }
  { const m = new Map<string, any>();
    const erro = (code: string) => Object.assign(new Error(code), { code });
    const d = { stripeEvento: {
      async create(a: any) { if (m.has(a.data.id)) throw erro("P2002"); m.set(a.data.id, a.data); },
      async delete(a: any) { if (!m.has(a.where.id)) throw erro("P2025"); m.delete(a.where.id); } } };
    igual("reivindica novo", await reivindicarEvento("evt_9", "charge.refunded", d as any), true);
    igual("reivindica repetido", await reivindicarEvento("evt_9", "charge.refunded", d as any), false);
    await liberarEvento("evt_9", d as any);
    igual("liberado reivindica de novo", await reivindicarEvento("evt_9", "charge.refunded", d as any), true);
    await liberarEvento("nao_existe", d as any); igual("liberar inexistente ignora", true, true);
    const ruim = { stripeEvento: { async create() { throw erro("P1001"); }, async delete() {} } };
    let lancou = false; try { await reivindicarEvento("x", "t", ruim as any); } catch { lancou = true; }
    igual("outro erro propaga", lancou, true);
  }
  { const d = fakeDb([base({ stripeRefundId: "re_c" }), base({ id: "r2", stripeRefundId: "re_d" })]);
    igual("refund.created succeeded", await registrarEventoReembolsoStripe({ id: "e6", type: "refund.created", data: { object: { id: "re_c", status: "succeeded", charge: "ch_1" } } }, { d: d as any }), 1);
    const chamadas: any[] = [];
    const s = { refunds: { async list(p: any, o: any) { chamadas.push([p, o]); return { data: [{ id: "re_d", status: "succeeded" }] }; } } };
    igual("charge.refunded sem data busca lista", await registrarEventoReembolsoStripe({ id: "e7", type: "charge.refunded", account: "acct_9", data: { object: { id: "ch_2", refunds: { data: [] } } } }, { d: d as any, s: s as any }), 1);
    igual("list com charge e stripeAccount", chamadas[0], [{ charge: "ch_2", limit: 100 }, { stripeAccount: "acct_9" }]);
    await registrarEventoReembolsoStripe({ id: "e8", type: "charge.refunded", data: { object: { id: "ch_3" } } }, { d: d as any, s: s as any });
    igual("list sem account", chamadas[1], [{ charge: "ch_3", limit: 100 }, undefined]);
  }
  // modos de cobrança (Connect)
  igual("modo padrão", modoCobrancaStripe(undefined), "plataforma");
  igual("modo inválido", modoCobrancaStripe("xyz"), "plataforma");
  igual("modo direta", modoCobrancaStripe(" Direta "), "direta");
  const comConta = (conta: string | null) => base({ pagamento: { stripePaymentIntentId: "pi_1", consulta: { medico: { perfilMedico: { stripeAccountId: conta } } } } });
  { const d = fakeDb([comConta("acct_1")]); const s = fakeStripe();
    await enviarReembolsoStripe("r1", { d: d as any, s: s as any, connect: true, modo: "plataforma" });
    igual("plataforma: params", s.chamadas[0], [{ payment_intent: "pi_1", amount: 15000, metadata: { reembolsoId: "r1" } }, { idempotencyKey: "r1" }]);
  }
  { const d = fakeDb([comConta("acct_1")]); const s = fakeStripe();
    await enviarReembolsoStripe("r1", { d: d as any, s: s as any, connect: false, modo: "direta" });
    igual("connect off ignora modo", s.chamadas[0][1], { idempotencyKey: "r1" });
  }
  { const d = fakeDb([comConta("acct_1")]); const s = fakeStripe();
    const r = await enviarReembolsoStripe("r1", { d: d as any, s: s as any, connect: true, modo: "direta" });
    igual("direta: enviado", r.enviado, true);
    igual("direta: params", s.chamadas[0], [{ payment_intent: "pi_1", amount: 15000, metadata: { reembolsoId: "r1" }, refund_application_fee: true }, { idempotencyKey: "r1", stripeAccount: "acct_1" }]);
  }
  { const d = fakeDb([comConta(null)]); const s = fakeStripe();
    const err = console.error; console.error = () => {};
    const r = await enviarReembolsoStripe("r1", { d: d as any, s: s as any, connect: true, modo: "direta" });
    console.error = err;
    igual("direta sem conta: motivo", (r as any).motivo, "sem_conta_medico");
    igual("direta sem conta: não chama Stripe", s.chamadas.length, 0);
    igual("direta sem conta: não grava", d.linhas[0].stripeRefundId, null);
  }
  { const d = fakeDb([comConta("acct_1")]); const s = fakeStripe();
    await enviarReembolsoStripe("r1", { d: d as any, s: s as any, connect: true, modo: "destino" });
    igual("destino: params", s.chamadas[0], [{ payment_intent: "pi_1", amount: 15000, metadata: { reembolsoId: "r1" }, reverse_transfer: true, refund_application_fee: true }, { idempotencyKey: "r1" }]);
  }
  // multa de remarcação (sem Pagamento, PI em RemarcacaoPendente.gatewayRef)
  igual("gatewayRef ok", paymentIntentDoGatewayRef("stripe_pi:pi_3Abc"), "pi_3Abc");
  igual("gatewayRef outro formato", paymentIntentDoGatewayRef("pix:123"), null);
  igual("gatewayRef nulo", paymentIntentDoGatewayRef(null), null);
  const multa = (ref: string | null, conta: string | null = "acct_m") => base({ id: "rm", valorCentavos: 5000, pagamento: null, remarcacao: { gatewayRef: ref, consulta: { medico: { perfilMedico: { stripeAccountId: conta } } } } });
  { const d = fakeDb([multa("stripe_pi:pi_m")]); const s = fakeStripe();
    const r = await enviarReembolsoStripe("rm", { d: d as any, s: s as any, connect: true, modo: "plataforma" });
    igual("multa plataforma: enviado", r, { enviado: true, refundId: "re_rm", status: "pending" });
    igual("multa plataforma: params", s.chamadas[0], [{ payment_intent: "pi_m", amount: 5000, metadata: { reembolsoId: "rm" } }, { idempotencyKey: "rm" }]);
    igual("multa grava refund", d.linhas[0].stripeRefundId, "re_rm");
  }
  { const d = fakeDb([multa("stripe_pi:pi_m")]); const s = fakeStripe();
    await enviarReembolsoStripe("rm", { d: d as any, s: s as any, connect: true, modo: "direta" });
    igual("multa direta: params", s.chamadas[0], [{ payment_intent: "pi_m", amount: 5000, metadata: { reembolsoId: "rm" }, refund_application_fee: true }, { idempotencyKey: "rm", stripeAccount: "acct_m" }]);
  }
  { const d = fakeDb([multa("stripe_pi:pi_m")]); const s = fakeStripe();
    await enviarReembolsoStripe("rm", { d: d as any, s: s as any, connect: true, modo: "destino" });
    igual("multa destino: params", s.chamadas[0], [{ payment_intent: "pi_m", amount: 5000, metadata: { reembolsoId: "rm" }, reverse_transfer: true, refund_application_fee: true }, { idempotencyKey: "rm" }]);
  }
  { const d = fakeDb([multa("stripe_pi:pi_m", null)]); const s = fakeStripe();
    const err = console.error; console.error = () => {};
    const r = await enviarReembolsoStripe("rm", { d: d as any, s: s as any, connect: true, modo: "direta" });
    console.error = err;
    igual("multa direta sem conta", [(r as any).motivo, s.chamadas.length], ["sem_conta_medico", 0]);
  }
  { const d = fakeDb([multa(null), multa("pix:abc"), base({ id: "rx", pagamento: null })]); d.linhas[1].id = "rm2"; const s = fakeStripe();
    igual("multa sem gatewayRef", await enviarReembolsoStripe("rm", { d: d as any, s: s as any }), { enviado: false, motivo: "sem_stripe" });
    igual("multa gatewayRef não-stripe", await enviarReembolsoStripe("rm2", { d: d as any, s: s as any }), { enviado: false, motivo: "sem_stripe" });
    igual("sem pagamento nem remarcação", await enviarReembolsoStripe("rx", { d: d as any, s: s as any }), { enviado: false, motivo: "sem_stripe" });
    igual("multa sem PI: nenhuma chamada", s.chamadas.length, 0);
  }
  // sessão de checkout pendente (#121): 'stripe_cs:<id>' não é PaymentIntent, nunca reembolsa
  igual("gatewayRef sessão pendente", paymentIntentDoGatewayRef("stripe_cs:cs_test_a1B2"), null);
  { const d = fakeDb([multa("stripe_cs:cs_test_a1B2")]); const s = fakeStripe();
    for (const modo of ["plataforma", "direta", "destino"] as const) {
      igual(`multa sessão pendente (${modo}): sem_stripe`, await enviarReembolsoStripe("rm", { d: d as any, s: s as any, connect: true, modo }), { enviado: false, motivo: "sem_stripe" });
    }
    igual("multa sessão pendente: nenhuma chamada", s.chamadas.length, 0);
    igual("multa sessão pendente: sem refund gravado", d.linhas[0].stripeRefundId, null);
  }
  { const d = fakeDb([multa("stripe_pi:pi_m")]); const s = fakeStripe();
    await enviarReembolsoStripe("rm", { d: d as any, s: s as any });
    igual("multa idempotente", await enviarReembolsoStripe("rm", { d: d as any, s: s as any }), { enviado: false, motivo: "ja_enviado" });
    igual("multa uma chamada", s.chamadas.length, 1);
  }
  // renovação: Pagamento sem consulta, conta do médico pelo PedidoRenovacao
  { const d = fakeDb([base({ id: "rr", pagamento: { stripePaymentIntentId: "pi_r", consulta: null, pedidoRenovacao: { medico: { perfilMedico: { stripeAccountId: "acct_r" } } } } })]); const s = fakeStripe();
    const r = await enviarReembolsoStripe("rr", { d: d as any, s: s as any, connect: true, modo: "direta" });
    igual("renovação direta: enviado", r.enviado, true);
    igual("renovação direta: params", s.chamadas[0], [{ payment_intent: "pi_r", amount: 15000, metadata: { reembolsoId: "rr" }, refund_application_fee: true }, { idempotencyKey: "rr", stripeAccount: "acct_r" }]);
  }
  { const d = fakeDb([base({ id: "rr", pagamento: { stripePaymentIntentId: "pi_r", consulta: null, pedidoRenovacao: null } })]); const s = fakeStripe();
    const err = console.error; console.error = () => {};
    const r = await enviarReembolsoStripe("rr", { d: d as any, s: s as any, connect: true, modo: "direta" });
    console.error = err;
    igual("renovação direta sem conta", [(r as any).motivo, s.chamadas.length], ["sem_conta_medico", 0]);
  }
  // consulta continua usando a conta da consulta (prioridade sobre a renovação)
  { const d = fakeDb([base({ pagamento: { stripePaymentIntentId: "pi_1", consulta: { medico: { perfilMedico: { stripeAccountId: "acct_c" } } }, pedidoRenovacao: { medico: { perfilMedico: { stripeAccountId: "acct_outro" } } } } })]); const s = fakeStripe();
    await enviarReembolsoStripe("r1", { d: d as any, s: s as any, connect: true, modo: "direta" });
    igual("consulta direta: conta da consulta", s.chamadas[0][1], { idempotencyKey: "r1", stripeAccount: "acct_c" });
  }
  console.log(`${ok} ok, ${falhas} falha(s)`);
  if (falhas) process.exit(1);
}
main();

/** Base do Stripe (reembolso e eventos). Rodar: npx tsx src/lib/server/stripe.teste.ts */
import { enviarReembolsoStripe, registrarEventoReembolsoStripe, statusReembolsoDoStripe, stripeConnectAtivo, jaProcessado, marcarEvento } from "./stripe";

let ok = 0, falhas = 0;
const igual = (n: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { falhas++; console.error(`✗ ${n}\n  obtido ${JSON.stringify(a)}\n  esperado ${JSON.stringify(b)}`); }
};

type R = { id: string; status: string; valorCentavos: number; stripeRefundId: string | null; pagamento: { stripePaymentIntentId: string | null } | null; processadoEm?: Date };
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
  console.log(`${ok} ok, ${falhas} falha(s)`);
  if (falhas) process.exit(1);
}
main();

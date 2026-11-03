/**
 * Rota POST /api/admin/chargebacks/[id]/falha-bion: só ADMIN, motivo obrigatório.
 * Rodar: bun --conditions=react-server test "./src/app/api/admin/chargebacks/[id]/falha-bion/rota.teste.ts"
 */
import { expect, mock, test } from "bun:test";

let papel = "ADMIN";
let transacoes = 0;
mock.module("@/lib/server/auth", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes(papel)) throw Object.assign(new Error("Acesso negado"), { status: 403 });
    return { id: "adm1", nome: "Admin", role: papel };
  },
  registrarAudit: async () => ({}),
}));
const cb = { id: "cb1", falhaBion: false, medicoId: "m1", statusStripe: "needs_response", taxaDisputaCentavos: 1500 };
(globalThis as unknown as { prisma: unknown }).prisma = {
  async $transaction(fn: (tx: unknown) => Promise<unknown>) {
    transacoes++;
    return fn({
      chargeback: { findUnique: async () => ({ ...cb }), update: async () => ({}) },
      repasseAjuste: { findFirst: async () => null, deleteMany: async () => ({ count: 0 }) },
      auditLog: { create: async () => ({}) },
    });
  },
};
const { POST } = await import("./route");
const chamar = (body: unknown) =>
  POST(new Request("http://x/api/admin/chargebacks/cb1/falha-bion", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: "cb1" }) });

test("não admin: 403 sem tocar no banco", async () => {
  papel = "MEDICO";
  transacoes = 0;
  const r = await chamar({ falhaBion: true, motivo: "Falha de antifraude da BION" });
  expect(r.status).toBe(403);
  expect(transacoes).toBe(0);
  papel = "ADMIN";
});
test("sem motivo: 400 sem tocar no banco", async () => {
  transacoes = 0;
  const r = await chamar({ falhaBion: true });
  expect(r.status).toBe(400);
  expect(transacoes).toBe(0);
});
test("admin com motivo: 200, desconto zero", async () => {
  const r = await chamar({ falhaBion: true, motivo: "Falha de antifraude da BION" });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ ok: true, mudou: true, falhaBion: true, descontoCentavos: 0 });
});

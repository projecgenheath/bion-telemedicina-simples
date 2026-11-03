/**
 * POST /api/admin/chargebacks/[id]/credito-devolvido: só ADMIN, motivo ≥ 10.
 * Rodar: bun --conditions=react-server test "./src/app/api/admin/chargebacks/[id]/credito-devolvido/rota.teste.ts"
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
(globalThis as unknown as { prisma: unknown }).prisma = {
  async $transaction(fn: (tx: unknown) => Promise<unknown>) {
    transacoes++;
    return fn({
      $queryRaw: async () => [],
      chargeback: { findUnique: async () => ({ id: "cb1", creditoPendente: true, creditoDevolvidoEm: null }), update: async () => ({}) },
      auditLog: { create: async () => ({}) },
    });
  },
};
const { POST } = await import("./route");
const chamar = (body: unknown) =>
  POST(new Request("http://x/api/admin/chargebacks/cb1/credito-devolvido", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: "cb1" }) });

test("não admin: 403 sem tocar no banco", async () => {
  papel = "MEDICO";
  transacoes = 0;
  expect((await chamar({ motivo: "PIX manual de R$ 15,00" })).status).toBe(403);
  expect(transacoes).toBe(0);
  papel = "ADMIN";
});
test("motivo curto: 400", async () => {
  transacoes = 0;
  expect((await chamar({ motivo: "curto" })).status).toBe(400);
  expect(transacoes).toBe(0);
});
test("admin: 200", async () => {
  const r = await chamar({ motivo: "PIX manual de R$ 15,00" });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, mudou: true });
});

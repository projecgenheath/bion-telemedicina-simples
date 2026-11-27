/**
 * Rota POST /api/admin/chargebacks/[id]/cobrar-taxas: só ADMIN; repete a
 * cobrança das taxas do chargeback no modo plataforma (alternativa B, 27/11).
 * Rodar: bun --conditions=react-server test "./src/app/api/admin/chargebacks/[id]/cobrar-taxas/rota.teste.ts"
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
const cb: Record<string, unknown> = {
  id: "cb1", falhaBion: false, medicoId: "m1", statusStripe: "lost", stripeConta: null,
  taxaDisputaCentavos: 1500, pagamentoId: "pg1", remarcacaoId: null,
  taxasPlataformaStatus: null, taxasPlataformaCentavos: null,
  taxasPlataformaReversalCentavos: null, taxasPlataformaDescontadoCentavos: 0, creditoDevolvidoEm: null,
};
let existe = true;
(globalThis as unknown as { prisma: unknown }).prisma = {
  async $transaction(fn: (tx: unknown) => Promise<unknown>) {
    transacoes++;
    return fn({
      $queryRaw: async () => [],
      chargeback: {
        findUnique: async () => (existe ? { ...cb } : null),
        findMany: async () => [],
        update: async (a: { data: Record<string, unknown> }) => { Object.assign(cb, a.data); return {}; },
        updateMany: async () => ({ count: 1 }),
      },
      transferenciaMedico: { findFirst: async () => null },
      reembolso: { findMany: async () => [] },
    });
  },
};
const { POST } = await import("./route");
const chamar = () =>
  POST(new Request("http://x/api/admin/chargebacks/cb1/cobrar-taxas", { method: "POST" }) as never, { params: Promise.resolve({ id: "cb1" }) });

test("não admin: 403 sem tocar no banco", async () => {
  papel = "MEDICO";
  transacoes = 0;
  const r = await chamar();
  expect(r.status).toBe(403);
  expect(transacoes).toBe(0);
  papel = "ADMIN";
});
test("admin: registra a dívida para desconto futuro (sem transferência enviada)", async () => {
  const r = await chamar();
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ cobrado: true, via: "desconto_futuro", valorCentavos: 1500 });
  expect(cb.taxasPlataformaStatus).toBe("aguardando_desconto");
});
test("repetir não cobra duas vezes", async () => {
  Object.assign(cb, { taxasPlataformaStatus: "quitado", taxasPlataformaCentavos: 1500, taxasPlataformaReversalCentavos: 1500 });
  const r = await chamar();
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ cobrado: false, motivo: "ja_cobrado" });
});
test("chargeback inexistente: 404", async () => {
  existe = false;
  const r = await chamar();
  expect(r.status).toBe(404);
  existe = true;
});

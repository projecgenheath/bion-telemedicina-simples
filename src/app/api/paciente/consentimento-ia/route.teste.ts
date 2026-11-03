/** Rodar: bun --conditions=react-server test ./src/app/api/paciente/consentimento-ia/route.teste.ts */
import { expect, mock, test } from "bun:test";

let auditOk = true;
const criados: string[] = [];
const apagados: string[] = [];
mock.module("@/lib/server/auth", () => ({
  exigirPapel: async () => ({ id: "p1", nome: "Paciente Teste", email: "p@t.local", role: "PACIENTE" }),
  registrarAudit: async () => (auditOk ? { id: "a1" } : null),
}));
(globalThis as unknown as { prisma: unknown }).prisma = {
  consentimento: {
    create: async () => {
      const id = `c${criados.length + 1}`;
      criados.push(id);
      return { id, createdAt: new Date() };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      apagados.push(where.id);
      return {};
    },
    findFirst: async () => null,
  },
};
const { DELETE } = await import("./route");

test("revogação com auditoria ok → 200, nada desfeito", async () => {
  auditOk = true;
  apagados.length = 0;
  const r = await DELETE();
  expect(r.status).toBe(200);
  expect(apagados).toEqual([]);
});
test("auditoria falhou → revogação desfeita e 503 (igual ao POST)", async () => {
  auditOk = false;
  apagados.length = 0;
  const r = await DELETE();
  expect(r.status).toBe(503);
  expect(apagados).toEqual([criados.at(-1)]);
});

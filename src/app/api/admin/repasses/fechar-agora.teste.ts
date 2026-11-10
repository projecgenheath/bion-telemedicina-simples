/**
 * POST /api/admin/repasses ("Fechar agora") e PATCH /api/admin/reembolsos/[id]:
 * corpo JSON `null` não vira 500, e medicoId que não é de médico → 404
 * (auditoria admin 09/11).
 * Rodar: bun --conditions=react-server test ./src/app/api/admin/repasses/fechar-agora.teste.ts
 */
import { beforeEach, expect, mock, test } from "bun:test";

let fechamentos: { dia: string; medicoIds?: string[] }[] = [];
let decisoes = 0;
mock.module("@/lib/server/auth", () => ({
  exigirPapel: async () => ({ id: "adm1", nome: "Admin", role: "ADMIN" }),
  registrarAudit: async () => ({}),
}));
mock.module("@/lib/server/repasse", () => ({
  chaveTrocadaRecente: () => false,
  cnpjDivergente: () => false,
  competenciaPadraoParaFechar: () => "2026-11-08",
  previaDoDia: async () => ({}),
  fecharRepasse: async (dia: string, o: { medicoIds?: string[] }) => {
    fechamentos.push({ dia, medicoIds: o.medicoIds });
    return { competencia: dia, resultados: [] };
  },
}));
mock.module("@/lib/server/financeiro", () => ({
  decidirReembolsoManual: async () => {
    decisoes++;
    return { ok: false, erro: "não encontrado", status: 404 };
  },
  reembolsoManualWire: (r: unknown) => r,
}));
(globalThis as unknown as { prisma: unknown }).prisma = {
  user: { findFirst: async (q: { where: { id: string; role: string } }) => (q.where.id === "m1" && q.where.role === "MEDICO" ? { id: "m1" } : null) },
};
const { POST } = await import("./route");
const reembolso = await import("../reembolsos/[id]/route");
const fechar = (body: string) => POST(new Request("http://x/api/admin/repasses", { method: "POST", body }) as never);

beforeEach(() => {
  fechamentos = [];
  decisoes = 0;
});

test("Fechar agora com corpo null usa a competência padrão (antes: 500)", async () => {
  const r = await fechar("null");
  expect(r.status).toBe(200);
  expect(fechamentos).toEqual([{ dia: "2026-11-08", medicoIds: undefined }]);
});

test("medicoId que não é de médico → 404 sem fechar", async () => {
  const r = await fechar(JSON.stringify({ competencia: "2026-11-01", medicoId: "paciente1" }));
  expect(r.status).toBe(404);
  expect(fechamentos.length).toBe(0);
});

test("medicoId de médico fecha só ele", async () => {
  const r = await fechar(JSON.stringify({ competencia: "2026-11-01", medicoId: "m1" }));
  expect(r.status).toBe(200);
  expect(fechamentos).toEqual([{ dia: "2026-11-01", medicoIds: ["m1"] }]);
});

test("reembolso manual: corpo null → 400 (antes: 500), sem decidir", async () => {
  const r = await reembolso.PATCH(new Request("http://x/api/admin/reembolsos/r1", { method: "PATCH", body: "null" }) as never, {
    params: Promise.resolve({ id: "r1" }),
  });
  expect(r.status).toBe(400);
  expect(decisoes).toBe(0);
});

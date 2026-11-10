/**
 * POST /api/admin/lgpd/cofre/busca: o histórico devolvido ao admin traz só o
 * rótulo do tipo, nunca o título original do documento nem do exame
 * (decisão do Alisson, 09/11).
 * Rodar: bun --conditions=react-server test "./src/app/api/admin/lgpd/cofre/busca/rota.teste.ts"
 */
import { expect, mock, test } from "bun:test";

mock.module("@/lib/server/auth", () => ({
  exigirPapel: async () => ({ id: "adm1", nome: "Admin", role: "ADMIN" }),
  registrarAudit: async () => ({}),
}));
mock.module("@/lib/server/dados", () => ({ aplicarSideEffects: async () => ({ notificacoes: [], audit: null }) }));
mock.module("@/lib/server/cofre", () => ({
  exigirChaveCofre: () => {},
  normalizarCpf: (s: string) => s.replace(/\D/g, ""),
  normalizarNome: (s: string) => s.trim(),
  hashCpf: () => "h",
  hashNome: () => "h",
  decifrarIdentificacao: () => ({ nome: "Fulano", cpf: "12345678900" }),
}));

/** Devolve só os campos pedidos no select (como o Prisma). */
const comSelect = (linhas: Record<string, unknown>[]) => async (q: { select: Record<string, unknown> }) =>
  linhas.map((l) => Object.fromEntries(Object.keys(q.select).filter((k) => k in l).map((k) => [k, l[k]])));
const data = new Date("2026-10-01T12:00:00Z");
(globalThis as unknown as { prisma: unknown }).prisma = {
  identificacaoCofre: { findMany: async () => [{ userId: "p1", dadosCifrados: "x", createdAt: data }] },
  user: { findUnique: async () => ({ id: "p1", nome: "Paciente anonimizado", status: "inativo", createdAt: data }) },
  consulta: { findMany: async () => [], count: async () => 0 },
  documento: {
    findMany: comSelect([{ id: "d1", tipo: "exame_solicitado", titulo: "Solicitação — Hemograma completo + PCR", createdAt: data }]),
    count: async () => 1,
  },
  exameLaboratorial: { findMany: comSelect([{ id: "e1", titulo: "Hemograma", dataColeta: data }]), count: async () => 1 },
  anamnese: { count: async () => 0 },
  medicao: { count: async () => 0 },
  arquivo: { count: async () => 0 },
};
const { POST } = await import("./route");

test("histórico do cofre: só o rótulo do tipo, sem título original", async () => {
  const r = await POST(
    new Request("http://x/api/admin/lgpd/cofre/busca", {
      method: "POST",
      body: JSON.stringify({ cpf: "123.456.789-00", motivo: "Ofício 123/2026" }),
    }) as never,
  );
  expect(r.status).toBe(200);
  const texto = await r.text();
  expect(texto).not.toContain("Hemograma");
  const j = JSON.parse(texto);
  const h = (j.resultados ?? j.dados?.resultados)[0].historico;
  expect(h.documentos[0]).toMatchObject({ id: "d1", tipo: "exame_solicitado", titulo: "Solicitação" });
  expect(h.exames[0]).toMatchObject({ id: "e1", titulo: "Exame" });
});

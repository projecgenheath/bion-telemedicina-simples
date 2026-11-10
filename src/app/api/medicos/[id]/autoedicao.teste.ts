/**
 * PATCH /api/medicos/[id] pelo PRÓPRIO médico: nome, CRM ou especialidade
 * que não sejam texto devem responder 400 (antes virava 500 no .trim()).
 * Rodar: bun --conditions=react-server test "./src/app/api/medicos/[id]/autoedicao.teste.ts"
 */
import { beforeEach, expect, mock, test } from "bun:test";

mock.module("@/lib/server/auth", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes("MEDICO")) throw Object.assign(new Error("Acesso negado"), { status: 403 });
    return { id: "m1", nome: "Dra. Teste", email: "dra@med.bion.app", role: "MEDICO" };
  },
  registrarAudit: async () => ({}),
}));
mock.module("@/lib/server/dados", () => ({
  aplicarSideEffects: async () => ({ notificacoes: [], audit: null }),
  medicoWire: (p: { userId: string }) => ({ id: p.userId }),
}));
mock.module("@/lib/server/notas-medico", () => ({ notaReal: async () => null }));

type Medico = { id: string; nome: string; email: string; status: string; perfilMedico: { status: string; crm: string; especialidade: string; horariosDisponiveis: string } };
let medico: Medico;
let gravacoes: { modelo: string; data: unknown }[] = [];
const registrar = (modelo: string) => async (q: { data: unknown }) => {
  gravacoes.push({ modelo, data: q.data });
  return {};
};
(globalThis as unknown as { prisma: unknown }).prisma = {
  user: { findFirst: async () => medico, update: registrar("user") },
  perfilMedico: {
    update: registrar("perfilMedico"),
    findUnique: async () => ({ userId: medico.id, user: { id: medico.id, nome: medico.nome } }),
  },
  sessao: { deleteMany: registrar("sessao") },
  $transaction: async (ops: unknown[]) => Promise.all(ops),
};

const { PATCH } = await import("./route");
const chamar = (body: unknown) =>
  PATCH(
    new Request("http://x/api/medicos/m1", { method: "PATCH", body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ id: "m1" }) },
  );

beforeEach(() => {
  gravacoes = [];
  medico = {
    id: "m1",
    nome: "Dra. Teste",
    email: "dra@med.bion.app",
    status: "ativo",
    perfilMedico: { status: "ativo", crm: "CRM/SP 1", especialidade: "Clínica Geral", horariosDisponiveis: "[]" },
  };
});

test("autoedição: nome, CRM ou especialidade que não são texto → 400 sem gravar", async () => {
  for (const corpo of [{ nome: 5 }, { crm: 123 }, { especialidade: true }, { nome: null }, { crm: ["x"] }]) {
    const r = await chamar({ acao: "atualizar", ...corpo });
    expect(r.status).toBe(400);
    const j = (await r.json()) as { erro?: string };
    expect(typeof j.erro).toBe("string");
    expect(j.erro).toMatch(/deve ser um texto/);
  }
  expect(gravacoes.length).toBe(0);
});

test("autoedição: reenviar nome/CRM/especialidade iguais (texto) continua ok", async () => {
  const r = await chamar({
    acao: "atualizar",
    nome: "Dra. Teste",
    crm: "CRM/SP 1",
    especialidade: "Clínica Geral",
    bio: "Nova bio",
  });
  expect(r.status).toBe(200);
  expect(gravacoes.length).toBeGreaterThan(0);
});

/**
 * PATCH /api/medicos/[id] pelo ADMIN (auditoria admin 09/11):
 * valida campos na edição do admin, não reativa/edita médico arquivado ou
 * anonimizado, e rejeita ação desconhecida e corpo que não é objeto.
 * Rodar: bun --conditions=react-server test "./src/app/api/medicos/[id]/admin-edicao.teste.ts"
 */
import { beforeEach, expect, mock, test } from "bun:test";

let papel = "ADMIN";
mock.module("@/lib/server/auth", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes(papel)) throw Object.assign(new Error("Acesso negado"), { status: 403 });
    return { id: papel === "MEDICO" ? "m1" : "adm1", nome: "Ator", email: "a@t.local", role: papel };
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
const chamar = (body: unknown, cru = false) =>
  PATCH(
    new Request("http://x/api/medicos/m1", { method: "PATCH", body: cru ? (body as string) : JSON.stringify(body) }) as never,
    { params: Promise.resolve({ id: "m1" }) },
  );

beforeEach(() => {
  papel = "ADMIN";
  gravacoes = [];
  medico = {
    id: "m1",
    nome: "Dra. Teste",
    email: "dra@med.bion.app",
    status: "ativo",
    perfilMedico: { status: "ativo", crm: "CRM/SP 1", especialidade: "Clínica Geral", horariosDisponiveis: "[]" },
  };
});

test("admin: valor fora da faixa, de tipo errado ou zero → 400 sem gravar", async () => {
  for (const valor of [-10, 0, 5001, "150", Number.NaN]) {
    const r = await chamar({ acao: "atualizar", valor });
    expect(r.status).toBe(400);
  }
  expect(gravacoes.length).toBe(0);
});

test("admin: nome/CRM/especialidade em branco ou de tipo errado → 400 sem gravar", async () => {
  for (const corpo of [{ crm: "  " }, { especialidade: "" }, { nome: 5 }, { nome: "  " }, { crm: "x".repeat(121) }]) {
    const r = await chamar({ acao: "atualizar", ...corpo });
    expect(r.status).toBe(400);
  }
  expect(gravacoes.length).toBe(0);
});

test("admin: edição válida grava com trim", async () => {
  const r = await chamar({ acao: "atualizar", valor: 200, crm: " CRM/SP 2 ", especialidade: " Cardiologia ", nome: " Dra. Nova " });
  expect(r.status).toBe(200);
  const perfil = gravacoes.find((g) => g.modelo === "perfilMedico")?.data as Record<string, unknown>;
  expect(perfil).toMatchObject({ valor: 200, crm: "CRM/SP 2", especialidade: "Cardiologia" });
  expect(gravacoes.find((g) => g.modelo === "user")?.data).toEqual({ nome: "Dra. Nova" });
});

test("médico arquivado: aprovar, suspender e atualizar → 409 sem gravar", async () => {
  medico.status = "inativo";
  medico.perfilMedico.status = "arquivado";
  for (const acao of ["aprovar", "suspender", "atualizar"]) {
    const r = await chamar({ acao, ...(acao === "atualizar" ? { bio: "x" } : {}) });
    expect(r.status).toBe(409);
  }
  expect(gravacoes.length).toBe(0);
});

test("médico anonimizado (LGPD): aprovar e atualizar → 409 sem gravar", async () => {
  medico.email = "anon-med-abc@anon.bion.app";
  medico.perfilMedico.status = "suspenso";
  expect((await chamar({ acao: "aprovar" })).status).toBe(409);
  expect((await chamar({ acao: "atualizar", nome: "Nome Real" })).status).toBe(409);
  expect(gravacoes.length).toBe(0);
});

test("aprovar médico suspenso (não arquivado) continua funcionando", async () => {
  medico.status = "suspenso";
  medico.perfilMedico.status = "suspenso";
  const r = await chamar({ acao: "aprovar" });
  expect(r.status).toBe(200);
  expect(gravacoes.filter((g) => g.modelo === "user")[0]?.data).toEqual({ status: "ativo" });
});

test("ação desconhecida e corpo que não é objeto → 400", async () => {
  expect((await chamar({ acao: "excluir" })).status).toBe(400);
  expect((await chamar("[]", true)).status).toBe(400);
  expect((await chamar('"x"', true)).status).toBe(400);
  expect((await chamar("null", true)).status).toBe(400);
  expect(gravacoes.length).toBe(0);
});

test("autoedição do médico segue as regras de antes", async () => {
  papel = "MEDICO";
  expect((await chamar({ acao: "atualizar", valor: -1 })).status).toBe(400);
  expect((await chamar({ acao: "aprovar" })).status).toBe(403);
  expect((await chamar({ acao: "atualizar", crm: "OUTRO" })).status).toBe(400);
  const r = await chamar({ acao: "atualizar", bio: "Nova bio" });
  expect(r.status).toBe(200);
});

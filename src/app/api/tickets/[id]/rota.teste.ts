/**
 * PATCH /api/tickets/[id] (resposta do admin): resposta vazia, curta ou
 * longa demais não fecha o chamado nem avisa o autor (auditoria admin 09/11).
 * Rodar: bun --conditions=react-server test "./src/app/api/tickets/[id]/rota.teste.ts"
 */
import { beforeEach, expect, mock, test } from "bun:test";

let papel = "ADMIN";
let efeitos = 0;
let updates = 0;
mock.module("@/lib/server/auth", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes(papel)) throw Object.assign(new Error("Acesso negado"), { status: 403 });
    return { id: "adm1", nome: "Admin", role: papel };
  },
  registrarAudit: async () => ({}),
}));
mock.module("@/lib/server/dados", () => ({
  aplicarSideEffects: async () => {
    efeitos++;
    return { notificacoes: [], audit: null };
  },
  ticketWire: (t: { id: string }) => ({ id: t.id }),
}));
const ticket = { id: "t1", usuarioId: "u1", assunto: "Ajuda", usuario: { nome: "Fulano" } };
(globalThis as unknown as { prisma: unknown }).prisma = {
  ticket: {
    findUnique: async () => ticket,
    update: async () => {
      updates++;
      return ticket;
    },
  },
};
const { PATCH } = await import("./route");
const chamar = (body: unknown) =>
  PATCH(new Request("http://x/api/tickets/t1", { method: "PATCH", body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id: "t1" }),
  });

beforeEach(() => {
  papel = "ADMIN";
  efeitos = 0;
  updates = 0;
});

test("resposta ausente, vazia, só espaços, curta ou longa demais → 400 sem fechar nem avisar", async () => {
  for (const corpo of [{}, { resposta: "" }, { resposta: "   " }, { resposta: "ok" }, { resposta: 5 }, { resposta: "x".repeat(4001) }]) {
    const r = await chamar(corpo);
    expect(r.status).toBe(400);
  }
  expect(updates).toBe(0);
  expect(efeitos).toBe(0);
});

test("resposta válida fecha o chamado e avisa o autor", async () => {
  const r = await chamar({ resposta: "Resolvido, obrigado pelo contato." });
  expect(r.status).toBe(200);
  expect(updates).toBe(1);
  expect(efeitos).toBe(1);
});

test("não admin → 403", async () => {
  papel = "PACIENTE";
  const r = await chamar({ resposta: "Resolvido, obrigado pelo contato." });
  expect(r.status).toBe(403);
  expect(updates).toBe(0);
});

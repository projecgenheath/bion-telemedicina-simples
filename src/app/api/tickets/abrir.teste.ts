/**
 * POST /api/tickets (abrir chamado) — auditoria admin 09/11: perfil pelo papel
 * (admin → "admin"), categoria da lista e tetos de assunto/mensagem.
 * Rodar: bun --conditions=react-server test ./src/app/api/tickets/abrir.teste.ts
 */
import { beforeEach, expect, mock, test } from "bun:test";

let papel = "PACIENTE";
let criados: Record<string, unknown>[] = [];
mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "u1", nome: "Fulano", email: "f@t.local", role: papel }),
  registrarAudit: async () => ({}),
}));
mock.module("@/lib/server/rate-limit", () => ({
  limitarAsync: async () => ({ permitido: true, restanteSeg: 0 }),
  resposta429: () => Response.json({}, { status: 429 }),
}));
mock.module("@/lib/server/dados", () => ({
  aplicarSideEffects: async () => ({ notificacoes: [], audit: null }),
  ticketWire: (t: Record<string, unknown>) => t,
}));
(globalThis as unknown as { prisma: unknown }).prisma = {
  ticket: {
    create: async (q: { data: Record<string, unknown> }) => {
      criados.push(q.data);
      return { id: "t1", ...q.data, usuario: { nome: "Fulano" } };
    },
  },
};
const { POST } = await import("./route");
const abrir = (body: unknown) => POST(new Request("http://x/api/tickets", { method: "POST", body: JSON.stringify(body) }) as never);
const valido = { assunto: "Não consigo entrar", mensagem: "A câmera não liga.", categoria: "tecnico" };

beforeEach(() => {
  papel = "PACIENTE";
  criados = [];
});

test("perfil vem do papel: paciente, médico e admin", async () => {
  for (const [role, perfil] of [["PACIENTE", "paciente"], ["MEDICO", "medico"], ["ADMIN", "admin"]]) {
    papel = role;
    expect((await abrir(valido)).status).toBe(200);
    expect(criados.at(-1)?.perfil).toBe(perfil);
  }
});

test("o perfil enviado pelo cliente é ignorado", async () => {
  papel = "ADMIN";
  await abrir({ ...valido, perfil: "paciente" });
  expect(criados[0]?.perfil).toBe("admin");
});

test("categoria: fora da lista → 400; ausente → outro; válida fica", async () => {
  expect((await abrir({ ...valido, categoria: "hackear" })).status).toBe(400);
  expect(criados.length).toBe(0);
  await abrir({ assunto: "A", mensagem: "B" });
  expect(criados[0]?.categoria).toBe("outro");
  await abrir(valido);
  expect(criados[1]?.categoria).toBe("tecnico");
});

test("assunto e mensagem: vazios ou acima do teto → 400 sem gravar", async () => {
  for (const corpo of [
    { ...valido, assunto: "  " },
    { ...valido, mensagem: "" },
    { ...valido, assunto: "x".repeat(151) },
    { ...valido, mensagem: "x".repeat(4001) },
  ]) {
    expect((await abrir(corpo)).status).toBe(400);
  }
  expect(criados.length).toBe(0);
  expect((await abrir({ ...valido, assunto: "x".repeat(150), mensagem: "y".repeat(4000) })).status).toBe(200);
});

test("Torre: chamado de admin tem rótulo próprio e não abre ficha de paciente", async () => {
  const { pessoaDoChamado, rotuloPerfilChamado } = await import("@/components/bion/admin/suporte/chamados");
  expect(rotuloPerfilChamado("admin")).toBe("Administrador");
  expect(pessoaDoChamado({ usuario: "Fulano", perfil: "admin" }, [], [{ id: "p1", nome: "Fulano" }])).toEqual({ destino: null, homonimo: false });
});

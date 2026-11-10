/**
 * POST /api/mensagens pelo ADMIN: destinatário arquivado, suspenso, inativo
 * ou anonimizado (login fora de "ativo") é recusado no servidor, sem criar
 * mensagem — a garantia por trás do filtro da lista do admin
 * (admin/contatos-mensagens.ts; auditoria admin 09/11).
 * Rodar: bun --conditions=react-server test ./src/app/api/mensagens/admin-destinatario.teste.ts
 */
import { expect, mock, test } from "bun:test";

mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "cadmin000000000000000000a", nome: "Admin", email: "a@t.local", role: "ADMIN" }),
  registrarAudit: async () => ({}),
}));
mock.module("@/lib/server/rate-limit", () => ({
  limitarAsync: async () => ({ permitido: true, restanteSeg: 0 }),
  resposta429: () => Response.json({}, { status: 429 }),
}));
mock.module("@/lib/server/dados", () => ({ aplicarSideEffects: async () => ({ notificacoes: [], audit: null }) }));
mock.module("@/lib/server/push-notificacao", () => ({ agendarPushNotificacao: () => {} }));
mock.module("@/lib/supabase/broadcast", () => ({ broadcastCanal: async () => {} }));

let statusDestino = "inativo";
let criadas = 0;
(globalThis as unknown as { prisma: unknown }).prisma = {
  user: { findUnique: async () => ({ id: "cdestino00000000000000000a", nome: "X", status: statusDestino, role: "PACIENTE" }) },
  mensagem: {
    create: async () => {
      criadas++;
      throw new Error("não deveria criar");
    },
  },
};
const { POST } = await import("./route");

test("admin → inativo/anonimizado, suspenso ou arquivado (login inativo): 404 sem criar", async () => {
  for (const s of ["inativo", "suspenso"]) {
    statusDestino = s;
    const r = await POST(
      new Request("http://x/api/mensagens", {
        method: "POST",
        body: JSON.stringify({ paraId: "cdestino00000000000000000a", texto: "Olá" }),
      }) as never,
    );
    expect(r.status).toBe(404);
  }
  expect(criadas).toBe(0);
});

/**
 * Trava do aceite (NVIDIA): paciente sem o aceite da versão atual NÃO chega
 * ao LLM — a rota responde 403 consentimento_ia_pendente e nenhuma chamada
 * (NVIDIA, Gemini ou fetch) é feita.
 * Rodar: bun --conditions=react-server test ./src/app/api/bion-ia/trava-aceite.teste.ts
 */
import { expect, mock, test } from "bun:test";

let chamadasLlm = 0;
let registro: { aceito: boolean; finalidade: string; createdAt: Date } | null = null;
let papel: "PACIENTE" | "MEDICO" = "PACIENTE";

mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "p1", nome: "Paciente Teste", email: "p@t.local", role: papel }),
}));
mock.module("@/lib/server/llm", () => ({
  chatComFonte: async () => {
    chamadasLlm++;
    return { texto: "x", raciocinio: "", fonte: "nvidia", modelo: "m", registros: [] };
  },
  chatStreamComFonte: async function* () {
    chamadasLlm++;
    yield { tipo: "fim", fonte: "nvidia", modelo: "m" };
  },
  iaPausada: () => false,
  motivoFalhaIa: () => "falha",
  novoRequestId: () => "req-teste",
  respostaIaPausada: () => Response.json({ erro: "bion_ia_pausada" }, { status: 503 }),
}));
(globalThis as unknown as { prisma: unknown }).prisma = {
  consentimento: { findFirst: async () => registro },
  perfilPaciente: { findUnique: async () => null },
  consulta: { findMany: async () => [], count: async () => 0 },
};
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async () => {
  chamadasLlm++;
  throw new Error("fetch proibido no teste");
}) as unknown as typeof fetch;

const { POST } = await import("./route");
const { CODIGO_CONSENTIMENTO_IA_PENDENTE, FINALIDADE_CONSENTIMENTO_IA, FINALIDADE_REVOGACAO_IA } = await import(
  "@/lib/consentimento-ia"
);

const pedir = (stream: boolean) =>
  POST(
    new Request("http://teste/api/bion-ia", {
      method: "POST",
      body: JSON.stringify({ mensagens: [{ remetente: "usuario", texto: "Estou com dor de cabeça" }], stream }),
    }) as never,
  );

for (const stream of [false, true]) {
  test(`sem aceite (stream=${stream}) → 403 e nenhuma chamada ao LLM`, async () => {
    chamadasLlm = 0;
    registro = null;
    const r = await pedir(stream);
    expect(r.status).toBe(403);
    expect(((await r.json()) as { codigo: string }).codigo).toBe(CODIGO_CONSENTIMENTO_IA_PENDENTE);
    expect(chamadasLlm).toBe(0);
  });
}

test("aceite revogado → 403 e nenhuma chamada ao LLM", async () => {
  chamadasLlm = 0;
  registro = { aceito: false, finalidade: FINALIDADE_REVOGACAO_IA, createdAt: new Date() };
  expect((await pedir(true)).status).toBe(403);
  expect(chamadasLlm).toBe(0);
});

test("aceite de versão antiga → 403 e nenhuma chamada ao LLM", async () => {
  chamadasLlm = 0;
  registro = { aceito: true, finalidade: "Uso da BION IA: ... (versão ia-nvidia-v1-2026-10-27)", createdAt: new Date() };
  expect((await pedir(false)).status).toBe(403);
  expect(chamadasLlm).toBe(0);
});

test("com o aceite atual → chega ao LLM", async () => {
  chamadasLlm = 0;
  registro = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
  const r = await pedir(false);
  expect(r.status).not.toBe(403);
  expect(chamadasLlm).toBe(1);
  globalThis.fetch = fetchOriginal;
});

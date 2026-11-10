/**
 * Trava do aceite (NVIDIA): paciente sem o aceite da versão atual NÃO chega
 * ao LLM — a rota responde 403 consentimento_ia_pendente e nenhuma chamada
 * (NVIDIA, Gemini ou fetch) é feita.
 * Rodar: bun --conditions=react-server test ./src/app/api/bion-ia/trava-aceite.teste.ts
 */
import { expect, mock, test } from "bun:test";

let chamadasLlm = 0;
let ultimasMensagens: { role: string; content: string }[] = [];
let registro: { aceito: boolean; finalidade: string; createdAt: Date } | null = null;
let papel: "PACIENTE" | "MEDICO" = "PACIENTE";
let termosAceitos: string[] = [];

mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "p1", nome: "Paciente Teste", email: "p@t.local", role: papel }),
  exigirPapel: async () => ({ id: "p1", nome: "Paciente Teste", email: "p@t.local", role: papel }),
  registrarAudit: async () => ({ id: "a1" }),
}));
mock.module("@/lib/server/llm", () => ({
  chatComFonte: async (msgs: { role: string; content: string }[]) => {
    chamadasLlm++;
    ultimasMensagens = msgs;
    return { texto: "Desde quando dói?\n[[AGENDAR: Clínica Médica | M1]]", raciocinio: "", fonte: "nvidia", modelo: "m", registros: [] };
  },
  chatStreamComFonte: async function* () {
    chamadasLlm++;
    yield { tipo: "fim", fonte: "nvidia", modelo: "m" };
  },
  iaPausada: () => false,
  motivoFalhaIa: () => "falha",
  mensagemFalhaIaPaciente: () => "falha",
  novoRequestId: () => "req-teste",
  respostaIaPausada: () => Response.json({ erro: "bion_ia_pausada" }, { status: 503 }),
}));
(globalThis as unknown as { prisma: unknown }).prisma = {
  consentimento: { findFirst: async () => registro, findMany: async () => termosAceitos.map((finalidade) => ({ finalidade })) },
  perfilPaciente: {
    findUnique: async () => ({ idade: 34, dataNascimento: null, genero: "feminino", alergias: '["dipirona"]', medicamentos: "[]", comorbidades: '["enxaqueca"]', cpf: "", telefone: "" }),
  },
  consulta: { findMany: async () => [], count: async () => 0 },
  exameLaboratorial: { findMany: async () => [{ titulo: "Hemograma", dataColeta: new Date("2026-10-01T12:00:00Z") }] },
  anamnese: { findMany: async () => [] },
  perfilMedico: { findMany: async () => [{ especialidade: "Clínica Médica", user: { id: "med-1", nome: "Dra. B" } }] },
  medicamentoEmUso: { findMany: async () => [] },
};
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async () => {
  chamadasLlm++;
  throw new Error("fetch proibido no teste");
}) as unknown as typeof fetch;

const { POST } = await import("./route");
const { finalidadePrivacidade, finalidadeTermos, VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } = await import("@/lib/aceite-termos");
const termosVigentes = [finalidadePrivacidade(VERSAO_PRIVACIDADE), finalidadeTermos(VERSAO_TERMOS_PACIENTE)];
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

test("clique único antigo (v2, Termos + IA juntos) → 403: precisa do consentimento separado v3", async () => {
  chamadasLlm = 0;
  termosAceitos = termosVigentes;
  registro = {
    aceito: true,
    finalidade: "Uso da BION IA: mensagens e laudos enviados à NVIDIA (EUA); aceite de x e y (versão ia-nvidia-v2-2026-10-28)",
    createdAt: new Date(),
  };
  const r = await pedir(false);
  expect(r.status).toBe(403);
  expect(((await r.json()) as { termosPendentes: boolean }).termosPendentes).toBe(false);
  expect(chamadasLlm).toBe(0);
});

test("aviso da IA aceito mas Termos novos pendentes → 403 e nenhuma chamada ao LLM", async () => {
  chamadasLlm = 0;
  termosAceitos = [];
  registro = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
  const r = await pedir(true);
  expect(r.status).toBe(403);
  expect(((await r.json()) as { termosPendentes: boolean }).termosPendentes).toBe(true);
  expect((await pedir(false)).status).toBe(403);
  expect(chamadasLlm).toBe(0);
});

test("com os dois aceites atuais → chega ao LLM", async () => {
  chamadasLlm = 0;
  termosAceitos = termosVigentes;
  registro = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
  const r = await pedir(false);
  expect(r.status).not.toBe(403);
  expect(chamadasLlm).toBe(1);
  // contexto: system com papel + perfil; ação separada do texto
  expect(ultimasMensagens[0].content).toContain("app de telemedicina BION");
  expect(ultimasMensagens[0].content).toContain("dipirona");
  expect(ultimasMensagens[0].content).toContain("M1 (Clínica Médica)");
  expect(JSON.stringify(ultimasMensagens)).not.toContain("Dra. B");
  expect(ultimasMensagens[0].content).toContain("SAMU 192");
  const j = (await r.json()) as { resposta: string; acao: unknown };
  expect(j.resposta).toBe("Desde quando dói?");
  // o servidor troca M1 pelo médico ao montar o card
  expect(j.acao).toEqual({ tipo: "agendar", especialidade: "Clínica Médica", medicoId: "med-1", medico: "Dra. B" });
});

test("saudação ('Bom dia') também leva o contexto e o histórico vai inteiro (até 12)", async () => {
  const hist = Array.from({ length: 14 }, (_, i) => ({ remetente: i % 2 ? "ia" : "usuario", texto: `msg ${i} ` + "x".repeat(600) }));
  hist.push({ remetente: "usuario", texto: "Bom dia" });
  await POST(new Request("http://teste/api/bion-ia", { method: "POST", body: JSON.stringify({ mensagens: hist }) }) as never);
  expect(ultimasMensagens[0].content).toContain("dipirona");
  expect(ultimasMensagens.length).toBe(13);
  expect(ultimasMensagens.at(-1)?.content).toBe("Bom dia");
  globalThis.fetch = fetchOriginal;
});

test("paciente: CPF, telefone, e-mail e nomes de terceiros saem antes da IA", async () => {
  termosAceitos = termosVigentes;
  registro = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
  await POST(
    new Request("http://teste/api/bion-ia", {
      method: "POST",
      body: JSON.stringify({
        mensagens: [{ remetente: "usuario", texto: "Minha filha Ana Paula tem febre. CPF 123.456.789-09, tel (11) 98765-4321, x@y.com" }],
      }),
    }) as never,
  );
  const u = ultimasMensagens.at(-1)?.content ?? "";
  for (const proibido of ["Ana Paula", "123.456.789-09", "98765-4321", "x@y.com"]) expect(u).not.toContain(proibido);
  expect(u).toContain("febre");
});
test("histórico enviado à IA: no máximo 12 mensagens", async () => {
  const hist = Array.from({ length: 30 }, (_, i) => ({ remetente: i % 2 ? "ia" : "usuario", texto: `m${i}` }));
  await POST(new Request("http://teste/api/bion-ia", { method: "POST", body: JSON.stringify({ mensagens: hist }) }) as never);
  expect(ultimasMensagens.length - 1).toBeLessThanOrEqual(12);
});

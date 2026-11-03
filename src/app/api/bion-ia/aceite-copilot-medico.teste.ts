/**
 * LGPD — Copilot do MÉDICO: sem o aceite da versão atual, /api/bion-ia
 * responde 403 aceite_copilot_medico e nada vai ao LLM; erro de banco também
 * bloqueia (falha fechada); com aceite, o histórico vai cortado em 12.
 * A paciente não passa por este portão.
 * Rodar: bun --conditions=react-server test ./src/app/api/bion-ia/aceite-copilot-medico.teste.ts
 */
import { expect, mock, test } from "bun:test";

let chamadasLlm = 0;
let ultimasMensagens: { role: string; content: string }[] = [];
let papel: "PACIENTE" | "MEDICO" = "MEDICO";
let registroMedico: { aceito: boolean; finalidade: string; createdAt: Date } | null = null;
let registroPaciente: { aceito: boolean; finalidade: string; createdAt: Date } | null = null;
let falharBanco = false;
let termosAceitos: string[] = [];

mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "u1", nome: "Usuário Teste", email: "u@t.local", role: papel }),
  exigirPapel: async () => ({ id: "u1", nome: "Usuário Teste", email: "u@t.local", role: papel }),
  registrarAudit: async () => ({ id: "a1" }),
}));
mock.module("@/lib/server/llm", () => ({
  chatComFonte: async (msgs: { role: string; content: string }[]) => {
    chamadasLlm++;
    ultimasMensagens = msgs;
    return { texto: "ok", raciocinio: "", fonte: "nvidia", modelo: "m", registros: [] };
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
  consentimento: {
    findFirst: async (q: { where: { perfil?: string } }) => {
      if (falharBanco) throw new Error("banco fora");
      return q.where.perfil === "MEDICO" ? registroMedico : registroPaciente;
    },
    findMany: async () => termosAceitos.map((finalidade) => ({ finalidade })),
  },
  perfilPaciente: {
    findUnique: async () => ({ idade: 34, dataNascimento: null, genero: "feminino", alergias: "[]", medicamentos: "[]", comorbidades: "[]", cpf: "", telefone: "" }),
  },
  perfilMedico: { findUnique: async () => ({ especialidade: "Clínica Médica", crm: "CRM 1" }), findMany: async () => [] },
  consulta: { findMany: async () => [], count: async () => 0 },
  exameLaboratorial: { findMany: async () => [] },
  anamnese: { findMany: async () => [] },
  medicamentoEmUso: { findMany: async () => [] },
};
globalThis.fetch = (async () => {
  chamadasLlm++;
  throw new Error("fetch proibido no teste");
}) as unknown as typeof fetch;

const { POST } = await import("./route");
const { CODIGO_ACEITE_COPILOT_MEDICO, FINALIDADE_ACEITE_COPILOT_MEDICO, PREFIXO_FINALIDADE_COPILOT_MEDICO } = await import(
  "@/lib/aceite-copilot-medico"
);
const { FINALIDADE_CONSENTIMENTO_IA } = await import("@/lib/consentimento-ia");
const { finalidadePrivacidade, finalidadeTermos, VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } = await import("@/lib/aceite-termos");

const pedir = (mensagens: { remetente: string; texto: string }[], stream = false) =>
  POST(new Request("http://teste/api/bion-ia", { method: "POST", body: JSON.stringify({ mensagens, stream }) }) as never);
const uma = [{ remetente: "usuario", texto: "Dose de amoxicilina em adulto?" }];

function reset() {
  chamadasLlm = 0;
  falharBanco = false;
  papel = "MEDICO";
  registroMedico = null;
  registroPaciente = null;
  termosAceitos = [];
}

for (const stream of [false, true]) {
  test(`médico sem aceite (stream=${stream}) → 403 aceite_copilot_medico, nada ao LLM`, async () => {
    reset();
    const r = await pedir(uma, stream);
    expect(r.status).toBe(403);
    expect(((await r.json()) as { codigo: string }).codigo).toBe(CODIGO_ACEITE_COPILOT_MEDICO);
    expect(chamadasLlm).toBe(0);
  });
}

test("médico com aceite de versão antiga → 403", async () => {
  reset();
  registroMedico = { aceito: true, finalidade: `${PREFIXO_FINALIDADE_COPILOT_MEDICO}: x (versão copilot-medico-v0)`, createdAt: new Date() };
  expect((await pedir(uma)).status).toBe(403);
  expect(chamadasLlm).toBe(0);
});

test("erro no banco → 403 (falha fechada)", async () => {
  reset();
  falharBanco = true;
  expect((await pedir(uma)).status).toBe(403);
  expect(chamadasLlm).toBe(0);
});

test("médico com aceite vigente → 200 e no máximo 12 mensagens de histórico", async () => {
  reset();
  registroMedico = { aceito: true, finalidade: FINALIDADE_ACEITE_COPILOT_MEDICO, createdAt: new Date() };
  const muitas = Array.from({ length: 30 }, (_, i) => ({ remetente: i % 2 ? "ia" : "usuario", texto: `msg ${i}` }));
  const r = await pedir(muitas);
  expect(r.status).toBe(200);
  expect(chamadasLlm).toBe(1);
  // 1 instrução do sistema + 12 do histórico
  expect(ultimasMensagens.length).toBe(13);
  expect(ultimasMensagens.at(-1)?.content).toBe("msg 29");
});

test("paciente não passa pelo portão do Copilot (fluxo inalterado)", async () => {
  reset();
  papel = "PACIENTE";
  registroPaciente = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
  termosAceitos = [finalidadePrivacidade(VERSAO_PRIVACIDADE), finalidadeTermos(VERSAO_TERMOS_PACIENTE)];
  const r = await pedir(uma);
  expect(r.status).toBe(200);
  expect(chamadasLlm).toBe(1);
});

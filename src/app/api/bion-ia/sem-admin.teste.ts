/**
 * LGPD — o chat geral da BION IA (POST /api/bion-ia) é só de PACIENTE e
 * MEDICO: o ADMIN recebe 403 antes de ler o corpo e sem nenhuma chamada à IA
 * (stream e não-stream). Paciente com consentimento e médico com o aceite do
 * Copilot continuam passando.
 * Rodar: bun --conditions=react-server test ./src/app/api/bion-ia/sem-admin.teste.ts
 */
import { expect, mock, test } from "bun:test";

let chamadasLlm = 0;
let ultimasMensagens: { role: string; content: string }[] = [];
let papel: "PACIENTE" | "MEDICO" | "ADMIN" = "MEDICO";
let registroMedico: { aceito: boolean; finalidade: string; createdAt: Date } | null = null;
let registroPaciente: { aceito: boolean; finalidade: string; createdAt: Date } | null = null;
let falharBanco = false;
let termosAceitos: string[] = [];

mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "u1", nome: "Usuário Teste", email: "u@t.local", role: papel }),
  // Mesma regra do exigirPapel real: papel fora da lista → erro com status 403.
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes(papel)) throw Object.assign(new Error("Acesso negado"), { status: 403 });
    return { id: "u1", nome: "Usuário Teste", email: "u@t.local", role: papel };
  },
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
  mensagemFalhaIaPaciente: () => "falha",
  motivoFalhaIa: () => "falha",
  mensagemFalhaIaPaciente: () => "falha",
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

const novoPedido = (mensagens: { remetente: string; texto: string }[], stream = false) =>
  new Request("http://teste/api/bion-ia", { method: "POST", body: JSON.stringify({ mensagens, stream }) });
const pedir = (mensagens: { remetente: string; texto: string }[], stream = false) => POST(novoPedido(mensagens, stream) as never);
const uma = [{ remetente: "usuario", texto: "Paciente Maria Souza, CPF 123.456.789-00, com dor no peito" }];

function reset() {
  chamadasLlm = 0;
  falharBanco = false;
  papel = "MEDICO";
  registroMedico = null;
  registroPaciente = null;
  termosAceitos = [];
}

for (const stream of [false, true]) {
  test(`admin (stream=${stream}) → 403, corpo não lido e nada vai à IA`, async () => {
    reset();
    papel = "ADMIN";
    // mesmo com todos os aceites gravados, o papel barra antes
    registroMedico = { aceito: true, finalidade: FINALIDADE_ACEITE_COPILOT_MEDICO, createdAt: new Date() };
    registroPaciente = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
    termosAceitos = [finalidadePrivacidade(VERSAO_PRIVACIDADE), finalidadeTermos(VERSAO_TERMOS_PACIENTE)];
    const req = novoPedido(uma, stream);
    const r = await POST(req as never);
    expect(r.status).toBe(403);
    expect(req.bodyUsed).toBe(false);
    expect(chamadasLlm).toBe(0);
  });
}

for (const stream of [false, true]) {
  test(`médico com aceite vigente (stream=${stream}) → passa e chega à IA`, async () => {
    reset();
    registroMedico = { aceito: true, finalidade: FINALIDADE_ACEITE_COPILOT_MEDICO, createdAt: new Date() };
    const r = await pedir(uma, stream);
    expect(r.status).toBe(200);
    if (stream) await r.text();
    expect(chamadasLlm).toBe(1);
  });

  test(`paciente com consentimento (stream=${stream}) → passa e chega à IA`, async () => {
    reset();
    papel = "PACIENTE";
    registroPaciente = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
    termosAceitos = [finalidadePrivacidade(VERSAO_PRIVACIDADE), finalidadeTermos(VERSAO_TERMOS_PACIENTE)];
    const r = await pedir(uma, stream);
    expect(r.status).toBe(200);
    if (stream) await r.text();
    expect(chamadasLlm).toBe(1);
  });
}

test("portões de aceite continuam valendo: médico sem aceite → 403, paciente sem consentimento → 403", async () => {
  reset();
  expect((await pedir(uma)).status).toBe(403);
  papel = "PACIENTE";
  expect((await pedir(uma)).status).toBe(403);
  expect(chamadasLlm).toBe(0);
});

/**
 * Triagem (/api/anamnese) sem consentimento válido da IA (ausente, v2 antigo
 * ou revogado): NUNCA chama o LLM — segue no motor local.
 * Rodar: bun --conditions=react-server test ./src/app/api/anamnese/trava-consentimento-ia.teste.ts
 */
import { expect, mock, test } from "bun:test";

process.env.BION_ANAMNESE_LLM = "1"; // IA ligada no servidor: só o consentimento barra
delete process.env.BION_MOTOR_LOCAL;

let chamadasLlm = 0;
let registroIa: { aceito: boolean; finalidade: string; createdAt: Date } | null = null;
let termos: string[] = [];

mock.module("@/lib/server/auth", () => ({
  exigirPapel: async () => ({ id: "p1", nome: "Paciente Teste", email: "p@t.local", role: "PACIENTE" }),
  exigirSessao: async () => ({ id: "p1", nome: "Paciente Teste", email: "p@t.local", role: "PACIENTE" }),
  registrarAudit: async () => ({ id: "a1" }),
}));
mock.module("@/lib/server/llm", () => ({
  chatComFonte: async () => {
    chamadasLlm++;
    return { texto: '{"resposta":"ok","etapa":"identificacao","coleta":{}}', fonte: "nvidia", modelo: "m", registros: [] };
  },
  iaPausada: () => false,
}));

const consulta = {
  id: "c1",
  pacienteId: "p1",
  status: "confirmada",
  pago: true,
  especialidade: "Clínica Médica",
  dataInicio: new Date(Date.now() + 2 * 86_400_000),
  medico: { nome: "Dra. B" },
  anamnese: { id: "a1", status: "em_andamento", etapa: "queixa", coleta: "{}", consultaId: "c1", usuarioId: "p1" },
};
const generico = (): unknown =>
  new Proxy(
    {},
    {
      get: (_t, metodo: string) => async () => {
        if (metodo.startsWith("findMany")) return [];
        if (metodo === "count") return 0;
        if (metodo.startsWith("find")) return null;
        return { id: "x", coleta: "{}", etapa: "queixa", status: "em_andamento" };
      },
    },
  );
(globalThis as unknown as { prisma: unknown }).prisma = new Proxy(
  {
    consulta: { findFirst: async () => consulta, findUnique: async () => consulta, findMany: async () => [], update: async () => consulta },
    consentimento: {
      findFirst: async () => registroIa,
      findMany: async () => termos.map((finalidade) => ({ finalidade })),
    },
    $transaction: async (x: unknown) => (typeof x === "function" ? (x as (t: unknown) => unknown)(globalThis.prisma) : Promise.all(x as Promise<unknown>[])),
  } as Record<string, unknown>,
  { get: (t, k: string) => (k in t ? t[k] : generico()) },
);
globalThis.fetch = (async () => {
  chamadasLlm++;
  throw new Error("fetch proibido no teste");
}) as unknown as typeof fetch;

const { POST } = await import("./route");
const { finalidadePrivacidade, finalidadeTermos, VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } = await import("@/lib/aceite-termos");
const { FINALIDADE_CONSENTIMENTO_IA, FINALIDADE_REVOGACAO_IA } = await import("@/lib/consentimento-ia");
termos = [finalidadePrivacidade(VERSAO_PRIVACIDADE), finalidadeTermos(VERSAO_TERMOS_PACIENTE)];

const pedir = () =>
  POST(
    new Request("http://teste/api/anamnese", {
      method: "POST",
      body: JSON.stringify({ consultaId: "c1", mensagem: "Estou com dor de cabeça há 3 dias", historico: [{ remetente: "ia", texto: "O que sente?" }] }),
    }) as never,
  );

const casos: [string, typeof registroIa][] = [
  ["sem consentimento", null],
  ["clique único v2 antigo", { aceito: true, finalidade: "Uso da BION IA: ... (versão ia-nvidia-v2-2026-10-28)", createdAt: new Date() }],
  ["revogado", { aceito: false, finalidade: FINALIDADE_REVOGACAO_IA, createdAt: new Date() }],
];
for (const [nome, reg] of casos) {
  test(`triagem ${nome} → motor local, nenhuma chamada ao LLM`, async () => {
    chamadasLlm = 0;
    registroIa = reg;
    await pedir();
    expect(chamadasLlm).toBe(0);
  });
}

test("controle: com consentimento v3 e Termos vigentes o LLM é chamado", async () => {
  chamadasLlm = 0;
  registroIa = { aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA, createdAt: new Date() };
  await pedir();
  expect(chamadasLlm).toBeGreaterThan(0);
});

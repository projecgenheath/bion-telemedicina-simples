/**
 * Aceite e revogação do Copilot do médico: aceita → GET vigente e /api/bion-ia
 * libera; revoga (POST {aceito:false}) → novo registro aceito=false, GET
 * vigente=false e /api/bion-ia volta a 403 aceite_copilot_medico.
 * Rodar: bun --conditions=react-server test ./src/app/api/medico/copilot-aceite/route.teste.ts
 */
import { expect, mock, test } from "bun:test";

type Reg = { id: string; pacienteId: string; perfil: string; finalidade: string; aceito: boolean; createdAt: Date };
const registros: Reg[] = [];
const audits: { acao: string; detalhes?: string }[] = [];
let chamadasLlm = 0;

mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "m1", nome: "Dr. Teste", email: "m@t.local", role: "MEDICO" }),
  exigirPapel: async () => ({ id: "m1", nome: "Dr. Teste", email: "m@t.local", role: "MEDICO" }),
  registrarAudit: async (_u: unknown, a: { acao: string; detalhes?: string }) => {
    audits.push(a);
    return { id: `a${audits.length}` };
  },
}));
mock.module("@/lib/server/llm", () => ({
  chatComFonte: async () => {
    chamadasLlm++;
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
let seq = 0;
(globalThis as unknown as { prisma: unknown }).prisma = {
  consentimento: {
    create: async ({ data }: { data: Omit<Reg, "id" | "createdAt"> }) => {
      const r = { ...data, id: `c${++seq}`, createdAt: new Date(Date.now() + seq) };
      registros.push(r);
      return r;
    },
    delete: async () => undefined,
    findFirst: async ({ where }: { where: { pacienteId: string; perfil?: string; finalidade: { startsWith: string } } }) =>
      registros
        .filter((r) => r.pacienteId === where.pacienteId && (!where.perfil || r.perfil === where.perfil) && r.finalidade.startsWith(where.finalidade.startsWith))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    findMany: async () => [],
  },
  perfilMedico: { findUnique: async () => ({ especialidade: "Clínica Médica", crm: "CRM 1" }) },
  consulta: { findMany: async () => [], count: async () => 0 },
};
globalThis.fetch = (async () => {
  chamadasLlm++;
  throw new Error("fetch proibido no teste");
}) as unknown as typeof fetch;

const aceite = await import("./route");
const bionIa = await import("../../bion-ia/route");
const { VERSAO_ACEITE_COPILOT_MEDICO, CODIGO_ACEITE_COPILOT_MEDICO, PREFIXO_FINALIDADE_COPILOT_MEDICO } = await import("@/lib/aceite-copilot-medico");

const postAceite = (body: unknown) =>
  aceite.POST(new Request("http://t/api/medico/copilot-aceite", { method: "POST", body: JSON.stringify(body) }));
const vigente = async () => ((await (await aceite.GET()).json()) as { vigente: boolean }).vigente;
const perguntar = () =>
  bionIa.POST(new Request("http://t/api/bion-ia", { method: "POST", body: JSON.stringify({ mensagens: [{ remetente: "usuario", texto: "CID de cefaleia?" }] }) }) as never);

test("versão errada → 409, nada gravado", async () => {
  expect((await postAceite({ versao: "v0" })).status).toBe(409);
  expect(registros.length).toBe(0);
});

test("aceita → vigente e /api/bion-ia libera", async () => {
  expect((await postAceite({ versao: VERSAO_ACEITE_COPILOT_MEDICO })).status).toBe(200);
  expect(await vigente()).toBe(true);
  expect((await perguntar()).status).toBe(200);
  expect(chamadasLlm).toBe(1);
});

test("revoga → registro aceito=false, GET vigente=false, /api/bion-ia 403 de novo", async () => {
  chamadasLlm = 0;
  const r = await postAceite({ aceito: false });
  expect(r.status).toBe(200);
  const ultimo = registros.at(-1)!;
  expect(ultimo.aceito).toBe(false);
  expect(ultimo.perfil).toBe("MEDICO");
  expect(ultimo.finalidade.startsWith(PREFIXO_FINALIDADE_COPILOT_MEDICO)).toBe(true);
  expect(ultimo.finalidade).toContain(`(versão ${VERSAO_ACEITE_COPILOT_MEDICO})`);
  expect(audits.at(-1)?.acao).toBe("REVOGACAO_COPILOT_MEDICO");
  expect(audits.at(-1)?.detalhes).not.toContain("CID");
  expect(await vigente()).toBe(false);
  const p = await perguntar();
  expect(p.status).toBe(403);
  expect(((await p.json()) as { codigo: string }).codigo).toBe(CODIGO_ACEITE_COPILOT_MEDICO);
  expect(chamadasLlm).toBe(0);
});

test("aceita de novo depois de revogar → vigente", async () => {
  expect((await postAceite({ versao: VERSAO_ACEITE_COPILOT_MEDICO })).status).toBe(200);
  expect(await vigente()).toBe(true);
});

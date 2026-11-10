/**
 * GET /api/arquivos?id= — decisão do Alisson (10/11): o ADMIN NÃO baixa
 * arquivos. A regra de acesso REAL (arquivos-acesso.ts → podeAcessarArquivo)
 * roda sem mock; só a sessão, o banco e o Storage são simulados (para provar
 * que o Storage nem é chamado). Médico e paciente com acesso seguem
 * recebendo a URL assinada e o nome original.
 * Rodar: bun --conditions=react-server test ./src/app/api/arquivos/download-bloqueio-admin.teste.ts
 */
import { beforeEach, expect, mock, test } from "bun:test";

let papel: "ADMIN" | "MEDICO" | "PACIENTE" = "ADMIN";
const id = { ADMIN: "adm1", MEDICO: "m1", PACIENTE: "p1" };
mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: id[papel], nome: "X", role: papel }),
  registrarAudit: async () => null,
}));
mock.module("@/lib/supabase/env", () => ({
  supabaseServiceRoleKey: () => "dummy",
  supabaseConfigurado: () => true,
  supabaseUrl: () => "http://localhost",
  supabaseAnonKey: () => "anon",
}));
const chamadasStorage: string[] = [];
mock.module("@/lib/supabase/storage", () => ({
  uploadDocumento: async () => ((chamadasStorage.push("upload")), { path: "x" }),
  garantirBuckets: async () => void chamadasStorage.push("buckets"),
  urlAssinadaDocumento: async (p: string) => (chamadasStorage.push(`assinar:${p}`), `https://storage.exemplo/sign/documentos/${p}?token=t`),
}));

const linha = {
  id: "a1", nome: "receita-losartana.pdf", tipo: "Receita", tamanhoKb: 1, enviadoPor: "medico",
  usuarioId: "m1", pacienteId: "p1", consulta: "", storagePath: "m1/1760000000000-receita-losartana.pdf", createdAt: new Date(),
};
const consultasAoBanco: string[] = [];
(globalThis as unknown as { prisma: unknown }).prisma = {
  arquivo: {
    findUnique: async () => (consultasAoBanco.push("findUnique"), linha),
    // Banco simulado: devolve a linha quando a consulta é pelo id certo (a
    // regra de visibilidade em si é coberta pelos testes de arquivos-acesso).
    findFirst: async (q: { where: { AND: [{ id: string }] } }) => (consultasAoBanco.push("findFirst"), q.where.AND[0].id === linha.id ? { id: linha.id } : null),
  },
};

const { GET } = await import("./route");
const { NextRequest } = await import("next/server");
const req = (q: string) => new NextRequest(`http://localhost/api/arquivos?${q}`);

beforeEach(() => {
  chamadasStorage.length = 0;
  consultasAoBanco.length = 0;
});

for (const q of ["id=a1", "id=a1&baixar=1"]) {
  test(`admin: 403 sem URL assinada, sem bytes e sem Storage (${q})`, async () => {
    papel = "ADMIN";
    const r = await GET(req(q));
    expect(r.status).toBe(403);
    expect(r.headers.get("content-disposition")).toBeNull();
    const texto = await r.text();
    expect(JSON.parse(texto)).toEqual({ erro: "Acesso negado." });
    expect(texto).not.toContain("http");
    expect(texto).not.toContain("losartana");
    expect(chamadasStorage).toEqual([]);
    // Bloqueio pelo papel, antes de consultar a visibilidade no banco.
    expect(consultasAoBanco).toEqual(["findUnique"]);
  });
}

test("médico e paciente com acesso: URL assinada e nome original", async () => {
  for (const p of ["MEDICO", "PACIENTE"] as const) {
    papel = p;
    chamadasStorage.length = 0;
    const r = await GET(req("id=a1"));
    expect(r.status).toBe(200);
    const j = await r.json();
    const d = j.dados ?? j;
    expect(d.nome).toBe("receita-losartana.pdf");
    expect(d.url).toBe("https://storage.exemplo/sign/documentos/m1/1760000000000-receita-losartana.pdf?token=t");
    expect(chamadasStorage).toEqual(["assinar:m1/1760000000000-receita-losartana.pdf"]);
  }
});

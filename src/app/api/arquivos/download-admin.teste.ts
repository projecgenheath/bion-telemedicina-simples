/**
 * GET /api/arquivos?id=: o ADMIN nunca recebe a URL assinada (o caminho traz
 * o nome original); recebe um link para a própria rota, que entrega o
 * arquivo com Content-Disposition "Receita.pdf". Médico/paciente: sem mudança.
 * Rodar: bun --conditions=react-server test ./src/app/api/arquivos/download-admin.teste.ts
 */
import { expect, mock, test } from "bun:test";

let papel: "ADMIN" | "MEDICO" | "PACIENTE" = "ADMIN";
mock.module("@/lib/server/auth", () => ({
  exigirSessao: async () => ({ id: "u1", nome: "X", role: papel }),
  registrarAudit: async () => null,
}));
mock.module("@/lib/server/arquivos-acesso", () => ({
  podeAcessarArquivo: async () => true,
  resolverDestinoUpload: async () => ({ ok: true, pacienteId: null }),
  whereArquivosVisiveis: () => ({}),
}));
mock.module("@/lib/supabase/env", () => ({
  supabaseServiceRoleKey: () => "dummy",
  supabaseConfigurado: () => true,
  supabaseUrl: () => "http://localhost",
  supabaseAnonKey: () => "anon",
}));
mock.module("@/lib/supabase/storage", () => ({
  uploadDocumento: async () => ({ path: "x" }),
  garantirBuckets: async () => {},
  urlAssinadaDocumento: async (p: string) => `https://storage.exemplo/sign/documentos/${p}?token=t`,
  baixarDocumento: async () => new Blob(["%PDF-1.4 conteudo"], { type: "application/pdf" }),
}));
(globalThis as unknown as { prisma: unknown }).prisma = {
  arquivo: {
    findUnique: async () => ({
      id: "a1", nome: "receita-losartana.pdf", tipo: "Receita", tamanhoKb: 1, enviadoPor: "medico",
      usuarioId: "m1", pacienteId: "p1", consulta: "", storagePath: "m1/1760000000000-receita-losartana.pdf", createdAt: new Date(),
    }),
  },
};
const { GET } = await import("./route");
const { NextRequest } = await import("next/server");
const req = (q: string) => new NextRequest(`http://localhost/api/arquivos?${q}`);

test("admin: link interno + nome neutro, sem URL assinada", async () => {
  papel = "ADMIN";
  const r = await GET(req("id=a1"));
  const texto = await r.text();
  expect(texto).not.toContain("losartana");
  const j = JSON.parse(texto);
  const d = j.dados ?? j;
  expect(d).toMatchObject({ url: "/api/arquivos?id=a1&baixar=1", nome: "Receita.pdf" });
});

test("admin: &baixar=1 entrega o arquivo como Receita.pdf", async () => {
  papel = "ADMIN";
  const r = await GET(req("id=a1&baixar=1"));
  expect(r.status).toBe(200);
  expect(r.headers.get("content-disposition")).toBe(`attachment; filename="Receita.pdf"; filename*=UTF-8''Receita.pdf`);
  expect(r.headers.get("content-type")).toBe("application/pdf");
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(await r.text()).toStartWith("%PDF");
});

test("médico e paciente: URL assinada e nome original (sem mudança)", async () => {
  for (const p of ["MEDICO", "PACIENTE"] as const) {
    papel = p;
    const j = await (await GET(req("id=a1&baixar=1"))).json();
    const d = j.dados ?? j;
    expect(d.nome).toBe("receita-losartana.pdf");
    expect(d.url).toContain("receita-losartana.pdf?token=");
  }
});

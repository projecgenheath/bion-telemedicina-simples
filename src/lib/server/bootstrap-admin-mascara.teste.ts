/**
 * Bootstrap (carregarDados) com banco simulado: o ADMIN recebe arquivos só
 * como "Receita.pdf"/"Exame.jpg"… e a auditoria antiga mascarada na leitura;
 * médico e paciente recebem os mesmos registros sem mudança
 * (decisão do Alisson, 09/11).
 * Rodar: bun --conditions=react-server test ./src/lib/server/bootstrap-admin-mascara.teste.ts
 */
import { expect, mock, test } from "bun:test";

mock.module("@/lib/supabase/broadcast", () => ({ broadcastCanal: async () => {} }));

const data = new Date("2026-10-01T12:00:00Z");
const arquivos = [
  { id: "a1", nome: "receita-losartana.pdf", tipo: "Receita", tamanhoKb: 120, enviadoPor: "medico", usuarioId: "m1", pacienteId: "p1", consulta: "Clínica Geral — Dra. Ana", storagePath: "m1/1760000000000-receita-losartana.pdf", createdAt: data },
  { id: "a2", nome: "eletrocardiograma-laudo.PDF", tipo: "Exame cardiológico", tamanhoKb: 650, enviadoPor: "paciente", usuarioId: "p1", pacienteId: "p1", consulta: "", storagePath: null, createdAt: data },
  { id: "a3", nome: "hiv-resultado.exe", tipo: "Documento", tamanhoKb: 5, enviadoPor: "paciente", usuarioId: "p1", pacienteId: "p1", consulta: "", storagePath: null, createdAt: data },
];
const log = (id: string, acao: string, detalhes: string) => ({
  id, acao, categoria: "documento", severidade: "info", usuarioId: "u", usuarioNome: "Dra. Ana Ribeiro", role: "MEDICO",
  entidade: "documento", entidadeId: "d1", detalhes, createdAt: data,
});
const auditoria = [
  log("l1", "DOCUMENTO_EMITIDO", "Receita: Receita — Losartana 50mg para Marina Silva"),
  log("l2", "EXAME_REGISTRADO", 'Exame "Hemograma completo + PCR" registrado manualmente (12 resultados)'),
  log("l3", "DOCUMENTO_VISUALIZADO", "Visualização: Atestado — 2 dias de afastamento (atestado)"),
  log("l4", "DOCUMENTO_PDF_BAIXADO", "Download PDF: Solicitação — Sorologia HIV (exame_solicitado)"),
  log("l5", "ARQUIVO_ENVIADO", "receita-losartana.pdf (Receita, 120KB) [storage] → paciente p1"),
  log("l6", "LOGIN", "Login realizado com sucesso"),
];
const segredos = ["Losartana", "Hemograma", "afastamento", "Sorologia", "HIV", "hiv", "eletrocardiograma", "cardiológico", "receita-losartana"];

let filtroArquivos: unknown = null;
const vazio = new Proxy({}, {
  get: (_t, op) => {
    if (op === "findMany") return async () => [];
    if (op === "count") return async () => 0;
    if (op === "groupBy" || op === "aggregate") return async () => (op === "groupBy" ? [] : { _avg: {}, _count: { _all: 0 } });
    return async () => null;
  },
});
(globalThis as unknown as { prisma: unknown }).prisma = new Proxy({}, {
  get: (_t, modelo) => {
    if (modelo === "arquivo") return { findMany: async (q: { where: unknown }) => ((filtroArquivos = q.where), arquivos) };
    if (modelo === "auditLog") return { findMany: async () => auditoria };
    if (modelo === "$transaction") return async (x: unknown) => (Array.isArray(x) ? Promise.all(x) : x);
    return vazio;
  },
});

const { carregarDados } = await import("./dados");
const usuario = (role: "ADMIN" | "MEDICO" | "PACIENTE") =>
  ({ id: role === "ADMIN" ? "adm" : role === "MEDICO" ? "m1" : "p1", nome: "X", email: "x@x", role, status: "ativo" }) as never;

test("admin: arquivos só com tipo + extensão neutra; sem caminho do Storage", async () => {
  const d = await carregarDados(usuario("ADMIN"));
  expect(d.arquivos.map((a) => [a.nome, a.tipo, a.storagePath])).toEqual([
    ["Receita.pdf", "Receita", "restrito"],
    ["Exame.pdf", "Exame", null],
    ["Documento", "Documento", null],
  ]);
  const texto = JSON.stringify(d);
  for (const s of segredos) expect(texto).not.toContain(s);
});

test("admin: auditoria antiga mascarada na leitura", async () => {
  const d = await carregarDados(usuario("ADMIN"));
  expect(d.auditLogs.map((l) => l.detalhes)).toEqual([
    "Emissão de receita para Marina Silva (título omitido)",
    "Exame registrado manualmente (12 resultados)",
    "Visualização: Atestado (título omitido)",
    "Download PDF: Solicitação (título omitido)",
    "Receita.pdf (Receita, 120KB) [storage] → paciente p1",
    "Login realizado com sucesso",
  ]);
  // O banco não é tocado: os objetos de origem continuam com o texto original.
  expect(auditoria[0].detalhes).toContain("Losartana");
});

test("médico e paciente: arquivos sem mudança", async () => {
  for (const role of ["MEDICO", "PACIENTE"] as const) {
    const d = await carregarDados(usuario(role));
    expect(d.arquivos.map((a) => [a.nome, a.tipo, a.storagePath])).toEqual(
      arquivos.map((a) => [a.nome, a.tipo, a.storagePath]),
    );
    expect(d.auditLogs).toEqual([]); // só o admin recebe a trilha
  }
  expect(filtroArquivos).not.toBeNull();
});

/**
 * Cancelamento de documento pelo médico emissor (20261103a): permissão,
 * idempotência e bloqueio da renovação. Funções puras + checagens estáticas.
 * Rodar: bun --conditions=react-server test src/components/bion/medico/cancelar-documento.teste.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "bun:test";
import { decidirCancelamento, documentoCancelado, lerMotivo, MOTIVO_MAX } from "./cancelar-documento";
import { podeRenovarReceita } from "../../../lib/atendimento-tipo";

const ler = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const rota = ler("src/app/api/medico/documentos/[id]/cancelar/route.ts");
const renovPaciente = ler("src/app/api/renovacoes/route.ts");
const renovMedico = ler("src/app/api/medico/renovacoes/[id]/responder/route.ts");
const pdf = ler("src/lib/receita-pdf.ts");
const tela = ler("src/components/bion/medico/ProntuarioPaciente.tsx");

const doc = { id: "d1", medicoId: "m1", status: "emitido", canceladoEm: null };

test("permissão: só o médico emissor cancela; outro médico/inexistente = 404", () => {
  expect(decidirCancelamento(doc, "m1").tipo).toBe("cancelar");
  expect(decidirCancelamento(doc, "m2").tipo).toBe("nao_encontrado");
  expect(decidirCancelamento(null, "m1").tipo).toBe("nao_encontrado");
  expect(decidirCancelamento(doc, "").tipo).toBe("nao_encontrado");
  expect(rota).toContain('exigirPapel("MEDICO")');
  expect(rota).toContain("status: 404");
  expect(rota).toMatch(/where: \{ id: doc\.id, medicoId: medico\.id/);
});

test("idempotência: já cancelado não regrava", () => {
  const c = decidirCancelamento({ ...doc, status: "cancelado", canceladoEm: "2026-11-03T12:00:00.000Z" }, "m1");
  expect(c).toEqual({ tipo: "ja_cancelado", canceladoEm: "2026-11-03T12:00:00.000Z" });
  expect(rota).toContain("jaCancelado: true");
  expect(rota).toMatch(/status: \{ not: STATUS_DOCUMENTO_CANCELADO \}/);
});

test("nunca apaga e audita", () => {
  expect(rota).not.toMatch(/\.delete(Many)?\(/);
  expect(rota).toContain('acao: "DOCUMENTO_CANCELADO"');
  expect(rota).toContain("canceladoEm: agora");
});

test("motivo opcional", () => {
  expect(lerMotivo(undefined)).toBeNull();
  expect(lerMotivo("  ")).toBeNull();
  expect(lerMotivo(" erro de digitação ")).toBe("erro de digitação");
  expect(lerMotivo("x".repeat(999))?.length).toBe(MOTIVO_MAX);
});

test("renovação bloqueada para documento cancelado", () => {
  const receita = { tipo: "receita", medicamento: "Losartana 50mg", posologia: "1x ao dia" };
  expect(podeRenovarReceita(receita)).toBe(true);
  expect(podeRenovarReceita({ ...receita, status: "cancelado" })).toBe(false);
  expect(documentoCancelado({ status: "cancelado" })).toBe(true);
  expect(documentoCancelado({ status: "emitido" })).toBe(false);
  expect(renovPaciente).toMatch(/receita\.status === "cancelado"[\s\S]{0,200}status: 409/);
  expect(renovMedico).toMatch(/pedido\.documento\?\.status === "cancelado"[\s\S]{0,200}status: 409/);
  expect(tela).toContain('!documentoCancelado(entrada.docs[0])');
});

test("PDF e lista mostram cancelado", () => {
  expect(pdf).toContain('if (d.status === "cancelado") carimbarCancelado(doc, d.canceladoEm);');
  expect(pdf).toContain('"CANCELADO"');
  expect(tela).toContain("<SeloCancelado");
  expect(tela).toContain("window.confirm(");
});

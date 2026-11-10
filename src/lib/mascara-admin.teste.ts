/**
 * Máscara do admin: nomes de arquivo e auditoria antiga (decisão do Alisson, 09/11).
 * Amostras no formato real de cada gravador (api/documentos:155,
 * api/exames:119, api/arquivos, Receitas.tsx:313/:666, lgpd.ts, seed).
 * Rodar: bun --conditions=react-server test ./src/lib/mascara-admin.teste.ts
 */
import { describe, expect, test } from "bun:test";
import { csvAuditoria } from "@/components/bion/admin/auditoria/trilha";
import type { AuditLog } from "@/lib/bion-tipos";
import {
  arquivoParaAdmin,
  auditoriaParaAdmin,
  detalheAuditoriaAdmin as m,
  extensaoNeutra,
  nomeArquivoAdmin,
  nomesArquivosAdmin,
  rotuloTipoArquivo,
} from "./mascara-admin";

describe("nome de arquivo para o admin", () => {
  test("extensão só da lista neutra", () => {
    expect(["a.pdf", "a.JPG", "a.jpeg", "a.png", "a.webp", "a.heic", "a.doc", "a.docx", "a.txt"].map(extensaoNeutra)).toEqual(
      ["pdf", "jpg", "jpeg", "png", "webp", "heic", "doc", "docx", "txt"],
    );
    expect(["a.exe", "a.dicom", "hiv.positivo", "sem-extensao", "", null].map(extensaoNeutra)).toEqual(["", "", "", "", "", ""]);
  });
  test("rótulo pelo tipo, nunca pelo nome", () => {
    expect(
      ["receita", "atestado", "exame_solicitado", "laudo", "Exame laboratorial", "Exame cardiológico", "Solicitação de exame", "Receita", "LAUDO de imagem", "Documento", "foto", "", null].map(rotuloTipoArquivo),
    ).toEqual(["Receita", "Atestado", "Solicitação", "Laudo", "Exame", "Exame", "Solicitação", "Receita", "Laudo", "Documento", "Documento", "Documento", "Documento"]);
    expect(nomeArquivoAdmin("Exame laboratorial", "hemograma-completo.pdf")).toBe("Exame.pdf");
    expect(nomeArquivoAdmin("Receita", "receita-losartana.pdf")).toBe("Receita.pdf");
    expect(nomeArquivoAdmin("Documento", "laudo-oncologico.dicom")).toBe("Documento");
  });
  test("vários do mesmo tipo no mesmo item: sufixo (2)", () => {
    expect(nomesArquivosAdmin([
      { tipo: "Exame", nome: "tsh.pdf" },
      { tipo: "Exame", nome: "t4-livre.pdf" },
      { tipo: "Receita", nome: "r.png" },
      { tipo: "Exame", nome: "x.jpg" },
    ])).toEqual(["Exame.pdf", "Exame (2).pdf", "Receita.png", "Exame (3).jpg"]);
  });
  test("arquivoParaAdmin troca nome, tipo e caminho; não muta a origem", () => {
    const a = { id: "a1", nome: "eletrocardiograma-laudo.pdf", tipo: "Exame cardiológico", storagePath: "u/1-eletrocardiograma-laudo.pdf", tamanhoKb: 3 };
    expect(arquivoParaAdmin(a)).toEqual({ id: "a1", nome: "Exame.pdf", tipo: "Exame", storagePath: "restrito", tamanhoKb: 3 });
    expect(a.nome).toBe("eletrocardiograma-laudo.pdf");
  });
});

describe("auditoria antiga mascarada na leitura", () => {
  test("DOCUMENTO_EMITIDO (api/documentos:155)", () => {
    expect(m("DOCUMENTO_EMITIDO", "Receita: Receita — Losartana 50mg 1x ao dia para Marina Silva")).toBe("Emissão de receita para Marina Silva (título omitido)");
    expect(m("DOCUMENTO_EMITIDO", "Atestado: Atestado para fins escolares — 3 dias para João Pereira")).toBe("Emissão de atestado para João Pereira (título omitido)");
    expect(m("DOCUMENTO_EMITIDO", "Solicitação de exame: Sorologia HIV + VDRL para Carlos Souza")).toBe("Emissão de solicitação de exame para Carlos Souza (título omitido)");
    // Formato do seed/demo, sem padrão confiável: texto genérico.
    expect(m("DOCUMENTO_EMITIDO", "Receita digital emitida para Marina Silva — Losartana 50mg")).toBe("Documento emitido (detalhe clínico omitido)");
  });
  test("EXAME_REGISTRADO (api/exames:119)", () => {
    expect(m("EXAME_REGISTRADO", 'Exame "Hemograma completo" registrado manualmente (18 resultados)')).toBe("Exame registrado manualmente (18 resultados)");
    expect(m("EXAME_REGISTRADO", 'Exame "PSA "livre"" registrado manualmente (1 resultado)')).toBe("Exame registrado manualmente (1 resultados)");
    expect(m("EXAME_REGISTRADO", "Exame Glicemia registrado")).toBe("Exame registrado (detalhe clínico omitido)");
  });
  test("DOCUMENTO_VISUALIZADO / DOCUMENTO_PDF_BAIXADO (Receitas.tsx:313/:666)", () => {
    expect(m("DOCUMENTO_VISUALIZADO", "Visualização: Receita — Sertralina 50mg (receita)")).toBe("Visualização: Receita (título omitido)");
    expect(m("DOCUMENTO_PDF_BAIXADO", "Download PDF: Solicitação — Beta-HCG (quantitativo) (exame_solicitado)")).toBe("Download PDF: Solicitação (título omitido)");
    expect(m("DOCUMENTO_PDF_BAIXADO", "Download do PDF da receita — Losartana 50mg")).toBe("Download PDF de documento (detalhe clínico omitido)");
    // Já gravado sem título (desde 09/11): passa igual.
    expect(m("DOCUMENTO_VISUALIZADO", "Visualização de documento (título não registrado)")).toBe("Visualização de documento (título não registrado)");
  });
  test("ARQUIVO_ENVIADO (api/arquivos — formato atual e antigo)", () => {
    expect(m("ARQUIVO_ENVIADO", "laudo-ressonancia-cranio.pdf (Exame de imagem, 2048KB) [storage] → paciente ckp1abc")).toBe("Exame.pdf (Exame, 2048KB) [storage] → paciente ckp1abc");
    expect(m("ARQUIVO_ENVIADO", "receita (antiga) sertralina.png (Receita, 80KB)")).toBe("Receita.png (Receita, 80KB)");
    expect(m("ARQUIVO_ENVIADO", "hemograma-completo.pdf (Exame laboratorial, 480KB) enviado por paciente")).toBe("Exame.pdf (Exame, 480KB) enviado por paciente");
    expect(m("ARQUIVO_ENVIADO", "biopsia.dcm sem formato")).toBe("Arquivo enviado (detalhe clínico omitido)");
  });
  test("LGPD_STORAGE_REMOCAO_PENDENTE: nome no caminho do Storage", () => {
    const d = JSON.stringify({ paths: ["p1/1760000000000-teste_gravidez_positivo.jpg", "p1/1760000000001-diario.exe"], erro: "timeout" });
    expect(JSON.parse(m("LGPD_STORAGE_REMOCAO_PENDENTE", d)!)).toEqual({ paths: ["p1/1760000000000-Documento.jpg", "p1/1760000000001-Documento"], erro: "timeout" });
    expect(m("LGPD_STORAGE_REMOCAO_PENDENTE", "texto livre")).toBe("Remoção pendente no Storage (detalhe clínico omitido)");
  });
  test("formatos antigos do cliente: resumo e medição", () => {
    expect(m("CONSULTA_CONCLUIDA", "Consulta com Dra. Ana Ribeiro concluída — Resumo: Hipertensão estágio 1, ajustar dose")).toBe("Consulta com Dra. Ana Ribeiro concluída — resumo omitido");
    expect(m("MEDICAO_REGISTRADA", "Medição de pa: 150/95 (app do paciente)")).toBe("Medição de pa registrada (valores omitidos)");
  });
  test("eventos sem conteúdo clínico passam iguais", () => {
    for (const [a, d] of [["LOGIN", "Login realizado com sucesso"], ["MEDICO_APROVADO", "CRM de Dr. Felipe Rocha validado e ativado"], ["TICKET_CRIADO", 'Chamado "Câmera" aberto por Marina (tecnico)']]) {
      expect(m(a, d)).toBe(d);
    }
    expect(m("DOCUMENTO_EMITIDO", undefined)).toBeUndefined();
  });
  test("exportação CSV da auditoria sai sem títulos", () => {
    const linhas: AuditLog[] = [
      { id: "1", ts: 0, acao: "DOCUMENTO_EMITIDO", categoria: "documento", severidade: "info", usuario: "Dra. Ana", role: "medico", detalhes: "Receita: Receita — Losartana 50mg para Marina Silva" },
      { id: "2", ts: 0, acao: "EXAME_REGISTRADO", categoria: "prontuario", severidade: "info", usuario: "Marina", role: "paciente", detalhes: 'Exame "TSH" registrado manualmente (1 resultados)' },
      { id: "3", ts: 0, acao: "ARQUIVO_ENVIADO", categoria: "documento", severidade: "info", usuario: "Marina", role: "paciente", detalhes: "receita-losartana.pdf (Receita, 120KB)" },
    ];
    const csv = csvAuditoria(linhas.map(auditoriaParaAdmin));
    expect(csv).not.toContain("Losartana");
    expect(csv).not.toContain("TSH");
    expect(csv).not.toContain("receita-losartana");
    expect(csv).toContain("Emissão de receita para Marina Silva");
  });
});

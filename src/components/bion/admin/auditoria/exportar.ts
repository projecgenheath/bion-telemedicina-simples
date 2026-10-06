/**
 * Exportações da Auditoria — a MESMA lógica do AuditTrail antigo
 * (src/components/bion/AuditTrail.tsx): mesmo CSV, mesmo PDF (jsPDF, A4,
 * mesma diagramação), mesmos nomes de arquivo e os mesmos eventos
 * AUDITORIA_CSV_EXPORTADA / AUDITORIA_PDF_EXPORTADA (o servidor força
 * categoria e severidade). Datas sempre no fuso da clínica.
 */
import { jsPDF } from "jspdf";
import type { AuditLog } from "@/lib/bion-tipos";
import { csvAuditoria, detalheExportacaoCsv, detalheExportacaoPdf, formatarDataAuditoria } from "./trilha";

type Registrar = (log: Omit<AuditLog, "id" | "ts" | "usuario" | "role">) => void;

/** Baixa um arquivo gerado no navegador (igual ao `baixar` das telas antigas). */
export function baixarArquivo(nome: string, conteudo: string, mime: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportarCsvAuditoria(filtrados: AuditLog[], registrarAudit: Registrar) {
  baixarArquivo(`bion-auditoria-${Date.now()}.csv`, csvAuditoria(filtrados), "text/csv;charset=utf-8");
  registrarAudit({
    acao: "AUDITORIA_CSV_EXPORTADA",
    categoria: "admin",
    severidade: "info",
    entidade: "auditoria",
    detalhes: detalheExportacaoCsv(filtrados.length),
  });
}

/** Devolve o número de páginas geradas. */
export function exportarPdfAuditoria(filtrados: AuditLog[], registrarAudit: Registrar, agora = Date.now()): number {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 40;
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  let y = 50;

  const quebrar = (h: number) => {
    if (y + h > alt - 50) {
      doc.addPage();
      y = 50;
    }
  };

  doc.setFont("helvetica", "bold").setFontSize(18).text("BION — Trilha de Auditoria", L, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text(`Gerado em ${formatarDataAuditoria(agora)} • ${filtrados.length} registro(s)`, L, y);
  y += 20;
  doc.setTextColor(20);

  filtrados.forEach((l) => {
    quebrar(44);
    doc.setFont("helvetica", "bold").setFontSize(9);
    doc.text(`[${l.severidade.toUpperCase()}] ${l.acao}`, L, y);
    y += 12;
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text(`${formatarDataAuditoria(l.ts)} — ${l.usuario} (${l.role}) — ${l.categoria}`, L, y);
    y += 10;
    if (l.detalhes) {
      doc.setTextColor(80);
      const linhas = doc.splitTextToSize(l.detalhes, larg - L * 2);
      linhas.forEach((linha: string) => {
        quebrar(12);
        doc.text(linha, L, y);
        y += 10;
      });
      doc.setTextColor(20);
    }
    y += 6;
  });

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(140);
    doc.text(`BION Auditoria • página ${i} de ${paginas}`, L, alt - 28);
  }
  doc.save(`bion-auditoria-${Date.now()}.pdf`);
  registrarAudit({
    acao: "AUDITORIA_PDF_EXPORTADA",
    categoria: "admin",
    severidade: "info",
    entidade: "auditoria",
    detalhes: detalheExportacaoPdf(filtrados.length, paginas),
  });
  return paginas;
}

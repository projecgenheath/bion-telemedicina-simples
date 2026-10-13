/**
 * Exportações dos Relatórios — a MESMA lógica do Relatorios antigo
 * (removido; ver o histórico do git): mesmo CSV, mesmo PDF (jsPDF, A4,
 * mesmas seções), mesmos nomes de arquivo e os mesmos eventos
 * RELATORIO_CSV_EXPORTADO / RELATORIO_PDF_EXPORTADO. A data de geração
 * sai no fuso da clínica. O desempenho por médico (uma linha por médico)
 * agrupa pelo medicoId, com o nome como rótulo.
 */
import { jsPDF } from "jspdf";
import type { AuditLog, Avaliacao, Consulta } from "@/lib/bion-tipos";
import { baixarArquivo } from "../auditoria/exportar";
import { formatarDataAuditoria } from "../auditoria/trilha";
import { csvRelatorio, notaMedia, rotuloMedico, type DadosRelatorio } from "./relatorio";

type Registrar = (log: Omit<AuditLog, "id" | "ts" | "usuario" | "role">) => void;
export type EntradaExportacao = {
  filtroTexto: string;
  dados: DadosRelatorio;
  consultas: Consulta[];
  avaliacoes: Avaliacao[];
  documentos: number;
  arquivos: number;
  consentimentos: number;
};

export function exportarCsvRelatorio(e: EntradaExportacao, registrarAudit: Registrar) {
  baixarArquivo(`bion-relatorio-${Date.now()}.csv`, csvRelatorio(e), "text/csv;charset=utf-8");
  registrarAudit({
    acao: "RELATORIO_CSV_EXPORTADO",
    categoria: "admin",
    severidade: "info",
    entidade: "relatorio",
    detalhes: `Relatório CSV exportado — ${e.filtroTexto}`,
  });
}

/** Devolve o número de páginas. */
export function exportarPdfRelatorio(e: EntradaExportacao, registrarAudit: Registrar, agora = Date.now()): number {
  const { dados, avaliacoes: avaliacoesFiltradas, filtroTexto } = e;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 48;
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  let y = 56;

  const quebrar = (h: number) => {
    if (y + h > alt - 56) {
      doc.addPage();
      y = 56;
    }
  };

  doc.setFont("helvetica", "bold").setFontSize(20).text("BION — Relatório da plataforma", L, y);
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(110);
  doc.text(filtroTexto, L, y, { maxWidth: larg - L * 2 });
  y += 14;
  doc.text(`Gerado em ${formatarDataAuditoria(agora)}`, L, y);
  y += 24;
  doc.setTextColor(20);

  const secao = (titulo: string) => {
    quebrar(40);
    doc.setFont("helvetica", "bold").setFontSize(13).text(titulo, L, y);
    y += 16;
    doc.setFont("helvetica", "normal").setFontSize(10);
  };

  const linha = (txt: string) => {
    quebrar(16);
    doc.text(txt, L, y, { maxWidth: larg - L * 2 });
    y += 14;
  };

  secao("Indicadores");
  linha(`Consultas: ${dados.total} (concluídas: ${dados.concluidas}, canceladas: ${dados.canceladas})`);
  linha(`Taxa de cancelamento: ${dados.taxaCancelamento}%`);
  linha(`Satisfação média: ${dados.media ? dados.media.toFixed(1) : "—"} (${avaliacoesFiltradas.length} avaliação(ões))`);
  linha(`Pacientes ativos: ${dados.pacientes}`);
  linha(`Documentos: ${e.documentos} • Arquivos: ${e.arquivos} • Consentimentos: ${e.consentimentos}`);
  y += 8;

  secao("Consultas por especialidade");
  if (!dados.especialidades.length) linha("Sem dados no período.");
  dados.especialidades.forEach(([esp, n]) => linha(`${esp}: ${n}`));
  y += 8;

  secao("Desempenho por médico");
  if (!dados.medicos.length) linha("Sem dados no período.");
  dados.medicos.forEach((v) => linha(`${rotuloMedico(v, dados.medicos)} — ${v.total} consulta(s) • nota média ${notaMedia(v)}`));
  y += 8;

  secao("Avaliações");
  if (!avaliacoesFiltradas.length) linha("Nenhuma avaliação no período.");
  avaliacoesFiltradas.forEach((a) =>
    linha(`${a.quando} — ${a.medico} (${a.especialidade}) • ${a.nota}/5 • ${a.paciente}${a.comentario ? ` — "${a.comentario}"` : ""}`),
  );

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(9).setTextColor(140);
    doc.text(`BION • página ${i} de ${paginas}`, L, alt - 30);
  }
  doc.save(`bion-relatorio-${Date.now()}.pdf`);
  registrarAudit({
    acao: "RELATORIO_PDF_EXPORTADO",
    categoria: "admin",
    severidade: "info",
    entidade: "relatorio",
    detalhes: `Relatório PDF exportado (${paginas} página(s)) — ${filtroTexto}`,
  });
  return paginas;
}

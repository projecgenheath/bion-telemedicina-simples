import { jsPDF } from "jspdf";
import type { Documento } from "@/lib/bion-store";

export type MedicamentoUso = {
  nome: string;
  posologia: string;
  duracao: string;
  medico: string;
};

const AZUL: [number, number, number] = [24, 92, 200];
const CINZA: [number, number, number] = [110, 120, 135];

export function gerarProntuarioPDF(opts: {
  paciente: string;
  documentos: Documento[];
  medicamentos: MedicamentoUso[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 48;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 0;

  const novaPagina = (primeira = false) => {
    if (!primeira) doc.addPage();
    doc.setFillColor(...AZUL);
    doc.rect(0, 0, W, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("BION", L, 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Prontuário do paciente", L, 52);
    doc.setTextColor(20, 24, 32);
    y = 104;
  };

  const espaco = (h: number) => {
    if (y + h > H - 56) novaPagina();
  };

  const titulo = (t: string) => {
    espaco(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...AZUL);
    doc.text(t, L, y);
    doc.setDrawColor(220, 226, 235);
    doc.line(L, y + 6, W - L, y + 6);
    doc.setTextColor(20, 24, 32);
    y += 24;
  };

  const linha = (label: string, valor: string, bold = false) => {
    const texto = label ? `${label}: ${valor}` : valor;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    const partes = doc.splitTextToSize(texto, W - L * 2 - 12);
    espaco(partes.length * 13 + 4);
    doc.text(partes, L + 6, y);
    y += partes.length * 13;
  };

  novaPagina(true);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(opts.paciente, L, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...CINZA);
  doc.text(
    `Emitido em ${new Date().toLocaleString("pt-BR")} • ${opts.documentos.length} documento(s)`,
    L,
    y,
  );
  doc.setTextColor(20, 24, 32);
  y += 26;

  titulo("Medicamentos em uso");
  if (opts.medicamentos.length === 0) {
    linha("", "Nenhum medicamento ativo registrado.");
    y += 6;
  } else {
    opts.medicamentos.forEach((m) => {
      linha("", m.nome, true);
      linha("Posologia", m.posologia);
      linha("Duração", `${m.duracao} • prescrito por ${m.medico}`);
      y += 10;
    });
  }
  y += 8;

  titulo("Linha do tempo — receitas e atestados");
  if (opts.documentos.length === 0) {
    linha("", "Nenhum documento disponível.");
  }
  opts.documentos.forEach((d) => {
    espaco(60);
    doc.setFillColor(241, 246, 255);
    doc.roundedRect(L, y - 12, W - L * 2, 4, 2, 2, "F");
    linha("", `${d.tipo === "receita" ? "Receita" : "Atestado"} • ${d.data}`, true);
    linha("", d.titulo);
    linha("Médico", d.medico);
    if (d.medicamento) linha("Medicamento", d.medicamento);
    if (d.posologia) linha("Posologia", d.posologia);
    if (d.duracao) linha("Duração", d.duracao);
    linha("Descrição", d.conteudo);
    if (d.observacoes) linha("Observações", d.observacoes);
    y += 14;
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    doc.text("Documento gerado pela plataforma BION — uso pessoal do paciente.", L, H - 28);
    doc.text(`${i}/${total}`, W - L, H - 28, { align: "right" });
  }

  doc.save(`prontuario-${opts.paciente.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

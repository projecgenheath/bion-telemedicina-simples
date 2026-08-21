import { jsPDF } from "jspdf";
import type { Documento } from "@/lib/bion-store";

const AZUL: [number, number, number] = [24, 92, 200];
const VERDE: [number, number, number] = [16, 185, 129];
const CINZA_ESCURO: [number, number, number] = [30, 41, 59];
const CINZA_MEDIO: [number, number, number] = [100, 116, 139];
const CINZA_CLARO: [number, number, number] = [241, 245, 249];

export function gerarDocumentoPDF(d: Documento) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 48;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 0;

  const isReceita = d.tipo === "receita";
  const corDestaque = isReceita ? AZUL : VERDE;
  const tipoTitulo = isReceita ? "RECEITUÁRIO MÉDICO DIGITAL" : "ATESTADO MÉDICO DIGITAL";

  // Cabeçalho institucional
  doc.setFillColor(...corDestaque);
  doc.rect(0, 0, W, 85, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("BION", L, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Telemedicina Simples & Humana", L, 62);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(tipoTitulo, W - L, 42, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Doc ID: ${d.id.toUpperCase()}`, W - L, 62, { align: "right" });

  y = 115;

  // Box de Identificação das Partes
  doc.setFillColor(...CINZA_CLARO);
  doc.roundedRect(L, y, W - L * 2, 76, 8, 8, "F");

  // Paciente
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_MEDIO);
  doc.text("PACIENTE", L + 16, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CINZA_ESCURO);
  doc.text(d.paciente, L + 16, y + 38);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_MEDIO);
  doc.text("Documento emitido via plataforma de telemedicina BION", L + 16, y + 54);

  // Médico
  const colunaMed = W / 2 + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_MEDIO);
  doc.text("MÉDICO RESPONSÁVEL", colunaMed, y + 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CINZA_ESCURO);
  doc.text(d.medico, colunaMed, y + 38);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_MEDIO);
  doc.text(`Data de emissão: ${d.data}`, colunaMed, y + 54);

  y += 105;

  // Título do Documento / Medicamento
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...corDestaque);
  doc.text(d.titulo, L, y);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1.5);
  doc.line(L, y + 8, W - L, y + 8);

  y += 32;

  // Campos Específicos se for Receita
  if (isReceita) {
    if (d.medicamento) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...CINZA_ESCURO);
      doc.text("Medicamento:", L, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(d.medicamento, L + 90, y);
      y += 22;
    }

    if (d.posologia) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...CINZA_ESCURO);
      doc.text("Posologia:", L, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(d.posologia, L + 90, y);
      y += 22;
    }

    if (d.duracao) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...CINZA_ESCURO);
      doc.text("Duração:", L, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(d.duracao, L + 90, y);
      y += 22;
    }
  } else {
    // Se for Atestado
    if (d.duracao) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...CINZA_ESCURO);
      doc.text("Afastamento:", L, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(d.duracao, L + 90, y);
      y += 22;
    }
  }

  y += 8;

  // Conteúdo / Corpo da Prescrição
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...CINZA_ESCURO);
  doc.text("Prescrição / Declaração:", L, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...CINZA_ESCURO);
  const linhasConteudo = doc.splitTextToSize(d.conteudo, W - L * 2);
  doc.text(linhasConteudo, L, y);
  y += linhasConteudo.length * 15 + 16;

  // Observações adicionais
  if (d.observacoes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...CINZA_MEDIO);
    doc.text("Orientações e Observações:", L, y);
    y += 15;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...CINZA_MEDIO);
    const linhasObs = doc.splitTextToSize(d.observacoes, W - L * 2);
    doc.text(linhasObs, L, y);
    y += linhasObs.length * 14 + 20;
  }

  // Bloco de Assinatura e Validação Digital
  const yAssinatura = Math.max(y + 30, H - 190);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(L, yAssinatura, W - L * 2, 85, 6, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...corDestaque);
  doc.text("ASSINATURA DIGITAL CERTIFICADA", L + 16, yAssinatura + 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_ESCURO);
  doc.text(
    `Documento assinado digitalmente por ${d.medico} em conformidade com a legislação de telemedicina e CFM.`,
    L + 16,
    yAssinatura + 36,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...CINZA_MEDIO);
  doc.text(
    `Chave de Validação: ${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    L + 16,
    yAssinatura + 52,
  );
  doc.text("Verifique a autenticidade deste documento em: https://bion.app/validar", L + 16, yAssinatura + 68);

  // Rodapé da Página
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_MEDIO);
  doc.text(
    "BION Tecnologia em Saúde Ltda • CNPJ 00.000.000/0001-00 • Telemedicina e Saúde Digital",
    W / 2,
    H - 30,
    { align: "center" },
  );

  const nomeArquivo = `${d.tipo}-${d.paciente.toLowerCase().replace(/\s+/g, "-")}-${d.titulo.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase()}.pdf`;
  doc.save(nomeArquivo);
}

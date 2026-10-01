import { jsPDF } from "jspdf";
import type { Documento } from "@/lib/bion-store";

const AZUL: [number, number, number] = [24, 92, 200];
const VERDE: [number, number, number] = [16, 185, 129];
const CINZA_ESCURO: [number, number, number] = [30, 41, 59];
const CINZA_MEDIO: [number, number, number] = [100, 116, 139];
const CINZA_CLARO: [number, number, number] = [241, 245, 249];

/**
 * Identificador aleatório criptograficamente seguro para esta via do PDF
 * (substitui o antigo Math.random()). NÃO é uma chave de validação de
 * assinatura: não existe endpoint público de verificação.
 */
function gerarIdentificadorVia(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().toUpperCase();
  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
  }
  throw new Error("Gerador aleatório seguro indisponível neste navegador.");
}

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

  // Bloco de identificação do documento.
  // C5: este PDF é gerado no navegador e NÃO tem assinatura digital
  // (nem ICP-Brasil, nem hash verificável). Não alegar o contrário.
  const yAssinatura = Math.max(y + 30, H - 190);
  const larguraBloco = W - L * 2 - 32;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(L, yAssinatura, W - L * 2, 95, 6, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...corDestaque);
  doc.text("DOCUMENTO SEM ASSINATURA DIGITAL ICP-BRASIL", L + 16, yAssinatura + 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_ESCURO);
  const linhasAviso = doc.splitTextToSize(
    `Emitido por ${d.medico} na plataforma BION. Este PDF não contém assinatura digital qualificada (ICP-Brasil) e não substitui a via assinada pelo médico quando exigida (por exemplo, por farmácias ou para medicamentos controlados).`,
    larguraBloco,
  );
  doc.text(linhasAviso, L + 16, yAssinatura + 35);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...CINZA_MEDIO);
  doc.text(
    `Identificador desta via: ${gerarIdentificadorVia()}`,
    L + 16,
    yAssinatura + 35 + linhasAviso.length * 12 + 6,
  );

  // Rodapé da Página
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...CINZA_MEDIO);
  doc.text(
    "BION Telemedicina • Documento gerado eletronicamente pela plataforma",
    W / 2,
    H - 30,
    { align: "center" },
  );

  const nomeArquivo = `${d.tipo}-${d.paciente.toLowerCase().replace(/\s+/g, "-")}-${d.titulo
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()}.pdf`;
  doc.save(nomeArquivo);
}

"use client";
/**
 * Ações de arquivo do paciente (Baixar PDF, Imprimir, arquivos do médico)
 * sobre o helper comum `@/lib/nativo/arquivos` — funcionam no navegador E no
 * app Android. O aviso na tela descreve o que REALMENTE aconteceu
 * (`mensagemResultado`): nunca "PDF baixado" quando nada foi salvo.
 */
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import type { Documento } from "@/lib/bion-tipos";
import { documentoPDFBytes } from "@/lib/receita-pdf";
import { estaNoAppNativo } from "@/lib/app-nativo";
import { imprimirPdf, mensagemResultado, salvarPdf, type ResultadoArquivo } from "@/lib/nativo/arquivos";

export type Acao = "baixar" | "imprimir";

function avisar(r: ResultadoArquivo) {
  const m = mensagemResultado(r);
  if (m) toast.success(m);
}

function falhou(e: unknown, padrao: string) {
  toast.error(e instanceof Error && e.message ? e.message : padrao);
}

/** Executa baixar/imprimir sobre bytes já prontos. Devolve false em falha. */
export async function executar(acao: Acao, bytes: Uint8Array | Blob, nome: string): Promise<boolean> {
  try {
    const r = acao === "baixar" ? await salvarPdf(bytes, nome) : await imprimirPdf(bytes, nome);
    avisar(r);
    return true;
  } catch (e) {
    falhou(e, acao === "baixar" ? "Não foi possível salvar o PDF." : "Não foi possível imprimir o PDF.");
    return false;
  }
}

/** Via timbrada (a mesma do médico) de um documento emitido. */
export async function acaoDocumento(acao: Acao, d: Documento): Promise<boolean> {
  let pdf: { bytes: Uint8Array; nome: string };
  try {
    pdf = documentoPDFBytes(d);
  } catch (e) {
    falhou(e, "Não foi possível gerar o PDF do documento.");
    return false;
  }
  return executar(acao, pdf.bytes, pdf.nome);
}

/** PDF simples do resumo da consulta (prontuário da consulta concluída). */
export function resumoConsultaPDFBytes(c: {
  especialidade: string;
  data: string;
  hora: string;
  medico: string;
  resumo: string;
  paciente: string;
}): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 48;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(36, 5, 141);
  doc.text("BION Telemedicina", L, 64);
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text("Prontuário da consulta", L, 92);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${c.especialidade} · ${c.data} às ${c.hora} · ${c.medico}`, L, 110);
  doc.text(`Paciente: ${c.paciente}`, L, 124);
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  let y = 152;
  for (const linha of doc.splitTextToSize(c.resumo, W - 2 * L) as string[]) {
    if (y > H - 60) {
      doc.addPage();
      y = 64;
    }
    doc.text(linha, L, y);
    y += 15;
  }
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Documento sem assinatura digital ICP-Brasil — BION Telemedicina.", W / 2, H - 30, { align: "center" });
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Arquivo enviado pelo médico (GET /api/arquivos?id= → link assinado de
 *  10 min, só leitura, com Content-Disposition de anexo). Não baixamos os
 *  bytes por fetch: o link é do Supabase Storage e a CSP (connect-src 'self')
 *  bloquearia. Na web o link baixa o arquivo; no app, o Android abre o link no
 *  navegador do sistema, que faz o download. */
export async function baixarArquivoMedico(a: { id: string; nome: string }): Promise<boolean> {
  try {
    const res = await fetch(`/api/arquivos?id=${encodeURIComponent(a.id)}`, { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { url?: string; nome?: string; erro?: string };
    if (!res.ok || !json.url) {
      toast.error(json.erro || "Não foi possível gerar o link do arquivo.");
      return false;
    }
    if (estaNoAppNativo()) {
      window.open(json.url, "_blank");
      toast.success("Arquivo aberto no navegador do aparelho para baixar.");
      return true;
    }
    const link = document.createElement("a");
    link.href = json.url;
    link.download = json.nome || a.nome;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("Download do arquivo iniciado.");
    return true;
  } catch (e) {
    falhou(e, "Não foi possível baixar o arquivo.");
    return false;
  }
}

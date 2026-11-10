/**
 * Lista de documentos do paciente (aba Documentos) — lógica pura, testável.
 *
 * Antes: só entravam consultas "concluida" e os documentos sem consulta
 * vinculada dependiam de uma janela de datas; documento emitido durante a
 * consulta (ou numa receita renovada fora dela) sumia da tela.
 * Agora:
 *  - TODO documento emitido para o paciente aparece (o servidor só devolve
 *    documentos do próprio paciente, e `Documento` só existe depois que o
 *    médico emite — POST /api/documentos; não há rascunho de documento);
 *  - agrupado pela consulta de emissão (`consultaId`), da mais recente para a
 *    mais antiga; sem consulta (ou com consulta que o paciente não tem na
 *    lista) vai para "Outros documentos";
 *  - o "Prontuário da consulta" (resumoMedico) só entra com a consulta
 *    CONCLUÍDA: antes disso o resumo é rascunho do autossalvamento da sala.
 */
import type { Arquivo, Consulta, Documento } from "@/lib/bion-tipos";

export type GrupoDocumentos<C extends Pick<Consulta, "id" | "ts">, D> = {
  consulta: C;
  documentos: D[];
  /** Resumo do médico, só com a consulta concluída. */
  prontuario: string | null;
};

type ConsultaMin = Pick<Consulta, "id" | "ts" | "status" | "paciente" | "pacienteId" | "resumoMedico">;
type DocumentoMin = Pick<Documento, "id" | "consultaId" | "paciente" | "pacienteId" | "criadoEm">;

function tsDoc(d: DocumentoMin): number {
  const t = d.criadoEm ? new Date(d.criadoEm).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export function agruparDocumentosPaciente<C extends ConsultaMin, D extends DocumentoMin>(args: {
  consultas: C[];
  documentos: D[];
  pacienteId?: string;
  pacienteNome: string;
}): { grupos: GrupoDocumentos<C, D>[]; outros: D[] } {
  const { pacienteId, pacienteNome } = args;
  const minhaConsulta = (c: C) => (c.pacienteId && pacienteId ? c.pacienteId === pacienteId : c.paciente === pacienteNome);
  const meuDoc = (d: D) => (d.pacienteId && pacienteId ? d.pacienteId === pacienteId : d.paciente === pacienteNome);

  const consultas = args.consultas.filter(minhaConsulta);
  const porId = new Map(consultas.map((c) => [c.id, c]));
  const docsPorConsulta = new Map<string, D[]>();
  const outros: D[] = [];
  for (const d of args.documentos.filter(meuDoc)) {
    if (d.consultaId && porId.has(d.consultaId)) {
      const l = docsPorConsulta.get(d.consultaId) ?? [];
      l.push(d);
      docsPorConsulta.set(d.consultaId, l);
    } else outros.push(d);
  }

  const grupos: GrupoDocumentos<C, D>[] = [];
  for (const c of consultas) {
    const docs = (docsPorConsulta.get(c.id) ?? []).sort((a, b) => tsDoc(b) - tsDoc(a));
    const prontuario = c.status === "concluida" && c.resumoMedico?.trim() ? c.resumoMedico : null;
    // Consulta concluída sempre aparece (retorno, prontuário); as outras só
    // quando já têm documento emitido.
    if (docs.length === 0 && c.status !== "concluida") continue;
    grupos.push({ consulta: c, documentos: docs, prontuario });
  }
  grupos.sort((a, b) => b.consulta.ts - a.consulta.ts);
  outros.sort((a, b) => tsDoc(b) - tsDoc(a));
  return { grupos, outros };
}

/** "Dr(a). Dra. Ana" → "Dra. Ana": só põe o prefixo quando o nome não tem. */
export function nomeComTratamento(medico: string): string {
  const nome = (medico ?? "").trim();
  if (!nome) return "";
  if (/^(dr|dra|dr\(a\))\.?\s/i.test(nome)) return nome;
  return `Dr(a). ${nome}`;
}

/** "Cancelado em 09/11/2026" (fuso de São Paulo) ou null se não cancelado.
 *  Lê status/canceladoEm defensivamente: o mapDocumento da main ainda não os
 *  repassa (o #169 do Admin passa a repassar). */
export function seloCancelado(d: { status?: string | null; canceladoEm?: string | null }): string | null {
  if (d?.status !== "cancelado") return null;
  const t = d.canceladoEm ? new Date(d.canceladoEm) : null;
  if (!t || Number.isNaN(t.getTime())) return "Cancelado";
  return `Cancelado em ${t.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })}`;
}

/** Arquivos que o MÉDICO enviou ao paciente (laudos, PDFs). A lista já vem
 *  filtrada pelo servidor (whereArquivosVisiveis: só os do paciente). */
export function arquivosDoMedico<A extends Pick<Arquivo, "enviadoPor">>(arquivos: A[]): A[] {
  return arquivos.filter((a) => a.enviadoPor === "medico");
}

/** O arquivo é PDF (pelo nome)? Só PDF passa pelo helper salvarPdf. */
export function ehPdf(nome: string): boolean {
  return /\.pdf$/i.test((nome ?? "").trim());
}

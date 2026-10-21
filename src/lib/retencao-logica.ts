import crypto from "node:crypto";

/**
 * Prazos de retenção definidos pelo Jurídico (20/10/2026):
 * - chamados e trechos livres da auditoria: nome do paciente vira código após 6 meses;
 * - monitor de IA (AuditLog acao LLM_TURNO): apagado após 6 meses (Marco Civil);
 * - auditoria: apagada após 5 anos (prescrição do CDC).
 */
export const MESES_PSEUDONIMIZAR = 6;
export const MESES_MONITOR_IA = 6;
export const ANOS_AUDITORIA = 5;
export const ACAO_MONITOR_IA = "LLM_TURNO";
export const PREFIXO_CODIGO = "PAC-";

/** Subtrai meses de calendário em UTC, prendendo o dia no fim do mês (31/08 − 6 meses = 28/02 ou 29/02). */
export function subtrairMeses(agora: Date, meses: number): Date {
  const d = new Date(agora.getTime());
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

export function cortesRetencao(agora: Date) {
  return {
    pseudonimizar: subtrairMeses(agora, MESES_PSEUDONIMIZAR),
    monitorIa: subtrairMeses(agora, MESES_MONITOR_IA),
    auditoria: subtrairMeses(agora, ANOS_AUDITORIA * 12),
  };
}

/** Código estável e não reversível do paciente: "PAC-" + 8 hex do SHA-256 do id. */
export function codigoPaciente(id: string): string {
  return PREFIXO_CODIGO + crypto.createHash("sha256").update(id).digest("hex").slice(0, 8).toUpperCase();
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Troca o nome do paciente pelo código no texto (sem diferenciar maiúsculas,
 * com e sem acento). Nomes com menos de 3 letras não são trocados, para não
 * apagar pedaços de palavras. Idempotente: rodar de novo não muda nada.
 */
export function pseudonimizarTexto(texto: string, nome: string, codigo: string): string {
  const n = nome.trim().replace(/\s+/g, " ");
  if (n.length < 3 || !texto) return texto;
  const variantes = Array.from(new Set([n, semAcento(n)]));
  let r = texto;
  for (const v of variantes) {
    const padrao = escapar(v).replace(/ /g, "\\s+");
    r = r.replace(new RegExp(`(?<![\\p{L}\\p{N}])${padrao}(?![\\p{L}\\p{N}])`, "giu"), codigo);
  }
  return r;
}

export function jaPseudonimizado(valor: string | null | undefined): boolean {
  return !!valor && valor.startsWith(PREFIXO_CODIGO);
}

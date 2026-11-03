/**
 * Cancelamento de documento clínico pelo médico emissor (20261103a).
 * Regras puras (sem banco), usadas pela rota
 * POST /api/medico/documentos/[id]/cancelar e pela tela do prontuário.
 * Cancelar NUNCA apaga: grava status="cancelado" + canceladoEm.
 */
export const STATUS_DOCUMENTO_CANCELADO = "cancelado";
export const MOTIVO_MAX = 300;

export type DocParaCancelar = { id: string; medicoId: string; status?: string | null; canceladoEm?: Date | string | null };

export type DecisaoCancelamento =
  | { tipo: "nao_encontrado" } // inexistente OU de outro médico (404, não revela existência)
  | { tipo: "ja_cancelado"; canceladoEm: Date | string | null } // idempotente: 200 sem regravar
  | { tipo: "cancelar" };

export function decidirCancelamento(doc: DocParaCancelar | null, medicoId: string): DecisaoCancelamento {
  if (!doc || !medicoId || doc.medicoId !== medicoId) return { tipo: "nao_encontrado" };
  if (doc.status === STATUS_DOCUMENTO_CANCELADO) return { tipo: "ja_cancelado", canceladoEm: doc.canceladoEm ?? null };
  return { tipo: "cancelar" };
}

export function documentoCancelado(d: { status?: string | null } | null | undefined): boolean {
  return d?.status === STATUS_DOCUMENTO_CANCELADO;
}

/** Motivo opcional: texto livre, aparado e limitado; vazio/não-string = null. */
export function lerMotivo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, MOTIVO_MAX) : null;
}

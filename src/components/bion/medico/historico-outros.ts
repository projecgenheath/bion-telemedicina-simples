/**
 * Histórico clínico do paciente com outros profissionais.
 *
 * O GET /api/medico/consultas/[id]/evolucao já devolve anamnese.coleta e a
 * evolução concluída de qualquer médico (decisão do Alisson; acesso auditado
 * como HISTORICO_OUTRO_MEDICO). Este módulo só formata e identifica o que
 * pode ser exibido — não amplia o escopo da API.
 */

export const AVISO_CONSENTIMENTO_HISTORICO =
  "O paciente consentiu que o médico com vínculo assistencial veja o histórico completo na BION, inclusive anamneses, evoluções e exames feitos com outros profissionais. Este acesso fica registrado na Auditoria e deve ser usado apenas para o cuidado.";

export type ColetaAnamnese = Record<string, Record<string, unknown>>;

export type AnamneseHistorico = {
  status: string;
  coleta?: unknown;
};

export type EvolucaoHistorico = {
  conduta?: { texto?: string } | null;
  cid?: string | null;
  concluidaEm?: string | null;
};

export type ItemHistoricoClinico = {
  consultaId: string;
  dataInicio: string;
  especialidade: string;
  medico: string;
  deOutroMedico: boolean;
  anamnese: AnamneseHistorico | null;
  evolucao: EvolucaoHistorico | null;
};

/** Aceita só um objeto de etapas → campos; qualquer outro formato vira {}. */
export function coletaAnamnese(raw: unknown): ColetaAnamnese {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const saida: ColetaAnamnese = {};
  for (const [etapa, campos] of Object.entries(raw as Record<string, unknown>)) {
    if (!campos || typeof campos !== "object" || Array.isArray(campos)) continue;
    saida[etapa] = campos as Record<string, unknown>;
  }
  return saida;
}

export function temColeta(coleta: ColetaAnamnese): boolean {
  return Object.keys(coleta).length > 0;
}

export function itensDeOutrosProfissionais<T extends { deOutroMedico: boolean }>(itens: T[]): T[] {
  return itens.filter((i) => i.deOutroMedico);
}

/** Normaliza um item vindo do GET da evolução (campos a mais são ignorados). */
export function lerItemHistorico(bruto: unknown): ItemHistoricoClinico | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  if (typeof o.consultaId !== "string" || !o.consultaId) return null;
  const anamnese =
    o.anamnese && typeof o.anamnese === "object" && !Array.isArray(o.anamnese)
      ? (o.anamnese as AnamneseHistorico)
      : null;
  const evolucao =
    o.evolucao && typeof o.evolucao === "object" && !Array.isArray(o.evolucao)
      ? (o.evolucao as EvolucaoHistorico)
      : null;
  return {
    consultaId: o.consultaId,
    dataInicio: typeof o.dataInicio === "string" ? o.dataInicio : "",
    especialidade: typeof o.especialidade === "string" ? o.especialidade : "",
    medico: typeof o.medico === "string" ? o.medico : "",
    deOutroMedico: o.deOutroMedico === true,
    anamnese: anamnese && typeof anamnese.status === "string" ? { status: anamnese.status, coleta: anamnese.coleta } : null,
    evolucao,
  };
}

export function lerHistoricoClinico(bruto: unknown): ItemHistoricoClinico[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map(lerItemHistorico).filter((i): i is ItemHistoricoClinico => i !== null);
}

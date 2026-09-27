/** Tipos e constantes do chat BION IA (paciente). */

export type Msg = {
  remetente: "usuario" | "ia";
  texto: string;
  tipo?: "sucesso-agendamento" | "sucesso-exame" | "erro" | "anamnese";
  fonte?: string;
  modelo?: string;
};

export type Etapa = null | "especialidade" | "medico" | "dia" | "hora" | "confirmar";

/** Etapas da triagem — mesma ordem canônica da rota /api/anamnese. */
export const ETAPAS_ANAMNESE = [
  { id: "identificacao", rotulo: "Identificação" },
  { id: "queixa", rotulo: "Queixa principal" },
  { id: "historia", rotulo: "História da doença" },
  { id: "sistemas", rotulo: "Revisão de sistemas" },
  { id: "antecedentes", rotulo: "Antecedentes pessoais" },
  { id: "familia", rotulo: "Antecedentes familiares" },
  { id: "habitos", rotulo: "Hábitos de vida" },
  { id: "gineco", rotulo: "História ginecológica" },
  { id: "psicossocial", rotulo: "Bem-estar e rotina" },
  { id: "medicamentos", rotulo: "Medicamentos" },
  { id: "documentos", rotulo: "Documentos e exames" },
  { id: "fechamento", rotulo: "Revisão final" },
] as const;

export type AnamneseAtiva = {
  consultaId: string;
  medico: string;
  especialidade: string;
  quando: string;
  etapa: string;
};

export type RespostaAnamnese = {
  texto?: string;
  etapa?: string;
  etapa_concluida?: boolean;
  perfilAtualizado?: string[];
  anamnese?: unknown;
  perfilPacienteCompleto?: unknown;
  erro?: string;
  concluida?: boolean;
  fonte?: string;
};

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Janela da triagem: fecha 5 minutos antes do início da consulta. */
export const JANELA_TRIAGEM_MS = 5 * 60_000;

/** Triagem disponível = consulta paga/confirmada e ainda faltam >5 min para o início. */
export function triagemDisponivel(c: {
  status: string;
  pago?: boolean;
  dataISO?: string;
  ts: number;
}): boolean {
  if (!(c.status === "confirmada" || c.status === "pendente_anamnese")) return false;
  if (c.pago === false) return false;
  const inicio = c.dataISO ? new Date(c.dataISO).getTime() : c.ts;
  return Date.now() < inicio - JANELA_TRIAGEM_MS;
}

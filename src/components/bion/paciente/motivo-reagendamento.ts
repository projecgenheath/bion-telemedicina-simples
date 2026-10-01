import type { Consulta } from "@/lib/bion-tipos";

/**
 * Frase (sem ponto final) que explica ao paciente por que a consulta está em
 * aguardando_reagendamento. Sem motivo conhecido, um texto neutro.
 */
export function fraseMotivoReagendamento(motivo: Consulta["motivoReagendamento"]): string {
  switch (motivo) {
    case "medico_cancelou":
      return "O médico cancelou este horário";
    case "falha_tecnica":
      return "Houve uma falha técnica e a consulta não aconteceu";
    case "falta_medico":
      return "O médico não compareceu à consulta";
    default:
      return "Esta consulta não pôde acontecer";
  }
}

/** Texto curto para o rótulo de acessibilidade do cartão. */
export function rotuloMotivoReagendamento(motivo: Consulta["motivoReagendamento"]): string {
  switch (motivo) {
    case "medico_cancelou":
      return "cancelada pelo médico";
    case "falha_tecnica":
      return "não aconteceu por falha técnica";
    case "falta_medico":
      return "o médico não compareceu";
    default:
      return "não pôde acontecer";
  }
}

/**
 * Decisão do rodapé de cada card da triagem (TriagemSlides).
 *
 * Correção do descarte silencioso da última resposta: antes, o card final
 * mostrava "Enviar ao médico" sempre que era o último — mesmo sendo a etapa
 * atual ainda NÃO respondida — e concluir ignorava o rascunho digitado.
 * Agora, a etapa atual sem resposta mantém "Continuar" (que envia o
 * rascunho); "Enviar ao médico" só aparece quando a triagem está pronta
 * (servidor concluiu a coleta) ou quando a última etapa já foi respondida.
 */
export type AcaoRodapeTriagem = "enviar-medico" | "continuar" | "ir-para-pergunta";

export function acaoRodapeTriagem(args: {
  /** O servidor marcou a coleta como concluída (todas as etapas respondidas). */
  pronta: boolean;
  /** Índice do card sendo renderizado. */
  indiceCard: number;
  /** Total de etapas da anamnese. */
  totalEtapas: number;
  /** Índice da etapa atual no servidor (a que está aguardando resposta). */
  indiceServidor: number;
  /** A etapa DESTE card já tem resposta registrada. */
  respondida: boolean;
}): AcaoRodapeTriagem {
  const ultima = args.indiceCard === args.totalEtapas - 1;
  if (args.pronta || (ultima && args.respondida)) return "enviar-medico";
  if (args.indiceCard === args.indiceServidor) return "continuar";
  return "ir-para-pergunta";
}

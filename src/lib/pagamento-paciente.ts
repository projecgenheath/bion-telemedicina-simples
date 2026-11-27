/**
 * Modelo de pagamento na área do PACIENTE — decisão do Alisson de 21/11/2026.
 *
 * Regras do modelo novo (ver C:/Users/Alisson/OpenBot/Shared/regras-pagamento-bion-2026-11.md):
 *  - o cartão é cobrado na marcação e o valor fica na conta da plataforma até
 *    a consulta terminar;
 *  - falta do médico: remarcar com outro médico sem nova cobrança e sem
 *    diferença de preço, ou reembolso integral;
 *  - falta do paciente sem remarcação em 7 dias corridos: reembolso integral
 *    automático, sem pedido.
 *
 * A chave `NEXT_PUBLIC_BION_PAGAMENTO_RETIDO` só é ligada depois que o
 * Programador Admin publicar o motor de pagamento (retenção, transferência
 * após a consulta e reembolso automático). Enquanto estiver desligada, as
 * telas mantêm texto e fluxo antigos — o app não promete o que o servidor
 * ainda não faz.
 */
export const MODELO_PAGAMENTO_RETIDO = process.env.NEXT_PUBLIC_BION_PAGAMENTO_RETIDO === "1";

/** Prazo, em dias corridos, para o reembolso automático da falta do paciente. */
export const DIAS_REEMBOLSO_FALTA_PACIENTE = 7;

/** Minutos que o paciente espera o médico entrar antes de poder escolher. */
export const MINUTOS_ESPERA_MEDICO = 10;

const DIA_MS = 24 * 3600_000;

/** Até quando sai o reembolso automático da falta do paciente (mesma conta do servidor). */
export function prazoReembolsoFaltaPaciente(dataInicio: Date | number): Date {
  const inicio = typeof dataInicio === "number" ? dataInicio : dataInicio.getTime();
  return new Date(inicio + DIAS_REEMBOLSO_FALTA_PACIENTE * DIA_MS);
}

/** O prazo do reembolso automático ainda está aberto? */
export function reembolsoAutomaticoNoPrazo(dataInicio: Date | number, agora: number = Date.now()): boolean {
  return agora <= prazoReembolsoFaltaPaciente(dataInicio).getTime();
}

/** Texto da marcação: onde o dinheiro fica e quando o médico recebe. */
export const TEXTO_RETENCAO_NA_MARCACAO =
  "O valor é cobrado agora e fica guardado com a BION até a consulta acontecer. " +
  "Depois da consulta, o médico recebe a parte dele. Se a consulta não acontecer, " +
  "você remarca sem nova cobrança ou recebe o reembolso integral.";

/** Texto da falta do paciente no modelo novo (sem pedido e sem justificativa). */
export function textoFaltaPacienteAutomatica(prazo: Date, formatarData: (d: Date) => string): string {
  return (
    `Você não entrou nesta consulta. O reembolso é integral e automático: ` +
    `volta para o seu cartão até ${formatarData(prazo)}, sem precisar pedir e sem justificativa. ` +
    `O médico não recebe por esta consulta.`
  );
}

/** Texto da espera do médico no modelo novo (sem nova cobrança e sem diferença). */
export const TEXTO_FALTA_MEDICO_NA_ESPERA =
  `Ele tem até ${MINUTOS_ESPERA_MEDICO} minutos. Se não entrar, você pode remarcar com outro médico ` +
  "sem nova cobrança e sem diferença de preço, ou receber o reembolso integral.";

/**
 * Remarcação com outro médico no modelo novo (decisão 3.2 do Presidente, 27/11):
 * a troca é NA MESMA consulta — mesmo pagamento, mesmo valor, sem consulta nova.
 * Os textos abaixo não prometem "nova consulta".
 */
export const TEXTO_ESCOLHER_MEDICO_SEM_COBRANCA =
  "Médicos da mesma especialidade livres agora. A troca não tem nova cobrança nem diferença de preço.";

/** Confirmação da troca: a consulta passa ao novo médico, agora, sem cobrança. */
export function textoConfirmarTrocaMedico(nomeMedico: string): string {
  return `A sua consulta passa para ${nomeMedico} agora, sem nova cobrança e sem diferença de preço.`;
}

/** Sucesso da troca na mesma consulta: o paciente já está na chamada certa. */
export const TEXTO_REMARCADA_MESMA_CONSULTA =
  "A consulta segue com outro médico, sem nova cobrança. Aguarde o novo médico entrar nesta mesma chamada.";

/**
 * Consentimento específico para a leitura de laudo pela BION IA (LGPD art. 11,
 * I — dado de saúde; art. 33 — possível transferência internacional).
 *
 * Toda vez que o paciente envia um laudo, o app mostra o aviso e só envia com
 * "Concordo e enviar". O cliente manda `consentimento=<VERSAO>` no formulário;
 * o servidor recusa (428) sem ele ou com versão diferente e registra o aceite
 * (Consentimento + AuditLog) ANTES de mandar o arquivo para o Google.
 *
 * Mudou o texto do aviso? Troque a VERSÃO: aceites antigos não valem para o
 * texto novo.
 */
export const CAMPO_CONSENTIMENTO_IA_EXAME = "consentimento";
export const VERSAO_CONSENTIMENTO_IA_EXAME = "ia-exame-v1-2026-10-20";

export const FINALIDADE_CONSENTIMENTO_IA_EXAME =
  `Leitura de laudo pela BION IA: arquivo enviado ao Google (Gemini), possivelmente fora do Brasil (versão ${VERSAO_CONSENTIMENTO_IA_EXAME})`;

/** O valor recebido do formulário é o aceite da versão atual? */
export function consentimentoIaExameValido(valor: unknown): boolean {
  return typeof valor === "string" && valor === VERSAO_CONSENTIMENTO_IA_EXAME;
}

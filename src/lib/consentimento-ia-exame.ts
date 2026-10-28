/**
 * Consentimento específico para a leitura de laudo pela BION IA (LGPD art. 11,
 * I — dado de saúde; art. 33 — possível transferência internacional).
 *
 * Toda vez que o paciente envia um laudo, o app mostra o aviso e só envia com
 * "Concordo e enviar". O cliente manda `consentimento=<VERSAO>` no formulário;
 * o servidor recusa (428) sem ele ou com versão diferente e registra o aceite
 * (Consentimento + AuditLog) ANTES de mandar o arquivo para a IA (NVIDIA).
 *
 * O aviso aparece em TODO envio, então depois de uma revogação (tela de
 * Privacidade → /api/paciente/consentimento-ia-exame) o próximo envio pede
 * o aceite de novo, sem estado extra no cliente.
 *
 * Mudou o texto do aviso? Troque a VERSÃO: aceites antigos não valem para o
 * texto novo.
 */
export const CAMPO_CONSENTIMENTO_IA_EXAME = "consentimento";
export const VERSAO_CONSENTIMENTO_IA_EXAME = "ia-exame-v2-2026-10-27";

/** Prefixo comum a aceites e revogações (para achar os registros). */
export const PREFIXO_FINALIDADE_IA_EXAME = "Leitura de laudo pela BION IA";

export const FINALIDADE_CONSENTIMENTO_IA_EXAME =
  `${PREFIXO_FINALIDADE_IA_EXAME}: arquivo enviado à NVIDIA (EUA), que pode guardá-lo conforme os termos dela (versão ${VERSAO_CONSENTIMENTO_IA_EXAME})`;

/** Revogação (LGPD art. 8º, § 5º): registro com aceito = false. */
export const FINALIDADE_REVOGACAO_IA_EXAME =
  `${PREFIXO_FINALIDADE_IA_EXAME}: consentimento revogado pelo paciente (versão ${VERSAO_CONSENTIMENTO_IA_EXAME})`;

export type EstadoConsentimentoIaExame = "ativo" | "revogado" | "nunca";

/** Estado a partir do registro MAIS RECENTE com o prefixo (ou nenhum). */
export function estadoConsentimentoIaExame(ultimo: { aceito: boolean } | null | undefined): EstadoConsentimentoIaExame {
  if (!ultimo) return "nunca";
  return ultimo.aceito ? "ativo" : "revogado";
}

/** O valor recebido do formulário é o aceite da versão atual? */
export function consentimentoIaExameValido(valor: unknown): boolean {
  return typeof valor === "string" && valor === VERSAO_CONSENTIMENTO_IA_EXAME;
}

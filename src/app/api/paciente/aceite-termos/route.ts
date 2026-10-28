import { criarRotaAceiteTermos } from "@/lib/server/rota-aceite-termos";

/**
 * Re-aceite dos Termos de Uso do paciente (VERSAO_TERMOS_PACIENTE) e da
 * Política de Privacidade (VERSAO_PRIVACIDADE), juntos, numa tela só.
 * GET: { pendente, versaoTermos, versaoPrivacidade }. POST: aceiteTermosPayload("PACIENTE").
 * Grava em Consentimento (versão na finalidade, data/hora em createdAt).
 */
export const { GET, POST } = criarRotaAceiteTermos("PACIENTE");

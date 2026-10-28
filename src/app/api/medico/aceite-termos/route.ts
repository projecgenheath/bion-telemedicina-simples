import { criarRotaAceiteTermos } from "@/lib/server/rota-aceite-termos";

/**
 * Re-aceite dos Termos de Uso do médico e da Política de Privacidade
 * (contas criadas pelo admin ou anteriores aos termos).
 * GET: { pendente, versaoTermos, versaoPrivacidade }. POST: aceiteTermosPayload("MEDICO").
 */
export const { GET, POST } = criarRotaAceiteTermos("MEDICO");

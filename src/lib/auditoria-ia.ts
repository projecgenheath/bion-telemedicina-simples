/**
 * LGPD (Jurídico, 2026-11-03): o evento IA_CONSULTA_REALIZADA NUNCA guarda o
 * texto da pergunta. Fica só quem, quando e a ação, com um detalhe fixo.
 */
export const ACAO_IA_CONSULTA = "IA_CONSULTA_REALIZADA";
export const SUFIXO_SEM_TEXTO = "(texto não registrado)";

export function detalheConsultaIa(role: string): string {
  return role.toUpperCase() === "MEDICO"
    ? `Consulta ao BION Copilot ${SUFIXO_SEM_TEXTO}`
    : `Consulta à BION IA ${SUFIXO_SEM_TEXTO}`;
}

/** Servidor: ignora o detalhe do cliente nos eventos de IA. */
export function detalheAuditoriaCliente(acao: string, role: string, detalhesCliente: string | undefined): string | undefined {
  if (acao === ACAO_IA_CONSULTA) return detalheConsultaIa(role);
  return detalhesCliente?.slice(0, 300);
}

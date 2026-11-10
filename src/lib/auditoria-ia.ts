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
/**
 * Decisão do Alisson (09/11): o título do documento pode trazer conteúdo
 * clínico e a trilha de auditoria é lida pelo admin. Nestes eventos o
 * detalhe do cliente ("Visualização: <título> (<tipo>)") é trocado por um
 * texto fixo; o documento segue identificado pelo entidadeId. Vale para
 * eventos novos — linhas antigas no banco não são reescritas.
 */
export const DETALHE_FIXO_DOCUMENTO: Record<string, string> = {
  DOCUMENTO_VISUALIZADO: "Visualização de documento (título não registrado)",
  DOCUMENTO_PDF_BAIXADO: "Download do PDF de documento (título não registrado)",
};

export function detalheAuditoriaCliente(acao: string, role: string, detalhesCliente: string | undefined): string | undefined {
  if (acao === ACAO_IA_CONSULTA) return detalheConsultaIa(role);
  if (DETALHE_FIXO_DOCUMENTO[acao]) return DETALHE_FIXO_DOCUMENTO[acao];
  return detalhesCliente?.slice(0, 300);
}

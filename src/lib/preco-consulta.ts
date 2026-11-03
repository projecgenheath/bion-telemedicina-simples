/**
 * Preço cobrado na consulta = o `valor` salvo no perfil do médico.
 * Não existe preço promocional (regra do CFM sobre publicidade médica):
 * qualquer campo de promoção/desconto é ignorado de propósito.
 */
export const VALOR_PADRAO_CONSULTA = 150;

export function precoConsulta(perfil: { valor?: number | null } | null | undefined): number {
  const v = perfil?.valor;
  return typeof v === "number" && Number.isFinite(v) ? v : VALOR_PADRAO_CONSULTA;
}

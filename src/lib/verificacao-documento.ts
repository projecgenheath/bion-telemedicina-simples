/**
 * Código de verificação de documentos clínicos (item 26 da auditoria de
 * melhorias médicas — fatia executável da verificação pública).
 *
 * Formato do código: `<documentoId>-<assinatura>`, onde a assinatura é um
 * HMAC truncado calculado NO SERVIDOR (lib/server/verificacao-documento).
 * Este módulo é ISOMÓRFICO e puro: só monta, formata e disseca o código —
 * não conhece o segredo e nunca assina nada. Ele existe para o cliente
 * (PDFs, links) e para o servidor (a rota pública) falarem o mesmo formato.
 *
 * O código NÃO é assinatura digital qualificada (ICP-Brasil): ele prova
 * que o documento foi emitido pela plataforma BION e não foi alterado
 * depois — a conferência é feita pela rota pública /verificar/[codigo],
 * que devolve apenas tipo, data de emissão e médico emissor (sem nenhum
 * dado clínico nem do paciente).
 */

/** Tamanho (hex) da assinatura truncada que acompanha o id no código. */
export const TAMANHO_ASSINATURA_VERIFICACAO = 20;

export type PartesCodigoVerificacao = {
  documentoId: string;
  assinatura: string;
};

/** Monta o código canônico a partir do id e da assinatura (hex). */
export function montarCodigoVerificacao(documentoId: string, assinatura: string): string {
  return `${documentoId.trim()}-${assinatura.trim().toLowerCase()}`;
}

/**
 * Disseca um código digitado/colado/de URL. Tolera espaços (a via impressa
 * agrupa a assinatura de 4 em 4) e caixa alta/baixa. Devolve null para
 * qualquer coisa fora do formato — a conferência do HMAC é do servidor.
 */
export function extrairPartesCodigoVerificacao(entrada: string | null | undefined): PartesCodigoVerificacao | null {
  if (!entrada) return null;
  const limpo = entrada.replace(/\s+/g, "");
  const corte = limpo.lastIndexOf("-");
  if (corte <= 0) return null;
  const documentoId = limpo.slice(0, corte);
  const assinatura = limpo.slice(corte + 1).toLowerCase();
  if (!documentoId || documentoId.length > 64) return null;
  if (!/^[0-9a-f]+$/.test(assinatura) || assinatura.length !== TAMANHO_ASSINATURA_VERIFICACAO) return null;
  return { documentoId, assinatura };
}

/** Formato de impressão na via: assinatura agrupada de 4 em 4, em caixa alta. */
export function formatarCodigoVerificacao(codigo: string): string {
  const partes = extrairPartesCodigoVerificacao(codigo);
  if (!partes) return codigo;
  const grupos = partes.assinatura.toUpperCase().match(/.{1,4}/g)?.join(" ") ?? partes.assinatura.toUpperCase();
  return `${partes.documentoId}-${grupos}`;
}

/** URL pública de verificação de um código canônico (origem vazia = só o caminho). */
export function urlVerificacaoDocumento(codigo: string, origem: string): string {
  const base = origem.replace(/\/+$/, "");
  return `${base}/verificar/${codigo}`;
}

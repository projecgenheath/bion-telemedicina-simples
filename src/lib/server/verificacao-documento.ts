/**
 * Assinatura de verificação de documentos clínicos — SOMENTE SERVIDOR
 * (item 26 da auditoria de melhorias médicas).
 *
 * Cada documento ganha um código `<id>-<hmac>` em que o HMAC-SHA256 do id
 * (truncado) é calculado com um segredo que nunca sai do servidor. O código
 * vai no documentoWire (bootstrap e POST /api/documentos) e é impresso nas
 * vias em PDF; a rota pública /api/publico/verificar/[codigo] recomputa o
 * HMAC e só então lê o documento — sem o segredo, ninguém forja código de
 * documento inexistente nem adivinha o de um documento real.
 *
 * Segredo: variável de ambiente **BION_VERIFICACAO_SEGREDO** (qualquer
 * string longa e aleatória; trocá-la invalida os códigos já impressos).
 * Sem a variável, cai num segredo de DESENVOLVIMENTO fixo e documentado
 * aqui — ele existe para o ambiente local/demo não quebrar, e um aviso é
 * logado no servidor. **Produção precisa definir a variável**: com o
 * fallback, qualquer pessoa com acesso ao código-fonte pode assinar ids.
 *
 * Isto NÃO é assinatura digital ICP-Brasil: é uma prova de emissão e de
 * integridade do registro na plataforma. A via impressa continua dizendo
 * isso com todas as letras.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  extrairPartesCodigoVerificacao,
  montarCodigoVerificacao,
  TAMANHO_ASSINATURA_VERIFICACAO,
} from "@/lib/verificacao-documento";

/** Fallback SOMENTE para desenvolvimento/demo local — ver o cabeçalho. */
const SEGREDO_DESENVOLVIMENTO = "bion-verificacao-desenvolvimento-nao-usar-em-producao";

let avisouFallback = false;

export function segredoVerificacao(): string {
  const daEnv = process.env.BION_VERIFICACAO_SEGREDO?.trim();
  if (daEnv) return daEnv;
  if (!avisouFallback) {
    avisouFallback = true;
    console.warn(
      "[verificacao-documento] BION_VERIFICACAO_SEGREDO ausente: usando o segredo de DESENVOLVIMENTO. Defina a variável em produção.",
    );
  }
  return SEGREDO_DESENVOLVIMENTO;
}

const contexto = (documentoId: string) => `bion-documento:${documentoId}`;

/** Assinatura truncada (hex) de um id de documento. Pura com o segredo dado. */
export function assinarDocumentoId(documentoId: string, segredo: string): string {
  return createHmac("sha256", segredo)
    .update(contexto(documentoId))
    .digest("hex")
    .slice(0, TAMANHO_ASSINATURA_VERIFICACAO);
}

/** Código completo de verificação de um documento (para o wire e a via). */
export function gerarCodigoVerificacao(documentoId: string, segredo: string = segredoVerificacao()): string {
  return montarCodigoVerificacao(documentoId, assinarDocumentoId(documentoId, segredo));
}

/**
 * Confere um código recebido: devolve o documentoId SOMENTE se o formato
 * estiver certo e a assinatura bater (comparação em tempo constante).
 * Qualquer desvio — formato, tamanho, um hex trocado — devolve null.
 */
export function conferirCodigoVerificacao(
  codigo: string | null | undefined,
  segredo: string = segredoVerificacao(),
): string | null {
  const partes = extrairPartesCodigoVerificacao(codigo);
  if (!partes) return null;
  const esperado = Buffer.from(assinarDocumentoId(partes.documentoId, segredo), "utf8");
  const recebido = Buffer.from(partes.assinatura, "utf8");
  if (esperado.length !== recebido.length) return null;
  return timingSafeEqual(esperado, recebido) ? partes.documentoId : null;
}

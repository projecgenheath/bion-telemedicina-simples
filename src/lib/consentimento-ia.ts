/**
 * Consentimento GERAL da BION IA (chat, leitura de laudo e anamnese por IA).
 *
 * A troca do provedor para a NVIDIA mudou a Política de Privacidade
 * (VERSAO_PRIVACIDADE) e os Termos do Paciente (VERSAO_TERMOS_PACIENTE).
 * Paciente que não aceitou ESTA versão não manda nada para a IA: o servidor
 * responde 409 { codigo: CODIGO_CONSENTIMENTO_IA_PENDENTE } e o app mostra a
 * tela de aceite (componente ConsentimentoIA).
 *
 * Mudou o texto do aviso, a política ou os termos? Troque a VERSÃO: aceites
 * antigos deixam de valer e todos aceitam de novo.
 */
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } from "@/lib/aceite-termos";

export const VERSAO_CONSENTIMENTO_IA = "ia-nvidia-v1-2026-10-27";
export const CODIGO_CONSENTIMENTO_IA_PENDENTE = "consentimento_ia_pendente";
export const STATUS_CONSENTIMENTO_IA_PENDENTE = 409;

/** Prefixo comum a aceites e revogações (para achar os registros). */
export const PREFIXO_FINALIDADE_IA = "Uso da BION IA";

export const FINALIDADE_CONSENTIMENTO_IA =
  `${PREFIXO_FINALIDADE_IA}: mensagens e laudos enviados à NVIDIA (EUA); aceite de ${VERSAO_PRIVACIDADE} e ${VERSAO_TERMOS_PACIENTE} (versão ${VERSAO_CONSENTIMENTO_IA})`;

export const FINALIDADE_REVOGACAO_IA =
  `${PREFIXO_FINALIDADE_IA}: consentimento revogado pelo paciente (versão ${VERSAO_CONSENTIMENTO_IA})`;

export const MSG_CONSENTIMENTO_IA_PENDENTE =
  "A Política de Privacidade e os Termos de Uso mudaram: a BION IA agora usa a NVIDIA. Para continuar usando a IA, leia e aceite a nova versão.";

/** O registro MAIS RECENTE com o prefixo vale como aceite da versão atual? */
export function consentimentoIaVigente(ultimo: { aceito: boolean; finalidade: string } | null | undefined): boolean {
  return Boolean(ultimo?.aceito && ultimo.finalidade.includes(`(versão ${VERSAO_CONSENTIMENTO_IA})`));
}

/** Corpo padrão do 409 (servidor) — o cliente reconhece pelo `codigo`. */
export function corpoConsentimentoIaPendente() {
  return {
    erro: MSG_CONSENTIMENTO_IA_PENDENTE,
    codigo: CODIGO_CONSENTIMENTO_IA_PENDENTE,
    versao: VERSAO_CONSENTIMENTO_IA,
    versaoPrivacidade: VERSAO_PRIVACIDADE,
    versaoTermos: VERSAO_TERMOS_PACIENTE,
  };
}

/** Cliente: a resposta é o pedido de novo aceite? */
export function ehConsentimentoIaPendente(status: number, corpo: unknown): boolean {
  return (
    status === STATUS_CONSENTIMENTO_IA_PENDENTE &&
    typeof corpo === "object" &&
    corpo !== null &&
    (corpo as { codigo?: unknown }).codigo === CODIGO_CONSENTIMENTO_IA_PENDENTE
  );
}

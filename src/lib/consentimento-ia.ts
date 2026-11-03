/**
 * Consentimento GERAL da BION IA (chat, leitura de laudo e anamnese por IA).
 *
 * v3 (2026-11-03, pedido do Jurídico): o consentimento da IA é SEPARADO do
 * aceite dos Termos e da Política. Caixa própria, desmarcada, opcional e
 * revogável. Os aceites v2 (clique único que valia para Termos + IA) deixam
 * de valer: todo mundo consente de novo. O servidor continua exigindo os
 * DOIS (Termos vigentes + este consentimento) antes de chamar a IA.
 *
 * A troca do provedor para a NVIDIA mudou a Política de Privacidade
 * (VERSAO_PRIVACIDADE) e os Termos do Paciente (VERSAO_TERMOS_PACIENTE).
 * Paciente que não aceitou ESTA versão não manda nada para a IA: o servidor
 * responde 403 { codigo: CODIGO_CONSENTIMENTO_IA_PENDENTE } e o app mostra a
 * tela de aceite (componente ConsentimentoIA).
 *
 * Mudou o texto do aviso, a política ou os termos? Troque a VERSÃO: aceites
 * antigos deixam de valer e todos aceitam de novo.
 */
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } from "@/lib/aceite-termos";

/** Texto da caixa de consentimento (o que a paciente marca). Mudou? Troque a versão. */
export const TEXTO_CAIXA_CONSENTIMENTO_IA =
  "Autorizo a BION a enviar o que eu escrever na BION IA, inclusive dados sobre a minha saúde, à NVIDIA Corporation, nos EUA, para gerar as respostas. Sei que a IA é opcional e que posso revogar quando quiser em Perfil > Privacidade.";

export const VERSAO_CONSENTIMENTO_IA = "ia-nvidia-v3-2026-11-03";
export const CODIGO_CONSENTIMENTO_IA_PENDENTE = "consentimento_ia_pendente";
/** 403: sem o aceite, o servidor recusa — nada vai à IA. (Antes 409.) */
export const STATUS_CONSENTIMENTO_IA_PENDENTE = 403;
/** Status antigo, aceito no cliente enquanto houver deploy anterior no ar. */
const STATUS_CONSENTIMENTO_IA_LEGADO = 409;

/** "termos-paciente-v2-2026-10-28" → "28/10/2026" (null se não tiver data). */
export function dataDaVersao(versao: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})$/.exec(versao);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Rótulo para a paciente: "versão de 28/10/2026" (sem códigos internos). */
export function rotuloVersoes(...versoes: string[]): string {
  const datas = Array.from(new Set(versoes.map(dataDaVersao).filter((d): d is string => Boolean(d))));
  if (!datas.length) return "versão atual";
  return datas.length === 1 ? `versão de ${datas[0]}` : `versões de ${datas.join(" e ")}`;
}

/** Prefixo comum a aceites e revogações (para achar os registros). */
export const PREFIXO_FINALIDADE_IA = "Uso da BION IA";

export const FINALIDADE_CONSENTIMENTO_IA =
  `${PREFIXO_FINALIDADE_IA}: consentimento específico e opcional para enviar mensagens e dados de saúde à NVIDIA (EUA) (versão ${VERSAO_CONSENTIMENTO_IA})`;

export const FINALIDADE_REVOGACAO_IA =
  `${PREFIXO_FINALIDADE_IA}: consentimento revogado pelo paciente (versão ${VERSAO_CONSENTIMENTO_IA})`;

export const MSG_CONSENTIMENTO_IA_PENDENTE =
  "Para usar a BION IA, é preciso autorizar o envio dos seus dados de saúde à NVIDIA, nos EUA. A IA é opcional: sem ela, o resto do app funciona normalmente.";

/** O registro MAIS RECENTE com o prefixo vale como aceite da versão atual? */
export function consentimentoIaVigente(ultimo: { aceito: boolean; finalidade: string } | null | undefined): boolean {
  return Boolean(ultimo?.aceito && ultimo.finalidade.includes(`(versão ${VERSAO_CONSENTIMENTO_IA})`));
}

/** Corpo padrão do 409 (servidor) — o cliente reconhece pelo `codigo`. */
export function corpoConsentimentoIaPendente(termosPendentes = false) {
  return {
    /** true = além do consentimento da IA, faltam os Termos/Política vigentes. */
    termosPendentes,
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
    (status === STATUS_CONSENTIMENTO_IA_PENDENTE || status === STATUS_CONSENTIMENTO_IA_LEGADO) &&
    typeof corpo === "object" &&
    corpo !== null &&
    (corpo as { codigo?: unknown }).codigo === CODIGO_CONSENTIMENTO_IA_PENDENTE
  );
}

/** Aviso fixo acima da triagem e do campo do chat (pedido do Jurídico). */
export const AVISO_DADOS_PESSOAIS_IA = "Não escreva nomes, CPF, contatos ou dados de saúde de outras pessoas.";

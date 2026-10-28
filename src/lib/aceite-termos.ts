/**
 * Aceite dos Termos de Uso e da Política de Privacidade no cadastro, e o
 * opt-in (opcional) de marketing.
 *
 * Para publicar uma nova versão de um texto, troque só a constante de versão:
 * o cadastro passa a exigir e gravar a versão nova automaticamente.
 * Arquivo compartilhado (cliente e servidor): sem imports de servidor.
 */

export type PerfilAceite = "PACIENTE" | "MEDICO";

export const VERSAO_TERMOS_PACIENTE = "termos-paciente-v0-2026-10-20";
/** Termos do médico. Texto próprio ainda não existe: o link aponta para /termos-de-uso. */
export const VERSAO_TERMOS_MEDICO = "termos-medico-v0-2026-10-20";
export const VERSAO_PRIVACIDADE = "privacidade-v0-2026-10-20";
/** Texto provisório (minuta), aguardando revisão jurídica. */
export const VERSAO_MARKETING_OPTIN = "marketing-optin-v0-2026-10-21";

/** Versão dos termos exigida por perfil. */
export const VERSAO_TERMOS_POR_PERFIL: Record<PerfilAceite, string | null> = {
  PACIENTE: VERSAO_TERMOS_PACIENTE,
  MEDICO: VERSAO_TERMOS_MEDICO,
};

/** Rotas públicas (sem login) dos textos: src/app/termos-de-uso e src/app/politica-de-privacidade. */
export const URL_TERMOS_PACIENTE = "/termos-de-uso";
export const URL_POLITICA_PRIVACIDADE = "/politica-de-privacidade";
/** Rota pública (sem login) do texto do médico + anexos I–III: src/app/termos-medico. */
export const URL_TERMOS_MEDICO = "/termos-medico";
export const URL_TERMOS_POR_PERFIL: Record<PerfilAceite, string> = {
  PACIENTE: URL_TERMOS_PACIENTE,
  MEDICO: URL_TERMOS_MEDICO,
};

export const TEXTO_ACEITE_TERMOS = "Li e aceito os Termos de Uso e a Política de Privacidade";
/** Minuta (provisório) — versão VERSAO_MARKETING_OPTIN. */
export const TEXTO_MARKETING_OPTIN =
  "Quero receber novidades e ofertas da BION por e-mail, push e WhatsApp. Posso cancelar quando quiser no meu perfil.";

/** Prefixo `CONSENTIMENTO_` mantém os registros fora do descarte de 5 anos. */
export const ACAO_AUDIT_ACEITE_TERMOS = "CONSENTIMENTO_TERMOS_ACEITOS";
export const ACAO_AUDIT_MARKETING_ACEITO = "CONSENTIMENTO_MARKETING_ACEITO";
export const ACAO_AUDIT_MARKETING_REVOGADO = "CONSENTIMENTO_MARKETING_REVOGADO";

export const PREFIXO_FINALIDADE_TERMOS = "Aceite dos Termos de Uso";
export const PREFIXO_FINALIDADE_PRIVACIDADE = "Aceite da Política de Privacidade";
export const PREFIXO_FINALIDADE_MARKETING = "Opt-in de marketing (e-mail, push e WhatsApp)";

export interface AceiteTermosPayload {
  aceito: boolean;
  versaoTermos: string;
  versaoPrivacidade: string;
  /** Opcional e separado dos termos: só vem quando o paciente marcou. */
  marketing?: { aceito: boolean; versao: string };
}

/** Payload do cliente para o perfil. Lança erro se o perfil ainda não tem termos. */
export function aceiteTermosPayload(perfil: PerfilAceite, marketing = false): AceiteTermosPayload {
  const versaoTermos = VERSAO_TERMOS_POR_PERFIL[perfil];
  if (!versaoTermos) throw new Error(`Termos de uso do perfil ${perfil} ainda não definidos.`);
  return {
    aceito: true,
    versaoTermos,
    versaoPrivacidade: VERSAO_PRIVACIDADE,
    ...(marketing ? { marketing: { aceito: true, versao: VERSAO_MARKETING_OPTIN } } : {}),
  };
}

export const ERRO_ACEITE_TERMOS =
  "Para criar a conta, é preciso aceitar os Termos de Uso e a Política de Privacidade.";
export const ERRO_VERSAO_TERMOS =
  "Os Termos de Uso ou a Política de Privacidade foram atualizados. Recarregue a página e aceite a versão atual.";
export const ERRO_TERMOS_PERFIL_INDEFINIDO =
  "Os Termos de Uso deste tipo de conta ainda não estão disponíveis. Tente novamente mais tarde.";
export const ERRO_ACEITE_TERMOS_ATUALIZACAO =
  "Para continuar, é preciso aceitar os Termos de Uso e a Política de Privacidade.";
export const ERRO_VERSAO_MARKETING =
  "O texto das novidades e ofertas foi atualizado. Recarregue a página e tente de novo.";

export interface AceiteValidado {
  versaoTermos: string;
  versaoPrivacidade: string;
  marketing: boolean;
}

/**
 * Valida o aceite enviado pelo cliente. Exige `aceito === true` e as versões
 * vigentes exatas. Marketing é opcional: ausente ou `aceito !== true` = não.
 */
export function validarAceiteTermos(
  perfil: PerfilAceite,
  valor: unknown,
): { ok: true; valor: AceiteValidado } | { ok: false; erro: string } {
  const versaoTermosEsperada = VERSAO_TERMOS_POR_PERFIL[perfil];
  if (!versaoTermosEsperada) return { ok: false, erro: ERRO_TERMOS_PERFIL_INDEFINIDO };
  if (!valor || typeof valor !== "object") return { ok: false, erro: ERRO_ACEITE_TERMOS };
  const v = valor as Record<string, unknown>;
  if (v.aceito !== true) return { ok: false, erro: ERRO_ACEITE_TERMOS };
  if (typeof v.versaoTermos !== "string" || typeof v.versaoPrivacidade !== "string") {
    return { ok: false, erro: ERRO_ACEITE_TERMOS };
  }
  if (v.versaoTermos !== versaoTermosEsperada || v.versaoPrivacidade !== VERSAO_PRIVACIDADE) {
    return { ok: false, erro: ERRO_VERSAO_TERMOS };
  }
  let marketing = false;
  const m = v.marketing as Record<string, unknown> | undefined | null;
  if (m && typeof m === "object" && m.aceito === true) {
    if (m.versao !== VERSAO_MARKETING_OPTIN) return { ok: false, erro: ERRO_VERSAO_MARKETING };
    marketing = true;
  }
  return { ok: true, valor: { versaoTermos: v.versaoTermos, versaoPrivacidade: v.versaoPrivacidade, marketing } };
}

/** Finalidades gravadas na tabela de consentimentos (uma linha por documento). */
export function finalidadeTermos(versao: string) {
  return `${PREFIXO_FINALIDADE_TERMOS} (versão ${versao})`;
}
export function finalidadePrivacidade(versao: string) {
  return `${PREFIXO_FINALIDADE_PRIVACIDADE} (versão ${versao})`;
}
export function finalidadeMarketing(aceito: boolean, versao = VERSAO_MARKETING_OPTIN) {
  return `${PREFIXO_FINALIDADE_MARKETING}: ${aceito ? "aceito" : "revogado"} (versão ${versao})`;
}

/** Estado do opt-in a partir do último registro (null = nunca aceitou). */
export function marketingAtivo(ultimo: { aceito: boolean } | null | undefined): boolean {
  return !!ultimo?.aceito;
}

/**
 * Médico com aceite pendente: falta a linha dos termos OU da privacidade
 * vigentes. Recebe as finalidades já gravadas (aceito = true) do usuário.
 */
export function aceitePendente(perfil: PerfilAceite, finalidadesAceitas: readonly string[]): boolean {
  const versaoTermos = VERSAO_TERMOS_POR_PERFIL[perfil];
  if (!versaoTermos) return false;
  const tem = new Set(finalidadesAceitas);
  return !tem.has(finalidadeTermos(versaoTermos)) || !tem.has(finalidadePrivacidade(VERSAO_PRIVACIDADE));
}

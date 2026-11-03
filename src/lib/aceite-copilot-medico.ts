/**
 * Aceite do BION Copilot do MÉDICO (LGPD, pedido do Jurídico em 2026-11-03).
 *
 * O Copilot manda à NVIDIA (EUA) o texto livre que o médico digita. Antes do
 * primeiro uso o médico marca a caixa (desmarcada por padrão) e confirma; o
 * aceite fica no `Consentimento` com prefixo PRÓPRIO (não se mistura com o
 * consentimento da IA da paciente, "Uso da BION IA").
 *
 * Mudou o texto do aviso ou da caixa? Troque a VERSÃO: aceites antigos
 * deixam de valer e o médico aceita de novo.
 *
 * Textos aguardando revisão do Jurídico.
 */
export const VERSAO_ACEITE_COPILOT_MEDICO = "copilot-medico-v1-2026-11-03";
export const CODIGO_ACEITE_COPILOT_MEDICO = "aceite_copilot_medico";
export const STATUS_ACEITE_COPILOT_MEDICO = 403;

/** Prefixo dos registros do Copilot do médico na tabela Consentimento. */
export const PREFIXO_FINALIDADE_COPILOT_MEDICO = "BION Copilot do médico";

export const TEXTO_AVISO_COPILOT_MEDICO =
  "Não cole nem digite dados que identifiquem pacientes (nome, CPF, contatos, documentos ou prontuário). O que você escreve aqui vai para a NVIDIA, nos EUA. Use apenas casos descritos de forma anônima.";

export const TEXTO_CAIXA_COPILOT_MEDICO =
  "Entendi que o BION Copilot é opcional, usa a NVIDIA (EUA) e que não devo inserir dados que identifiquem pacientes.";

export const FINALIDADE_ACEITE_COPILOT_MEDICO =
  `${PREFIXO_FINALIDADE_COPILOT_MEDICO}: texto livre enviado à NVIDIA (EUA), sem dados que identifiquem pacientes (versão ${VERSAO_ACEITE_COPILOT_MEDICO})`;

export const FINALIDADE_REVOGACAO_COPILOT_MEDICO =
  `${PREFIXO_FINALIDADE_COPILOT_MEDICO}: aceite revogado pelo médico (versão ${VERSAO_ACEITE_COPILOT_MEDICO})`;

export const MSG_ACEITE_COPILOT_MEDICO_PENDENTE =
  "Antes de usar o BION Copilot, leia o aviso e confirme que entendeu.";

/** O registro MAIS RECENTE com o prefixo é o aceite da versão atual? */
export function aceiteCopilotMedicoVigente(ultimo: { aceito: boolean; finalidade: string } | null | undefined): boolean {
  return Boolean(
    ultimo?.aceito &&
      ultimo.finalidade.startsWith(PREFIXO_FINALIDADE_COPILOT_MEDICO) &&
      ultimo.finalidade.includes(`(versão ${VERSAO_ACEITE_COPILOT_MEDICO})`),
  );
}

export function corpoAceiteCopilotMedicoPendente() {
  return { erro: MSG_ACEITE_COPILOT_MEDICO_PENDENTE, codigo: CODIGO_ACEITE_COPILOT_MEDICO, versao: VERSAO_ACEITE_COPILOT_MEDICO };
}

/** Cliente: a resposta é o pedido de aceite do Copilot? */
export function ehAceiteCopilotMedicoPendente(status: number, corpo: unknown): boolean {
  return (
    status === STATUS_ACEITE_COPILOT_MEDICO &&
    typeof corpo === "object" &&
    corpo !== null &&
    (corpo as { codigo?: unknown }).codigo === CODIGO_ACEITE_COPILOT_MEDICO
  );
}

/**
 * Regras puras do aceite do Copilot do médico. Rodar: bun src/lib/aceite-copilot-medico.teste.ts
 */
import assert from "node:assert/strict";
import {
  CODIGO_ACEITE_COPILOT_MEDICO,
  FINALIDADE_ACEITE_COPILOT_MEDICO,
  TEXTO_AVISO_COPILOT_MEDICO,
  TEXTO_CAIXA_COPILOT_MEDICO,
  VERSAO_ACEITE_COPILOT_MEDICO,
  aceiteCopilotMedicoVigente,
  ehAceiteCopilotMedicoPendente,
} from "./aceite-copilot-medico";
import { FINALIDADE_CONSENTIMENTO_IA, PREFIXO_FINALIDADE_IA } from "./consentimento-ia";

assert.equal(VERSAO_ACEITE_COPILOT_MEDICO, "copilot-medico-v1-2026-11-03");
assert.equal(
  TEXTO_AVISO_COPILOT_MEDICO,
  "Não cole nem digite dados que identifiquem pacientes (nome, CPF, contatos, documentos ou prontuário). O que você escreve aqui vai para a NVIDIA, nos EUA. Use apenas casos descritos de forma anônima.",
);
assert.equal(
  TEXTO_CAIXA_COPILOT_MEDICO,
  "Entendi que o BION Copilot é opcional, usa a NVIDIA (EUA) e que não devo inserir dados que identifiquem pacientes.",
);
assert.equal(aceiteCopilotMedicoVigente({ aceito: true, finalidade: FINALIDADE_ACEITE_COPILOT_MEDICO }), true);
assert.equal(aceiteCopilotMedicoVigente({ aceito: false, finalidade: FINALIDADE_ACEITE_COPILOT_MEDICO }), false);
assert.equal(aceiteCopilotMedicoVigente(null), false);
// consentimento da paciente não vale como aceite do médico, e vice-versa
assert.equal(aceiteCopilotMedicoVigente({ aceito: true, finalidade: FINALIDADE_CONSENTIMENTO_IA }), false);
assert.equal(FINALIDADE_ACEITE_COPILOT_MEDICO.startsWith(PREFIXO_FINALIDADE_IA), false);
assert.equal(ehAceiteCopilotMedicoPendente(403, { codigo: CODIGO_ACEITE_COPILOT_MEDICO }), true);
assert.equal(ehAceiteCopilotMedicoPendente(403, { codigo: "consentimento_ia_pendente" }), false);
assert.equal(ehAceiteCopilotMedicoPendente(200, { codigo: CODIGO_ACEITE_COPILOT_MEDICO }), false);
console.log("aceite-copilot-medico: ok");

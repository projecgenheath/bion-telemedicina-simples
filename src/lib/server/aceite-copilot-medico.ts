import { db } from "@/lib/db";
import {
  PREFIXO_FINALIDADE_COPILOT_MEDICO,
  STATUS_ACEITE_COPILOT_MEDICO,
  aceiteCopilotMedicoVigente,
  corpoAceiteCopilotMedicoPendente,
} from "@/lib/aceite-copilot-medico";

/**
 * Último registro do aceite do Copilot do médico (ou null). Reusa a tabela
 * Consentimento: `pacienteId` é a FK para User e guarda o id do MÉDICO aqui
 * (perfil "MEDICO"); o prefixo da finalidade separa do consentimento da paciente.
 */
export async function ultimoAceiteCopilotMedico(medicoId: string) {
  return db.consentimento.findFirst({
    where: { pacienteId: medicoId, perfil: "MEDICO", finalidade: { startsWith: PREFIXO_FINALIDADE_COPILOT_MEDICO } },
    orderBy: { createdAt: "desc" },
    select: { aceito: true, finalidade: true, createdAt: true },
  });
}

/**
 * Portão do servidor: MÉDICO sem o aceite da versão atual → 403
 * { codigo: "aceite_copilot_medico" } e nada vai à IA. Outros papéis → null.
 * Erro no banco também bloqueia (falha fechada).
 */
export async function exigirAceiteCopilotMedico(usuario: { id: string; role: string }): Promise<Response | null> {
  if (usuario.role !== "MEDICO") return null;
  let vigente = false;
  try {
    vigente = aceiteCopilotMedicoVigente(await ultimoAceiteCopilotMedico(usuario.id));
  } catch {
    vigente = false;
  }
  return vigente ? null : Response.json(corpoAceiteCopilotMedicoPendente(), { status: STATUS_ACEITE_COPILOT_MEDICO });
}

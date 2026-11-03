import { db } from "@/lib/db";
import { aceiteVigentePendente } from "@/lib/server/aceite-termos";
import {
  PREFIXO_FINALIDADE_IA,
  STATUS_CONSENTIMENTO_IA_PENDENTE,
  consentimentoIaVigente,
  corpoConsentimentoIaPendente,
} from "@/lib/consentimento-ia";

/** Último registro do consentimento geral da IA do paciente (ou null). */
export async function ultimoConsentimentoIa(pacienteId: string) {
  return db.consentimento.findFirst({
    where: { pacienteId, finalidade: { startsWith: PREFIXO_FINALIDADE_IA } },
    orderBy: { createdAt: "desc" },
    select: { aceito: true, finalidade: true, createdAt: true },
  });
}

/**
 * Portão do servidor: devolve a Response 403 quando o PACIENTE ainda não
 * aceitou a versão atual (nada é enviado à IA); null = pode seguir.
 * Erro ao consultar o banco também bloqueia (falha fechada).
 */
export async function exigirConsentimentoIa(usuario: { id: string; role: string }): Promise<Response | null> {
  if (usuario.role !== "PACIENTE") return null;
  let vigente = false;
  try {
    // Precisa dos DOIS: o aviso da IA (NVIDIA) e o aceite dos Termos/Privacidade
    // vigentes. Bug de produção (2026-10-28): só o aviso da IA era checado, e a
    // paciente sem os Termos novos usava o chat livre (só o agendamento travava).
    vigente =
      consentimentoIaVigente(await ultimoConsentimentoIa(usuario.id)) &&
      !(await aceiteVigentePendente(usuario.id, "PACIENTE"));
  } catch {
    vigente = false;
  }
  return vigente ? null : Response.json(corpoConsentimentoIaPendente(), { status: STATUS_CONSENTIMENTO_IA_PENDENTE });
}

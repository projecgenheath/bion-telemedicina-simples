import { db } from "@/lib/db";
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
 * Portão do servidor: devolve a Response 409 quando o PACIENTE ainda não
 * aceitou a versão atual (nada é enviado à IA); null = pode seguir.
 * Erro ao consultar o banco também bloqueia (falha fechada).
 */
export async function exigirConsentimentoIa(usuario: { id: string; role: string }): Promise<Response | null> {
  if (usuario.role !== "PACIENTE") return null;
  let vigente = false;
  try {
    vigente = consentimentoIaVigente(await ultimoConsentimentoIa(usuario.id));
  } catch {
    vigente = false;
  }
  return vigente ? null : Response.json(corpoConsentimentoIaPendente(), { status: STATUS_CONSENTIMENTO_IA_PENDENTE });
}

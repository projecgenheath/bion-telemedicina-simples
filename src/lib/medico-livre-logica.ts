/**
 * Where da trava "evolução pendente" de medicoLivreAgora (lib/server/medico-livre.ts):
 * Evolucao em rascunho do médico, MENOS a da própria consulta (se dada).
 * Mesmo critério de evolucaoPendenteDoMedico (lib/server/evolucao.ts) e toque.ts.
 */
export function filtroEvolucaoPendente(medicoId: string, excetoConsultaId?: string | null) {
  return {
    medicoId,
    status: "rascunho" as const,
    ...(excetoConsultaId ? { consultaId: { not: excetoConsultaId } } : {}),
  };
}

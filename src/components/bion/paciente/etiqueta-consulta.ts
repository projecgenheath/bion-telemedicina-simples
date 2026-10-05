/* ==================================================================== */
/* BION — etiqueta ÚNICA de estado da consulta (visão do paciente)       */
/*                                                                       */
/* Módulo puro: recebe a consulta + o que a tela já calcula (janela da   */
/* sala, janela e status da triagem) e devolve a etiqueta mais relevante */
/* no momento. Ordem de prioridade (a primeira que valer ganha):         */
/*   1. Aguardando pagamento — status "em_espera" ou pago === false      */
/*      (o pagamento é o que confirma a consulta; api/consultas).        */
/*   2. Sala aberta          — 30 min antes até 2 h depois do horário.   */
/*   3. Remarcação pendente  — nova data reservada aguardando a multa.   */
/*   4. Triagem em andamento — anamnese começada e não concluída.        */
/*   5. Falta a triagem      — anamnese não iniciada e ainda dá tempo    */
/*      (ou status legado "pendente_anamnese").                          */
/*   6. Confirmada           — nada pendente.                            */
/* ==================================================================== */

export type StatusTriagem = "feita" | "andamento" | "nao_iniciada";

export type TomEtiqueta = "pagamento" | "sala" | "remarcacao" | "triagem" | "ok";

export type EtiquetaConsulta = { texto: string; tom: TomEtiqueta };

export type EntradaEtiqueta = {
  status: string;
  pago?: boolean;
  remarcacaoPendente?: { status: string; expiraEm: string } | null;
  salaAberta: boolean;
  triagem: StatusTriagem;
  triagemDisponivel: boolean;
  agora?: number;
};

export function etiquetaConsulta(e: EntradaEtiqueta): EtiquetaConsulta {
  const agora = e.agora ?? Date.now();
  if (e.status === "em_espera" || e.pago === false) return { texto: "Aguardando pagamento", tom: "pagamento" };
  if (e.salaAberta) return { texto: "Sala aberta", tom: "sala" };
  const r = e.remarcacaoPendente;
  if (r && r.status === "pendente" && new Date(r.expiraEm).getTime() > agora) {
    return { texto: "Remarcação pendente", tom: "remarcacao" };
  }
  if (e.triagem === "andamento" && e.triagemDisponivel) return { texto: "Triagem em andamento", tom: "triagem" };
  if (e.triagem !== "feita" && (e.triagemDisponivel || e.status === "pendente_anamnese")) {
    return { texto: "Falta a triagem", tom: "triagem" };
  }
  return { texto: "Confirmada", tom: "ok" };
}

/** Classes da etiqueta por tom (pares conferidos em scripts/teste_contraste_paciente.ts). */
export const CLASSE_ETIQUETA: Record<TomEtiqueta, string> = {
  pagamento: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  sala: "bg-emerald-700 text-white",
  remarcacao: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  triagem: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  ok: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
};

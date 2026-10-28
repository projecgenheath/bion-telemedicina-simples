/** "12345 SP" -> "CRM 12345 SP"; "CRM 12345 SP" fica igual (evita "CRM CRM"). */
export function crmComRotulo(crm: string | null | undefined): string {
  const t = (crm ?? "").trim();
  if (!t) return "CRM não informado";
  return /^crm\b/i.test(t) ? t : `CRM ${t}`;
}

/** Nota só aparece com avaliação real: "4.8 (3 avaliações)" ou "Sem avaliações ainda". */
export function textoNota(m: { avaliacao: number; numAvaliacoes: number }): string {
  if (!m.numAvaliacoes) return "Sem avaliações ainda";
  return `${m.avaliacao.toFixed(1)} (${m.numAvaliacoes} ${m.numAvaliacoes === 1 ? "avaliação" : "avaliações"})`;
}

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

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

/**
 * CRM no formato nº/UF ("CRM 12345/SP"). Aceita "12345 SP", "CRM 12345 SP",
 * "CRM-SP 12345", "12.345/sp"… Sem número ou UF reconhecível, cai em
 * crmComRotulo (mostra o que foi cadastrado, sem inventar UF).
 */
export function crmNumeroUf(crm: string | null | undefined): string {
  const t = (crm ?? "").trim();
  if (!t) return crmComRotulo(t);
  const semRotulo = t.replace(/^crm\b/i, " ");
  const numero = (semRotulo.match(/\d[\d.]*/)?.[0] ?? "").replace(/\D/g, "");
  const uf = (semRotulo.toUpperCase().match(/\b[A-Z]{2}\b/g) ?? []).find((x) => UFS.has(x));
  if (!numero || !uf) return crmComRotulo(t);
  return `CRM ${numero}/${uf}`;
}

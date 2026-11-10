/**
 * Formatação LEGÍVEL da coleta da anamnese (BION IA) para o médico.
 *
 * Os valores da coleta são `unknown`: o motor determinístico grava
 * escalares, mas a rota da anamnese mescla campos LIVRES extraídos pelo
 * LLM (ver `mesclarColeta` em src/app/api/anamnese/route.ts), que podem
 * ser objetos ou listas de objetos — ex.: pressão como
 * `{ sistolica: 120, diastolica: 80 }`. A aba Triagem exibia esses
 * valores com `JSON.stringify` cru e as chaves com "_" no lugar de
 * espaços. Aqui tudo vira texto corrido pt-BR.
 */

/** Chave interna da coleta (o contador `_n` do motor) não é dado clínico. */
export const ehCampoInternoColeta = (campo: string) => campo.startsWith("_");

/** "pressao_arterial" → "Pressao arterial" (sem dicionário: troca _ por espaço e capitaliza). */
export function rotuloCampoColeta(campo: string): string {
  const t = campo.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Valor da coleta como texto corrido: objeto vira "Rótulo: valor; …", lista vira "a, b". */
export function textoValorColeta(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.map(textoValorColeta).filter(Boolean).join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([k, val]) => !ehCampoInternoColeta(k) && val !== null && val !== undefined && val !== "")
      .map(([k, val]) => `${rotuloCampoColeta(k)}: ${textoValorColeta(val)}`)
      .join("; ");
  }
  return String(v);
}

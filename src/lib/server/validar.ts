import "server-only";

/** Helpers leves de validação de body (P1) — sem dependência extra.
 *  P3-2: textoObrigatorio foi removido — nunca foi usado em nenhum fluxo. */

export function emailNorm(v: unknown): string | { erro: string } {
  if (typeof v !== "string") return { erro: "E-mail inválido." };
  const s = v.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 254) {
    return { erro: "E-mail inválido." };
  }
  return s;
}

export function idCuid(v: unknown, campo = "id"): string | { erro: string } {
  if (typeof v !== "string" || !v.trim()) return { erro: `${campo} inválido.` };
  const s = v.trim();
  // cuid / cuid2 / uuid-ish — rejeita strings vazias e muito longas
  if (s.length < 8 || s.length > 64 || !/^[A-Za-z0-9_-]+$/.test(s)) {
    return { erro: `${campo} inválido.` };
  }
  return s;
}

export function isErro(v: unknown): v is { erro: string } {
  return typeof v === "object" && v !== null && "erro" in v;
}

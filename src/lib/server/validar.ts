import "server-only";

/** Helpers leves de validação de body (P1) — sem dependência extra. */

export function textoObrigatorio(
  v: unknown,
  campo: string,
  opts?: { min?: number; max?: number },
): string | { erro: string } {
  if (typeof v !== "string") return { erro: `${campo} é obrigatório.` };
  const s = v.trim();
  const min = opts?.min ?? 1;
  const max = opts?.max ?? 500;
  if (s.length < min) return { erro: `${campo} é obrigatório.` };
  if (s.length > max) return { erro: `${campo} deve ter no máximo ${max} caracteres.` };
  return s;
}

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

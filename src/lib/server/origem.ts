import type { NextRequest } from "next/server";

/**
 * Proteção simples contra CSRF em POST com cookie: aceita só quando o
 * cabeçalho Origin (ou, sem ele, o Referer) é do mesmo host da requisição.
 * Sem nenhum dos dois (ex.: cliente nativo/curl), recusa.
 */
export function origemPermitida(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const fonte = req.headers.get("origin") ?? req.headers.get("referer");
  return origemConfere(fonte, host);
}

export function origemConfere(fonte: string | null, host: string | null): boolean {
  if (!fonte || !host) return false;
  try {
    return new URL(fonte).host === host;
  } catch {
    return false;
  }
}

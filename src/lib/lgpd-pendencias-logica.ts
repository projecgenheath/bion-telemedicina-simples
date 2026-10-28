/**
 * Regras puras das pendências LGPD gravadas na auditoria (remoção do Supabase
 * Auth, objetos do Storage, desbloqueio do login). Servidor em
 * src/lib/server/lgpd.ts. Testes em lgpd-pendencias-logica.teste.ts.
 *
 * Uma pendência só está FECHADA quando existe uma conclusão com
 * `pendencia=<id>` dela mesma (nunca por entidade ou data).
 */

/** Marca gravada nos detalhes da conclusão/aviso de uma pendência. */
export const marcaPendencia = (id: string) => `pendencia=${id}`;

/** Ids de pendência citados em detalhes de conclusões ("pendencia=<id>[; …]"). */
export function idsPendenciaConcluidos(detalhes: (string | null)[]): Set<string> {
  const out = new Set<string>();
  for (const d of detalhes) {
    const m = /(?:^|;\s*)pendencia=([^;\s]+)/.exec(d ?? "");
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * Filtra as fechadas e SÓ DEPOIS aplica o limite (pendências abertas novas
 * não somem atrás de antigas já resolvidas). Mantém a ordem recebida.
 */
export function filtrarAbertas<T extends { id: string }>(pendentes: T[], concluidas: Set<string>, limite: number): T[] {
  const out: T[] = [];
  for (const p of pendentes) {
    if (concluidas.has(p.id)) continue;
    out.push(p);
    if (out.length >= limite) break;
  }
  return out;
}

/** Caminhos de uma pendência de Storage. JSON inválido ou sem `paths` = inválida (falha registrada). */
export function lerPathsStorage(detalhes: string | null): { ok: true; paths: string[] } | { ok: false; erro: string } {
  let d: unknown;
  try {
    d = JSON.parse(detalhes ?? "");
  } catch {
    return { ok: false, erro: "detalhes com JSON inválido" };
  }
  const paths = (d as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(paths) || !paths.every((x) => typeof x === "string")) {
    return { ok: false, erro: "detalhes sem a lista de caminhos" };
  }
  return { ok: true, paths: paths as string[] };
}

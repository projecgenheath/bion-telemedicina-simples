"use client";

import { rotuloTipoAtendimento } from "@/lib/atendimento-tipo";

/**
 * Lê o tipo do atendimento de uma consulta do estado do cliente. Tolera o
 * tipo `Consulta` com ou sem o campo (o #63 do Admin o adiciona em
 * bion-tipos.ts; até lá ele chega só pelo JSON).
 */
export function tipoDaConsulta(c: unknown): string | null {
  return rotuloTipoAtendimento((c as { tipoAtendimento?: unknown } | null)?.tipoAtendimento);
}

/** Etiqueta pequena "Retorno" / "Renovação de receita"; nada para consulta comum. */
export function EtiquetaTipo({ consulta, className = "" }: { consulta: unknown; className?: string }) {
  const rotulo = tipoDaConsulta(consulta);
  if (!rotulo) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-violet-600/15 text-violet-900 dark:bg-violet-400/20 dark:text-violet-100 ${className}`}>
      {rotulo}
    </span>
  );
}

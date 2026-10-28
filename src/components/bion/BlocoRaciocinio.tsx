"use client";

import { AVISO_IA } from "@/lib/bion-ia-cliente";

/**
 * "Ver como a IA pensou": raciocínio do modelo num bloco FECHADO por padrão,
 * separado da resposta final (que é a única coisa copiada/inserida).
 */
export function BlocoRaciocinio({ raciocinio }: { raciocinio?: string | null }) {
  if (!raciocinio?.trim()) return null;
  return (
    <details className="mt-2 text-xs opacity-90">
      <summary className="cursor-pointer select-none font-semibold">ver como a IA pensou</summary>
      <p className="mt-1 italic opacity-80">{AVISO_IA}</p>
      <div className="mt-1 whitespace-pre-wrap opacity-80">{raciocinio}</div>
    </details>
  );
}

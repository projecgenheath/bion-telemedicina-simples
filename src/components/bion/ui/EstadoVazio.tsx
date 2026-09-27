"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

/** Estado vazio reutilizável — lista sem itens, busca sem resultado, etc. */
export function EstadoVazio({
  titulo = "Nada por aqui ainda",
  descricao,
  icone: Icone = Inbox,
  acao,
}: {
  titulo?: string;
  descricao?: string;
  icone?: LucideIcon;
  acao?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center text-center gap-3 py-12 px-6 rounded-3xl border border-dashed bg-muted/30"
    >
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Icone className="w-7 h-7 text-primary" aria-hidden />
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-sm font-extrabold text-foreground">{titulo}</h3>
        {descricao ? (
          <p className="text-xs text-muted-foreground leading-relaxed">{descricao}</p>
        ) : null}
      </div>
      {acao ? <div className="pt-1">{acao}</div> : null}
    </div>
  );
}

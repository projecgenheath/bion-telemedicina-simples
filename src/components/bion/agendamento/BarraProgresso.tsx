"use client";

import { ChevronLeft } from "lucide-react";

export function AgendamentoBarraProgresso({
  step,
  steps,
  onVoltar,
}: {
  step: number;
  steps: readonly string[];
  onVoltar: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Passo {step + 1} de {steps.length}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mt-0.5">{steps[step]}</h1>
        </div>
        {step > 0 && step < 7 && (
          <button
            type="button"
            onClick={onVoltar}
            className="shrink-0 flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground transition px-3 py-2 rounded-xl hover:bg-muted"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

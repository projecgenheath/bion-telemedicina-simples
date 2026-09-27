"use client";
import {
  Heart,
} from "lucide-react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" };
  const iconSizes = { sm: "w-6 h-6", md: "w-8 h-8", lg: "w-11 h-11" };
  return (
    <div className={`font-extrabold tracking-tight ${sizes[size]} flex items-center gap-2.5`}>
      <div className="relative shrink-0">
        <div
          className={`${iconSizes[size]} rounded-2xl bg-primary flex items-center justify-center shadow-md`}
        >
          <Heart className="w-4 h-4 text-primary-foreground fill-primary-foreground" />
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-background" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-primary tracking-tight">BION</span>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          Telemedicina
        </span>
      </div>
    </div>
  );
}
export function TelaCarregando({
  texto = "Carregando BION...",
  comLista = false,
}: {
  texto?: string;
  /** Mostra esqueleto de lista abaixo do logo (útil no bootstrap). */
  comLista?: boolean;
}) {
  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 w-full max-w-md">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-md animate-pulse">
          <Heart className="w-6 h-6 text-primary-foreground fill-primary-foreground" />
        </div>
        <div className="text-sm font-bold text-muted-foreground">{texto}</div>
        {comLista ? (
          <div className="w-full space-y-3 pt-4" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border bg-card p-4 flex items-center gap-4 animate-pulse"
              >
                <div className="w-11 h-11 rounded-xl bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/5 rounded-md bg-muted" />
                  <div className="h-3 w-3/5 rounded-md bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

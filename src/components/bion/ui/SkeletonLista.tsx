"use client";

/** Placeholder de lista enquanto dados carregam (pulso suave). */
export function SkeletonLista({
  linhas = 4,
  className = "",
}: {
  linhas?: number;
  className?: string;
}) {
  return (
    <div
      className={`space-y-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      {Array.from({ length: linhas }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border bg-card p-4 flex items-center gap-4 animate-pulse"
        >
          <div className="w-11 h-11 rounded-xl bg-muted shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3.5 w-2/5 rounded-md bg-muted" />
            <div className="h-3 w-3/5 rounded-md bg-muted/70" />
          </div>
          <div className="h-8 w-16 rounded-lg bg-muted/80 shrink-0 hidden sm:block" />
        </div>
      ))}
      <span className="sr-only">Carregando lista…</span>
    </div>
  );
}

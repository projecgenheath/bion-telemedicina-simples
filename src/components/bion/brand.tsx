"use client";

const TAMANHOS = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-28 w-28",
} as const;

/** Marca oficial: círculo #24058D com o wordmark BION. Claro no fundo claro, escuro no fundo escuro. */
export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${TAMANHOS[size]}`}
      role="img"
      aria-label="BION"
    >
      <img
        src="/logo.svg"
        alt=""
        className="block h-full w-full dark:hidden"
        draggable={false}
      />
      <img
        src="/logo-escuro.svg"
        alt=""
        className="hidden h-full w-full dark:block"
        draggable={false}
      />
    </span>
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
        <div className="animate-pulse">
          <Logo size="md" />
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

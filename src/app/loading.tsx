export default function GlobalLoading() {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin"
          aria-hidden
        />
        <p className="text-sm font-medium text-muted-foreground">Carregando…</p>
      </div>
    </div>
  );
}

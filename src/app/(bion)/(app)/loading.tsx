export default function AppLoading() {
  return (
    <div
      className="flex items-center justify-center py-24"
      role="status"
      aria-live="polite"
      aria-label="Carregando conteúdo"
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    </div>
  );
}

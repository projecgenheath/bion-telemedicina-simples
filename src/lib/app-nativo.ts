/** True quando a página roda dentro da casca nativa (Capacitor Android/iOS). */
export function estaNoAppNativo(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

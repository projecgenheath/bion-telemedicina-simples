import { ehCelular } from "@/lib/teleconsulta-logica";

/**
 * Botão "Compartilhar tela" só no COMPUTADOR: o navegador precisa ter
 * getDisplayMedia, o ponteiro principal precisa ser fino (mouse/trackpad)
 * e o aparelho não pode ser celular/tablet (user agent; iPadOS se passa por Mac com toque).
 * Regra pura, testada em compartilhar-tela.teste.ts.
 */
export function podeCompartilharTela({
  temGetDisplayMedia,
  ponteiroFino,
  userAgent,
  maxTouchPoints = 0,
}: {
  temGetDisplayMedia: boolean;
  ponteiroFino: boolean;
  userAgent: string;
  maxTouchPoints?: number;
}): boolean {
  return temGetDisplayMedia && ponteiroFino && !ehCelular(userAgent, maxTouchPoints);
}

/** Lê o ambiente do navegador (false no servidor). */
export function podeCompartilharTelaAqui(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return podeCompartilharTela({
    temGetDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia === "function",
    ponteiroFino: typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

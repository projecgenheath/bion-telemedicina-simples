"use client";

import { useSyncExternalStore } from "react";

/**
 * Rótulo do atalho da busca conforme o sistema: "⌘K" só em Mac/iPhone/iPad,
 * "Ctrl K" em Windows, Linux, Android e ChromeOS. O atalho em si aceita os
 * dois (metaKey || ctrlKey) em qualquer sistema.
 */
export function ehApple(plataforma: string, userAgent = ""): boolean {
  return /mac|iphone|ipad|ipod/i.test(plataforma) || (!plataforma && /mac os x|iphone|ipad/i.test(userAgent));
}

export function rotuloAtalhoBusca(apple: boolean): { curto: string; falado: string } {
  return apple ? { curto: "⌘K", falado: "Command K" } : { curto: "Ctrl K", falado: "Control K" };
}

function plataformaAtual(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || nav.platform || "";
}
const nada = () => () => {};
const lerApple = () => ehApple(plataformaAtual(), navigator.userAgent);

/** No servidor (e no 1º render da hidratação) assume Ctrl K, o caso mais comum. */
export function useAtalhoBusca() {
  const apple = useSyncExternalStore(nada, lerApple, () => false);
  return rotuloAtalhoBusca(apple);
}

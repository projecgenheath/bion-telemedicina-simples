"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Preferências visuais do admin (sem efeitos: useSyncExternalStore).
 * - Tema: MESMA chave do app inteiro (localStorage "bion-tema" = "claro" | "escuro")
 *   e classe .dark no <html> — o script anti-FOUC do RootLayout já a aplica.
 * - Densidade: chave própria do admin ("bion-admin-densidade"); por padrão
 *   compacta no desktop (≥ 1024 px) e confortável no celular.
 */
export type Tema = "claro" | "escuro";
export type DensidadeAdmin = "compacta" | "confortavel";

const CHAVE_TEMA = "bion-tema";
const CHAVE_DENSIDADE = "bion-admin-densidade";
const EVENTO = "bion-admin-preferencia";
export const LARGURA_DESKTOP = 1024;

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* modo privado: só não persiste */
  }
  window.dispatchEvent(new Event(EVENTO));
}
function assinarArmazenamento(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENTO, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENTO, cb);
  };
}

/* ---------------- tema ---------------- */
function assinarTema(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
const temaAtual = (): Tema => (document.documentElement.classList.contains("dark") ? "escuro" : "claro");

export function useTemaAdmin() {
  const tema = useSyncExternalStore(assinarTema, temaAtual, () => "claro" as Tema);
  const definir = useCallback((novo: Tema) => {
    document.documentElement.classList.toggle("dark", novo === "escuro");
    gravar(CHAVE_TEMA, novo);
  }, []);
  return { tema, definir };
}

/* ---------------- largura ---------------- */
function assinarLargura(cb: () => void) {
  const mq = window.matchMedia(`(min-width: ${LARGURA_DESKTOP}px)`);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** true a partir de 1024 px (layout largo). No servidor assume celular. */
export function useLargo(): boolean {
  return useSyncExternalStore(
    assinarLargura,
    () => window.matchMedia(`(min-width: ${LARGURA_DESKTOP}px)`).matches,
    () => false,
  );
}

/* ---------------- densidade ---------------- */
export function useDensidadeAdmin() {
  const largo = useLargo();
  const salva = useSyncExternalStore(assinarArmazenamento, () => ler(CHAVE_DENSIDADE), () => null);
  const densidade: DensidadeAdmin =
    salva === "compacta" || salva === "confortavel" ? salva : largo ? "compacta" : "confortavel";
  const definir = useCallback((d: DensidadeAdmin) => gravar(CHAVE_DENSIDADE, d), []);
  return { densidade, definir };
}

/** Booleano simples no localStorage (ex.: trilho aberto). */
export function usePreferenciaBool(chave: string, padrao: boolean) {
  const s = useSyncExternalStore(assinarArmazenamento, () => ler(chave), () => null);
  const v = s === "1" ? true : s === "0" ? false : padrao;
  const definir = useCallback((novo: boolean) => gravar(chave, novo ? "1" : "0"), [chave]);
  return [v, definir] as const;
}

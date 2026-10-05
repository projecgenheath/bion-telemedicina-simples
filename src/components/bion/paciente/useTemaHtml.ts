"use client";

import { useSyncExternalStore } from "react";

/**
 * Tema REAL do app, lido da classe `dark` do <html> (é o que o SCRIPT_TEMA
 * do app/layout.tsx aplica, seguindo `prefers-color-scheme` quando não há
 * escolha salva). Antes o Perfil lia só o localStorage e, com o celular em
 * modo escuro e nada salvo, mostrava "Clean" com o app escuro.
 *
 * Observa a classe do <html> para ficar em dia se o tema mudar em outro lugar.
 */
function assinar(aoMudar: () => void) {
  const obs = new MutationObserver(aoMudar);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

const lerEscuro = () => document.documentElement.classList.contains("dark");

export type TemaPaciente = "claro" | "escuro";

export function useTemaHtml(): TemaPaciente {
  const escuro = useSyncExternalStore(assinar, lerEscuro, () => false);
  return escuro ? "escuro" : "claro";
}

/** Aplica e salva o tema (mesma chave e valores dos outros perfis). */
export function aplicarTema(novo: TemaPaciente) {
  document.documentElement.classList.toggle("dark", novo === "escuro");
  try {
    localStorage.setItem("bion-tema", novo);
  } catch {
    /* modo privado: o tema vale só nesta sessão */
  }
}

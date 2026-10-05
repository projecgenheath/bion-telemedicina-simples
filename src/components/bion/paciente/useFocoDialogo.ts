"use client";

import { useEffect, useRef, type RefObject } from "react";

const SELETOR =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * ESC fecha o diálogo e o Tab fica preso dentro dele (focus trap).
 * Foca o primeiro elemento útil ao abrir (de preferência o botão de fechar).
 */
export function useFocoDialogo(
  aberto: boolean,
  onFechar: () => void,
  rootRef: RefObject<HTMLElement | null>,
) {
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  });

  useEffect(() => {
    if (!aberto) return;
    const root = rootRef.current;
    if (!root) return;

    const focaveis = () =>
      [...root.querySelectorAll<HTMLElement>(SELETOR)].filter(
        (el) => el.tabIndex !== -1 && !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
      );

    const fecharBtn =
      root.querySelector<HTMLElement>('[aria-label*="echar" i], [aria-label*="oltar" i]') ?? focaveis()[0];
    // requestAnimationFrame: o diálogo pode ainda estar montando o DOM
    const id = requestAnimationFrame(() => fecharBtn?.focus());

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        // Um bottom sheet (Radix) aberto por cima trata o próprio Escape.
        if (document.querySelector('[role="dialog"][data-state="open"]')) return;
        e.preventDefault();
        fecharRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const lista = focaveis();
      if (lista.length === 0) return;
      const atual = document.activeElement as HTMLElement | null;
      const i = atual ? lista.indexOf(atual) : -1;
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault();
          lista[lista.length - 1]?.focus();
        }
      } else if (i === lista.length - 1 || i === -1) {
        e.preventDefault();
        lista[0]?.focus();
      }
    };
    root.addEventListener("keydown", aoTeclar);
    return () => {
      cancelAnimationFrame(id);
      root.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, rootRef]);
}

"use client";

import { useEffect, useRef, type RefObject } from "react";
import { deslocamentoVisivel, deveFecharArrasto, ehArrastoParaBaixo } from "./arrastar-fechar";

/** Altura (px) do topo da janela que sempre arrasta: alça + título. */
const ZONA_TOPO_PX = 72;

/**
 * Arrastar para baixo fecha a janela de baixo (sheet) do paciente.
 * - Pela alça/título (topo do painel ou `[data-arrastar]`) sempre funciona,
 *   mesmo sobre a lista de dias (rolagem horizontal) ou campos.
 * - Pelo conteúdo só quando o painel está rolado no topo, e nunca a partir de
 *   textarea/input/select nem de listas com rolagem horizontal ou interna.
 * - Fecha passando de ~120px ou num peteleco; senão volta ao lugar.
 * Usa touch events nativos (passive: false) para poder impedir a rolagem
 * da página só quando o gesto já é um arrasto para baixo.
 */
export function useArrastarFechar(painelRef: RefObject<HTMLElement | null>, onFechar: () => void) {
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  });

  useEffect(() => {
    const painel = painelRef.current;
    if (!painel) return;
    const semMovimento = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let ativo = false; // toque elegível começou
    let arrastando: boolean | null = null;
    let doTopo = false;
    let x0 = 0, y0 = 0, t0 = 0, ultY = 0, ultT = 0, vel = 0;

    function bloqueiaConteudo(alvo: Element | null): boolean {
      for (let el = alvo; el && el !== painel; el = el.parentElement) {
        if (el.matches("textarea, input, select, [contenteditable=''], [contenteditable='true'], [data-sem-arrastar]")) return true;
        const cs = getComputedStyle(el);
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth) return true;
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true;
      }
      return false;
    }

    function aplicar(dy: number, transicao: boolean) {
      if (!painel) return;
      painel.style.transition = transicao && !semMovimento ? "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
      painel.style.transform = dy ? `translateY(${dy}px)` : "";
    }

    function inicio(e: TouchEvent) {
      if (e.touches.length !== 1 || !painel) return;
      const t = e.touches[0];
      const alvo = e.target as Element | null;
      const topoPainel = painel.getBoundingClientRect().top;
      doTopo = t.clientY - topoPainel <= ZONA_TOPO_PX || !!alvo?.closest?.("[data-arrastar]");
      if (!doTopo && (painel.scrollTop > 0 || bloqueiaConteudo(alvo))) {
        ativo = false;
        return;
      }
      ativo = true;
      arrastando = null;
      x0 = t.clientX; y0 = t.clientY; t0 = ultT = e.timeStamp; ultY = y0; vel = 0;
    }

    function mover(e: TouchEvent) {
      if (!ativo || !painel) return;
      const t = e.touches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (arrastando === null) {
        const d = ehArrastoParaBaixo(dx, dy);
        if (d === null) return;
        // Conteúdo: só arrasta se ainda está no topo. Topo: sempre.
        arrastando = d && (doTopo || painel.scrollTop <= 0);
        if (!arrastando) { ativo = false; return; }
        // A animação de entrada (fill: both) prenderia o transform.
        painel.style.animation = "none";
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - ultT;
      if (dt > 0) vel = (t.clientY - ultY) / dt;
      ultY = t.clientY; ultT = e.timeStamp;
      aplicar(deslocamentoVisivel(dy), false);
    }

    function fim() {
      if (!ativo) return;
      ativo = false;
      if (!arrastando) return;
      arrastando = null;
      const dy = ultY - y0;
      if (deveFecharArrasto(dy, vel)) {
        if (semMovimento) { fecharRef.current(); return; }
        aplicar(painel!.offsetHeight + 40, true);
        window.setTimeout(() => fecharRef.current(), 180);
      } else {
        aplicar(0, true);
      }
    }

    painel.addEventListener("touchstart", inicio, { passive: true });
    painel.addEventListener("touchmove", mover, { passive: false });
    painel.addEventListener("touchend", fim);
    painel.addEventListener("touchcancel", fim);
    return () => {
      painel.removeEventListener("touchstart", inicio);
      painel.removeEventListener("touchmove", mover);
      painel.removeEventListener("touchend", fim);
      painel.removeEventListener("touchcancel", fim);
    };
  }, [painelRef]);
}

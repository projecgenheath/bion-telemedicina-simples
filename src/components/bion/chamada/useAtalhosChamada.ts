"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Tempo parado até a barra e o topo sumirem. */
export const OCULTAR_APOS_MS = 4_000;

function emCampoEditavel(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Atalhos de teclado e auto-ocultar da tela de chamada (comum aos dois papéis).
 *
 *  - M: microfone. V (ou C, o atalho antigo): câmera. Esc: não faz nada na
 *    chamada (nunca encerra; folhas e diálogos abertos fecham sozinhos).
 *  - Barra e topo somem depois de ~4 s sem mexer, só com `podeOcultar`
 *    (ex.: vídeo do outro na tela e nenhuma folha aberta). Toque na tela
 *    mostra/oculta; mexer o mouse ou usar o teclado mostra.
 *
 * Devolve `visivel` e os handlers para o contêiner da tela.
 */
export function useAtalhosChamada({
  onMic,
  onCam,
  podeOcultar,
  ativo = true,
  ocultarAposMs = OCULTAR_APOS_MS,
}: {
  onMic: () => void;
  onCam: () => void;
  podeOcultar: boolean;
  /** false desliga os atalhos (ex.: folha de mensagens aberta). */
  ativo?: boolean;
  ocultarAposMs?: number;
}) {
  const [oculto, setOculto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef({ onMic, onCam });
  useEffect(() => {
    handlers.current = { onMic, onCam };
  }, [onMic, onCam]);

  const agendar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!podeOcultar) return;
    timer.current = setTimeout(() => setOculto(true), ocultarAposMs);
  }, [podeOcultar, ocultarAposMs]);

  const mostrar = useCallback(() => {
    setOculto(false);
    agendar();
  }, [agendar]);

  // Mudou o "pode ocultar": volta a mostrar (ajuste no render, sem efeito em cascata).
  const [podiaOcultar, setPodiaOcultar] = useState(podeOcultar);
  if (podiaOcultar !== podeOcultar) {
    setPodiaOcultar(podeOcultar);
    setOculto(false);
  }

  // Ao poder ocultar: começa a contar.
  useEffect(() => {
    agendar();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [podeOcultar, agendar]);

  useEffect(() => {
    if (!ativo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (emCampoEditavel(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "m") {
        e.preventDefault();
        handlers.current.onMic();
      } else if (k === "v" || k === "c") {
        e.preventDefault();
        handlers.current.onCam();
      } else if (k === "escape") {
        // Nada: Esc nunca encerra a chamada.
        return;
      }
      mostrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ativo, mostrar]);

  /** Toque/clique em área livre da tela alterna; em botão/PiP só mantém visível. */
  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("button, a, input, textarea, [role=dialog], [data-sem-alternar]")) {
        mostrar();
        return;
      }
      if (oculto) mostrar();
      else if (podeOcultar) {
        if (timer.current) clearTimeout(timer.current);
        setOculto(true);
      }
    },
    [oculto, podeOcultar, mostrar],
  );

  /** Mouse mexendo (computador) mostra; toque não conta (vira pointerup). */
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && oculto) mostrar();
    },
    [oculto, mostrar],
  );

  return { visivel: !podeOcultar || !oculto, mostrar, handlers: { onPointerUp, onPointerMove } };
}

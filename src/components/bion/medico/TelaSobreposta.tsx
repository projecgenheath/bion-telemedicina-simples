"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * Fecha a sobreposição com o botão "voltar" do navegador/Android:
 * empurra uma entrada no histórico ao abrir e fecha no `popstate`.
 * Se a sobreposição fechar pela UI, consome a entrada extra.
 */
export function useVoltarFecha(aberto: boolean, onFechar: () => void) {
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  });
  useEffect(() => {
    if (!aberto) return;
    // Profundidade permite sobreposições aninhadas: só fecha quem ficou
    // "acima" da entrada atual do histórico.
    const profundidade = ((window.history.state?.bmProfundidade as number | undefined) ?? 0) + 1;
    let viaVoltar = false;
    window.history.pushState({ ...window.history.state, bmProfundidade: profundidade }, "");
    const aoVoltar = () => {
      const atual = (window.history.state?.bmProfundidade as number | undefined) ?? 0;
      if (atual < profundidade) {
        viaVoltar = true;
        fecharRef.current();
      }
    };
    window.addEventListener("popstate", aoVoltar);
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      if (!viaVoltar && window.history.state?.bmProfundidade === profundidade) window.history.back();
    };
  }, [aberto]);
}

/** Tela cheia sobre o app (dentro da moldura de 430px), com botão voltar. */
export function TelaSobreposta({
  titulo,
  subtitulo,
  onFechar,
  acoes,
  children,
  rodape,
}: {
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  acoes?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  useVoltarFecha(true, onFechar);
  const voltarRef = useRef<HTMLButtonElement>(null);
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  });

  useEffect(() => {
    voltarRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Um bottom sheet (Radix) aberto por cima trata o próprio Escape.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      fecharRef.current();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <div className="bm-sobreposicao absolute inset-0 z-40 flex flex-col" role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="bp-safe-top shrink-0 px-4 pt-3 pb-3 flex items-center gap-3 border-b border-bion-ink/10 dark:border-white/10">
        <button
          ref={voltarRef}
          type="button"
          onClick={onFechar}
          aria-label="Voltar"
          className="w-10 h-10 rounded-full inline-flex items-center justify-center bg-bion-ink/8 dark:bg-white/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black truncate">{titulo}</h2>
          {subtitulo ? <p className="text-xs text-bion-ink/75 dark:text-bion-paper/75 truncate">{subtitulo}</p> : null}
        </div>
        {acoes}
      </header>
      <div className={`flex-1 overflow-y-auto bp-coluna ${rodape ? "" : "pb-[env(safe-area-inset-bottom)]"}`}>{children}</div>
      {rodape ? <div className="shrink-0 bp-safe-bottom border-t border-bion-ink/10 dark:border-white/10">{rodape}</div> : null}
    </div>
  );
}

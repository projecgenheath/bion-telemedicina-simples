"use client";

import { X } from "lucide-react";
import { ModalBion } from "@/components/bion/ModalBion";

/**
 * Bottom sheet do app do médico (Radix via ModalBion: foco preso, ESC,
 * devolução de foco). No desktop vira um cartão centralizado com a mesma
 * largura da moldura do app (430 px).
 */
export function SheetMedico({
  aberto,
  onFechar,
  titulo,
  subtitulo,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <ModalBion
      aberto={aberto}
      onFechar={onFechar}
      titulo={titulo}
      descricao={subtitulo}
      sheet
      sheetAte="md"
      largura="md:max-w-[430px]"
      overlay="bg-black/70"
    >
      <div className="bm-sheet max-h-[88dvh] overflow-y-auto bp-coluna px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-bion-ink/20 dark:bg-white/25 md:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-tight">{titulo}</h2>
            {subtitulo ? <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mt-0.5">{subtitulo}</p> : null}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 w-10 h-10 rounded-full inline-flex items-center justify-center bg-bion-ink/8 dark:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </ModalBion>
  );
}

/** Rótulo + campo de formulário com o visual do app. */
export function Campo({
  rotulo,
  ajuda,
  erro,
  children,
}: {
  rotulo: string;
  ajuda?: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">{rotulo}</span>
      <div className="mt-1">{children}</div>
      {erro ? (
        <span className="block text-xs font-semibold text-red-700 dark:text-red-300 mt-1" role="alert">
          {erro}
        </span>
      ) : ajuda ? (
        <span className="block text-xs text-bion-ink/70 dark:text-bion-paper/70 mt-1">{ajuda}</span>
      ) : null}
    </label>
  );
}

/** Selo "em breve" para funcionalidades que dependem de fases futuras. */
export function EmBreve({ texto = "Em breve" }: { texto?: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-800 dark:text-amber-200">
      {texto}
    </span>
  );
}

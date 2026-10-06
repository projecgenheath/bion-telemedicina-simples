"use client";

import { useState } from "react";
import { Hand } from "lucide-react";

const PAINEIS = ["Perfil", "Início", "Pacientes"];
const SECOES = ["Início", "Gestão", "Perfil público"];
const CHAVE_DICA = "bion-medico-dica-gestos";

/** Pontos discretos: páginas (pílula flutuante embaixo, igual ao app do paciente) e seções da coluna central (à direita). */
export function IndicadorTelas({
  painel,
  secao,
  onPainel,
  onSecao,
  oculto = false,
}: {
  painel: number;
  secao: number;
  onPainel: (i: number) => void;
  onSecao: (i: number) => void;
  /** Some quando há sheet/sobreposição aberta, para não cobrir o conteúdo. */
  oculto?: boolean;
}) {
  if (oculto) return null;
  return (
    <>
      <nav
        aria-label="Páginas"
        className="bm-paginas absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full bg-zinc-950/80 px-2 py-1 backdrop-blur"
      >
        {PAINEIS.map((r, i) => (
          <button
            key={r}
            type="button"
            onClick={() => onPainel(i)}
            aria-label={`Ir para ${r}`}
            aria-current={painel === i ? "page" : undefined}
            className="p-1.5"
          >
            <span className={`block h-2 rounded-full transition-all ${painel === i ? "w-6 bg-sky-300" : "w-2 bg-white/45"}`} />
          </button>
        ))}
      </nav>
      {painel === 1 ? (
        <nav
          key={`s-${secao}`}
          aria-label="Seções do início"
          className="bm-indicador absolute right-1 top-[calc(50%-1.375rem)] -translate-y-1/2 z-20 flex flex-col items-center rounded-full bg-zinc-950/60 py-1 backdrop-blur"
        >
          {SECOES.map((r, i) => (
            <button
              key={r}
              type="button"
              onClick={() => onSecao(i)}
              aria-label={`Ir para ${r}`}
              aria-current={secao === i ? "true" : undefined}
              className="px-[3px] py-1"
            >
              <span className={`block w-1.5 rounded-full transition-all ${secao === i ? "h-5 bg-sky-300" : "h-1.5 bg-white/45"}`} />
            </button>
          ))}
        </nav>
      ) : null}
    </>
  );
}

/** Dica de gestos só na primeira visita (localStorage). */
export function useDicaGestos() {
  const [visivel, setVisivel] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_DICA) !== "1";
    } catch {
      return false;
    }
  });
  const dispensar = () => {
    if (!visivel) return;
    setVisivel(false);
    try {
      localStorage.setItem(CHAVE_DICA, "1");
    } catch {
      /* ignora */
    }
  };
  return { visivel, dispensar };
}

export function DicaGestos({ onDispensar }: { onDispensar: () => void }) {
  return (
    <div
      role="status"
      className="bm-dica absolute left-4 right-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 rounded-3xl bg-zinc-950/90 text-white p-4 backdrop-blur shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <Hand className="w-5 h-5 mt-0.5 shrink-0 text-sky-300" aria-hidden />
        <div className="text-sm leading-relaxed">
          <p>
            <strong>Para os lados:</strong> perfil (esquerda) e pacientes (direita).
          </p>
          <p>
            <strong>Para baixo:</strong> gestão e seu perfil público.
          </p>
          <p className="text-white/80 text-xs mt-1">No computador: setas do teclado ou os pontos na tela.</p>
        </div>
      </div>
      <button type="button" onClick={onDispensar} className="mt-3 w-full rounded-full bg-white text-zinc-950 py-2 text-sm font-bold">
        Entendi
      </button>
    </div>
  );
}

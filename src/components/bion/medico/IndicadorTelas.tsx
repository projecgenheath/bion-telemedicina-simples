"use client";

import { useEffect, useState } from "react";
import { Hand } from "lucide-react";

const PAINEIS = ["Perfil", "Início", "Pacientes"];
const SECOES = ["Início", "Gestão", "Perfil público"];
const CHAVE_DICA = "bion-medico-dica-gestos";

/**
 * Pontos discretos do app do médico (não é compartilhado com paciente/admin;
 * a pílula do paciente fica em NavegacaoPaciente.tsx).
 * Páginas: pílula flutuante embaixo. Seções da coluna central: à direita.
 * O marcador ativo desliza com .bion-indicador, sem aumentar o tamanho da pílula.
 */
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
        className="bm-paginas absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 rounded-full bg-zinc-950/80 px-2 py-1 backdrop-blur"
      >
        {/* w-7 por slot (3×28px + px-2) preserva a largura discreta da pílula
            antiga (um ponto ativo w-6 + dois w-2 + gap-1 + padding). */}
        <div className="relative grid grid-cols-3">
          <span
            aria-hidden="true"
            className="bion-indicador pointer-events-none absolute inset-y-0 left-0 z-10 flex w-1/3 items-center justify-center"
            style={{ transform: `translateX(${painel * 100}%)` }}
          >
            <span className="block h-2 w-6 rounded-full bg-sky-300" />
          </span>
          {PAINEIS.map((r, i) => (
            <button
              key={r}
              type="button"
              onClick={() => onPainel(i)}
              aria-label={`Ir para ${r}`}
              aria-current={painel === i ? "page" : undefined}
              className="bion-toque bion-toque-forte relative z-20 flex w-7 items-center justify-center p-1.5"
            >
              <span className={`block h-2 w-2 rounded-full bg-white/45 ${painel === i ? "opacity-0" : ""}`} />
            </button>
          ))}
        </div>
      </nav>
      {painel === 1 ? (
        <nav
          aria-label="Seções do início"
          className={`bm-indicador bm-indicador-${secao} absolute right-1 top-[calc(50%-1.375rem)] -translate-y-1/2 z-20 rounded-full bg-zinc-950/60 py-1 backdrop-blur`}
        >
          {/* h-14 = soma da altura antiga (um ponto h-5 + dois h-1.5 + paddings). */}
          <div className="relative grid h-14 grid-rows-3">
            <span
              aria-hidden="true"
              className="bion-indicador pointer-events-none absolute inset-x-0 top-0 z-10 flex h-1/3 items-center justify-center"
              style={{ transform: `translateY(${secao * 100}%)` }}
            >
              <span className="block h-5 w-1.5 rounded-full bg-sky-300" />
            </span>
            {SECOES.map((r, i) => (
              <button
                key={r}
                type="button"
                onClick={() => onSecao(i)}
                aria-label={`Ir para ${r}`}
                aria-current={secao === i ? "true" : undefined}
                className="bion-toque bion-toque-forte relative z-20 flex items-center justify-center px-[3px]"
              >
                <span className={`block h-1.5 w-1.5 rounded-full bg-white/45 ${secao === i ? "opacity-0" : ""}`} />
              </button>
            ))}
          </div>
        </nav>
      ) : null}
    </>
  );
}

/** Dica de gestos só na primeira visita (localStorage). A leitura acontece
 *  DEPOIS da montagem (B-1): ler no inicializador de estado divergia entre
 *  servidor e cliente (risco de hidratação). O setState roda num callback
 *  (não direto no corpo do efeito). */
export function useDicaGestos() {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    let mostrar = false;
    try {
      mostrar = localStorage.getItem(CHAVE_DICA) !== "1";
    } catch {
      /* sem acesso ao armazenamento: sem dica */
    }
    const t = setTimeout(() => setVisivel(mostrar), 0);
    return () => clearTimeout(t);
  }, []);
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
      <button type="button" onClick={onDispensar} className="bion-toque mt-3 w-full rounded-full bg-white text-zinc-950 py-2 text-sm font-bold">
        Entendi
      </button>
    </div>
  );
}

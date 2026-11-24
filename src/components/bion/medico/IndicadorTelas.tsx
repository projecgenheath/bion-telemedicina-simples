"use client";

import { useEffect, useState } from "react";
import { Hand } from "lucide-react";

const SECOES = ["Início", "Gestão", "Perfil público"];
const CHAVE_DICA = "bion-medico-dica-gestos";

/** Pontos das seções da coluna central (à direita, só no Início).
 *  Etapa 5: a pílula de páginas de baixo (Perfil · Início · Pacientes)
 *  saiu — a barra inferior (BarraInferiorMedico) assumiu esses destinos.
 *  Cores do roxo #C4B5FD para o azul do redesign. */
export function IndicadorTelas({
  painel,
  secao,
  onSecao,
  oculto = false,
}: {
  painel: number;
  secao: number;
  onSecao: (i: number) => void;
  /** Some quando há sheet/sobreposição aberta, para não cobrir o conteúdo. */
  oculto?: boolean;
}) {
  if (oculto || painel !== 1) return null;
  return (
    <nav
      key={`s-${secao}`}
      aria-label="Seções do início"
      className="bm-indicador absolute right-1 top-[calc(50%-1.375rem)] -translate-y-1/2 z-20 flex flex-col items-center rounded-full bg-white/90 py-1 shadow-sm dark:bg-[#181b20]/90"
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
          <span
            className={`block w-1.5 rounded-full transition-all ${
              secao === i ? "h-5 bg-[#2f62c4] dark:bg-[#9dbcf7]" : "h-1.5 bg-[#242424]/45 dark:bg-white/45"
            }`}
          />
        </button>
      ))}
    </nav>
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
      className="bm-dica absolute left-4 right-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-30 rounded-3xl bg-zinc-950/90 text-white p-4 backdrop-blur shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <Hand className="w-5 h-5 mt-0.5 shrink-0 text-[#9dbcf7]" aria-hidden />
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

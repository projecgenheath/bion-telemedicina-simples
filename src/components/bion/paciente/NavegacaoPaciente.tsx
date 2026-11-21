"use client";

import { useState } from "react";
import { Hand } from "lucide-react";

const PAINEIS = [
  { idx: 0, rotulo: "Perfil" },
  { idx: 1, rotulo: "Início" },
  { idx: 2, rotulo: "Documentos" },
] as const;

const SECOES = [
  { id: "inicio", rotulo: "Início" },
  { id: "saude", rotulo: "Saúde" },
  { id: "exames", rotulo: "Exames" },
] as const;

const CHAVE_DICA = "bion-paciente-dica-gestos";

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
      className="bpp-dica absolute left-4 right-4 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-30 rounded-3xl bg-zinc-950/90 text-white p-4 backdrop-blur shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <Hand className="w-5 h-5 mt-0.5 shrink-0 text-[#FFC169]" aria-hidden />
        <div className="text-sm leading-relaxed">
          <p>
            <strong>Para os lados:</strong> perfil (esquerda) e documentos (direita).
          </p>
          <p>
            <strong>Para baixo:</strong> saúde e exames.
          </p>
          <p className="text-white/80 text-xs mt-1">Os nomes das telas ficam sempre embaixo. No computador: setas do teclado.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDispensar}
        className="mt-3 w-full min-h-11 rounded-full bg-white text-zinc-950 py-2.5 text-sm font-bold"
      >
        Entendi
      </button>
    </div>
  );
}

/**
 * Dock de navegação em vidro de marca (refinamento nov/2026):
 * - casca de vidro âmbar (Clean) / vidro quente escuro (Dark) com blur;
 * - um "thumb" dourado desliza atrás do rótulo ativo (sem remontar nada);
 * - no dock de seções, o thumb amadurece com a jornada: dourado (Início)
 *   → oliva (Saúde) → verde (Exames) — a paleta da zona vira navegação.
 * Nomes das telas, sempre visíveis no celular (não somem depois da dica):
 * - embaixo: Perfil / Início / Documentos
 * - acima, só no painel central: Início / Saúde / Exames
 * Contador de mensagens não lidas em Documentos.
 * Some em tela larga (≥ 1024), onde os painéis já ficam lado a lado.
 */
export function NavegacaoPaciente({
  painel,
  secao,
  onPainel,
  onSecao,
  naoLidas = 0,
  oculto = false,
}: {
  painel: number;
  secao: number;
  onPainel: (i: number) => void;
  onSecao: (i: number) => void;
  naoLidas?: number;
  /** Some quando há sheet/sobreposição aberta. */
  oculto?: boolean;
}) {
  if (oculto) return null;

  const irSecao = (i: number) => {
    if (painel !== 1) onPainel(1);
    if (painel !== 1) {
      requestAnimationFrame(() => onSecao(i));
    } else {
      onSecao(i);
    }
  };

  return (
    <>
      {painel === 1 ? (
        <nav
          aria-label="Seções do início"
          data-idx={secao}
          className="bpp-dock bpp-dock-secoes bpp-indicador-secao absolute bottom-[calc(4.6rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
        >
          <span aria-hidden className="bpp-thumb" style={{ transform: `translateX(${secao * 100}%)` }} />
          {SECOES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => irSecao(i)}
              aria-current={secao === i ? "true" : undefined}
              className="bpp-dock-item"
            >
              {s.rotulo}
            </button>
          ))}
        </nav>
      ) : null}

      <nav
        aria-label="Painéis do app"
        data-idx={painel}
        className="bpp-dock bpp-indicador absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
      >
        <span aria-hidden className="bpp-thumb" style={{ transform: `translateX(${painel * 100}%)` }} />
        {PAINEIS.map(({ idx, rotulo }) => {
          const docs = idx === 2;
          const rotuloAria =
            docs && naoLidas > 0
              ? `${rotulo}, ${naoLidas} mensagem${naoLidas === 1 ? "" : "ns"} não lida${naoLidas === 1 ? "" : "s"}`
              : rotulo;
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onPainel(idx)}
              aria-label={rotuloAria}
              aria-current={painel === idx ? "page" : undefined}
              className="bpp-dock-item"
            >
              {rotulo}
              {docs && naoLidas > 0 ? (
                <span className="absolute -top-1 -right-1 z-10 min-w-5 h-5 px-1 rounded-full bg-rose-600 text-xs font-black leading-5 text-center text-white">
                  {naoLidas > 9 ? "9+" : naoLidas}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}

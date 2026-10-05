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
      className="bpp-dica absolute left-4 right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 rounded-3xl bg-zinc-950/90 text-white p-4 backdrop-blur shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <Hand className="w-5 h-5 mt-0.5 shrink-0 text-sky-300" aria-hidden />
        <div className="text-sm leading-relaxed">
          <p>
            <strong>Para os lados:</strong> perfil (esquerda) e documentos (direita).
          </p>
          <p>
            <strong>Para baixo:</strong> saúde e exames.
          </p>
          <p className="text-white/80 text-xs mt-1">No computador: setas do teclado ou os pontinhos na tela.</p>
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
 * Indicadores discretos (estilo etapa 1):
 * - pílula embaixo com pontinhos de Perfil / Início / Documentos
 * - pontinhos laterais das seções Início → Saúde → Exames (só no painel central)
 * Contador de mensagens não lidas no pontinho de Documentos.
 * Some em tela larga (≥ 1024).
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
      {/* Indicador lateral das 3 seções (só no painel central, celular) */}
      {painel === 1 ? (
        <nav
          key={`s-${secao}`}
          aria-label="Seções do início"
          className="bpp-indicador-secao absolute right-1 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center rounded-full bg-zinc-950/60 py-1 backdrop-blur"
        >
          {SECOES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => irSecao(i)}
              aria-label={`Ir para ${s.rotulo}`}
              aria-current={secao === i ? "true" : undefined}
              className="px-[3px] py-1"
            >
              <span
                className={`block w-1.5 rounded-full transition-all ${
                  secao === i ? "h-5 bg-sky-300" : "h-1.5 bg-white/45"
                }`}
              />
            </button>
          ))}
        </nav>
      ) : null}

      {/* Pontinhos inferiores discretos — Perfil / Início / Documentos */}
      <nav
        aria-label="Painéis do app"
        className="bpp-indicador absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-full bg-zinc-950/85 text-white backdrop-blur px-1.5 py-1 pointer-events-auto"
      >
        {PAINEIS.map(({ idx, rotulo }) => {
          const docs = idx === 2;
          const rotuloAria =
            docs && naoLidas > 0
              ? `${rotulo}, ${naoLidas} mensagem${naoLidas === 1 ? "" : "ns"} não lida${naoLidas === 1 ? "" : "s"}`
              : `Ir para ${rotulo}`;
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onPainel(idx)}
              aria-label={rotuloAria}
              aria-current={painel === idx ? "page" : undefined}
              className="relative p-1.5"
            >
              <span
                className={`block h-2 rounded-full transition-all ${
                  painel === idx ? "w-6 bg-sky-300" : "w-2 bg-white/70"
                }`}
              />
              {docs && naoLidas > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-rose-600 text-xs font-black leading-5 text-center text-white">
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

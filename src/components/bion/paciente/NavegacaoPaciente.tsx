"use client";

import { useState } from "react";
import {
  Activity,
  FileText,
  Hand,
  HeartPulse,
  Home,
  MessageCircle,
} from "lucide-react";

const SECOES = [
  { id: "inicio", rotulo: "Início", Icone: Home },
  { id: "saude", rotulo: "Saúde", Icone: HeartPulse },
  { id: "exames", rotulo: "Exames", Icone: Activity },
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
      className="bpp-dica absolute left-4 right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 rounded-3xl bg-zinc-950/90 text-white p-4 backdrop-blur shadow-2xl"
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
          <p className="text-white/80 text-xs mt-1">No computador: setas do teclado ou os botões embaixo.</p>
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
 * Barra inferior (Início / Saúde / Exames) + pontinhos laterais da seção +
 * atalho de Documentos com contador de mensagens não lidas.
 * Some em tela larga (≥ 1024), onde os 3 painéis ficam lado a lado.
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
    // Pequeno atraso se ainda estamos voltando do perfil/documentos
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
              className="px-[3px] py-1.5 min-h-8"
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

      <nav
        aria-label="Navegação do paciente"
        className="bpp-barra absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 flex items-stretch gap-1 rounded-full bg-zinc-950/90 text-white backdrop-blur px-1.5 py-1.5 shadow-lg"
      >
        {SECOES.map((s, i) => {
          const ativo = painel === 1 && secao === i;
          const Icone = s.Icone;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => irSecao(i)}
              aria-label={s.rotulo}
              aria-current={ativo ? "page" : undefined}
              className={`bpp-barra-btn min-w-14 min-h-11 px-2.5 rounded-full inline-flex flex-col items-center justify-center gap-0.5 transition-colors ${
                ativo ? "bg-white/15 text-sky-200" : "text-white/75"
              }`}
            >
              <Icone className="w-5 h-5" aria-hidden />
              <span className="text-[11px] font-bold leading-none">{s.rotulo}</span>
            </button>
          );
        })}

        <span className="w-px self-stretch my-1.5 bg-white/15" aria-hidden />

        <button
          type="button"
          onClick={() => onPainel(2)}
          aria-label={
            naoLidas > 0
              ? `Documentos e mensagens, ${naoLidas} não lida${naoLidas === 1 ? "" : "s"}`
              : "Documentos e mensagens"
          }
          aria-current={painel === 2 ? "page" : undefined}
          className={`bpp-barra-btn relative min-w-14 min-h-11 px-2.5 rounded-full inline-flex flex-col items-center justify-center gap-0.5 transition-colors ${
            painel === 2 ? "bg-white/15 text-sky-200" : "text-white/75"
          }`}
        >
          {naoLidas > 0 ? <MessageCircle className="w-5 h-5" aria-hidden /> : <FileText className="w-5 h-5" aria-hidden />}
          <span className="text-[11px] font-bold leading-none">Docs</span>
          {naoLidas > 0 ? (
            <span className="absolute top-0.5 right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[10px] font-black leading-4 text-center">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          ) : null}
        </button>
      </nav>
    </>
  );
}

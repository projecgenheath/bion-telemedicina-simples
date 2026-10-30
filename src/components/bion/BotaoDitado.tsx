"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";

/**
 * Ditado por voz (degrau 1 da transcrição): botão de microfone que usa a
 * Web Speech API do navegador (`SpeechRecognition` /
 * `webkitSpeechRecognition`, pt-BR) e entrega cada trecho FINAL reconhecido
 * para `onTexto` — quem recebe ANEXA ao texto existente, nunca substitui.
 *
 * Degradação graciosa: onde a API não existe (Firefox, alguns navegadores
 * embarcados), o botão simplesmente não aparece. Sem custo de servidor:
 * o reconhecimento é o nativo do navegador.
 */

// Tipos mínimos da Web Speech API (não fazem parte da lib DOM do TS).
type ResultadoReconhecimento = { isFinal: boolean; 0: { transcript: string } };
type EventoReconhecimento = {
  resultIndex: number;
  results: ArrayLike<ResultadoReconhecimento>;
};
interface ReconhecimentoVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoReconhecimento) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type ConstrutorReconhecimento = new () => ReconhecimentoVoz;

function construtorReconhecimento(): ConstrutorReconhecimento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecimento;
    webkitSpeechRecognition?: ConstrutorReconhecimento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function BotaoDitado({
  onTexto,
  disabled = false,
  className = "",
  rotuloParado = "Ditar por voz",
}: {
  /** Chamado com cada trecho final reconhecido; quem recebe ANEXA ao texto. */
  onTexto: (trecho: string) => void;
  disabled?: boolean;
  className?: string;
  rotuloParado?: string;
}) {
  // Suporte só é conhecido no cliente, depois da montagem — no servidor e
  // onde a API não existe, o botão não renderiza (degradação graciosa).
  const [suportado, setSuportado] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const recRef = useRef<ReconhecimentoVoz | null>(null);
  // Sempre o callback mais recente: o reconhecimento continua chamando
  // durante a digitação/edição e não pode anexar sobre um texto velho.
  const onTextoRef = useRef(onTexto);
  onTextoRef.current = onTexto;

  useEffect(() => {
    setSuportado(construtorReconhecimento() !== null);
    return () => {
      const rec = recRef.current;
      if (rec) {
        rec.onresult = null;
        rec.onend = null;
        rec.onerror = null;
        try {
          rec.stop();
        } catch {
          /* já encerrado */
        }
        recRef.current = null;
      }
    };
  }, []);

  if (!suportado) return null;

  const parar = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* já encerrado */
    }
    setOuvindo(false);
  };

  const alternar = () => {
    if (ouvindo) {
      parar();
      return;
    }
    const Construtor = construtorReconhecimento();
    if (!Construtor) return;
    const rec = new Construtor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    // Só resultados FINAIS viram texto: resultado parcial mudando a cada
    // sílaba obrigaria a apagar/reanexar — final é estável e anexável.
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r?.isFinal) {
          const trecho = r[0]?.transcript.trim();
          if (trecho) onTextoRef.current(trecho);
        }
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setOuvindo(false);
    };
    rec.onerror = (e) => {
      recRef.current = null;
      setOuvindo(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast.error("Microfone não autorizado para o ditado", {
          description: "Permita o microfone nas configurações do navegador para ditar por voz.",
        });
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setOuvindo(true);
    } catch {
      recRef.current = null;
      setOuvindo(false);
    }
  };

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={disabled}
      aria-pressed={ouvindo}
      aria-label={ouvindo ? "Parar ditado por voz" : rotuloParado}
      title={ouvindo ? "Parar ditado" : "Ditar por voz (reconhecimento do navegador)"}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition disabled:opacity-50 ${
        ouvindo
          ? "bg-red-500/15 border-red-400/50 text-red-500 dark:text-red-300"
          : "border-slate-400/40 hover:bg-slate-500/10"
      } ${className}`}
    >
      {ouvindo ? (
        <>
          <Square className="w-3.5 h-3.5 animate-pulse" /> Ouvindo… toque para parar
        </>
      ) : (
        <>
          <Mic className="w-3.5 h-3.5" /> {rotuloParado}
        </>
      )}
    </button>
  );
}

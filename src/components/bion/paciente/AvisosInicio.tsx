"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Hourglass, MessageCircle } from "lucide-react";
import type { Mensagem } from "@/lib/bion-tipos";
import { contagemConsulta, intervaloContagem } from "./contagem-consulta";

/**
 * Peças do Início do paciente (fase 3):
 *  - ContagemConsulta: selo "Em 2 dias", "Hoje, em 3 h", "Começa em 12 min";
 *  - AvisoMensagemNova: "Mensagem nova de Dr(a). Fulano" com o começo do texto.
 */

/** Relógio que se atualiza sozinho (mais rápido perto da consulta). */
function useAgora(ts: number) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setTimeout(() => setAgora(Date.now()), intervaloContagem(ts, agora));
    return () => window.clearTimeout(id);
  }, [ts, agora]);
  return agora;
}

export function ContagemConsulta({ ts }: { ts: number }) {
  const agora = useAgora(ts);
  const c = contagemConsulta(ts, agora);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
        c.urgente ? "bg-emerald-700 text-white" : "bpp-contagem"
      }`}
      aria-live="polite"
    >
      <Hourglass className="w-3.5 h-3.5" aria-hidden /> {c.texto}
    </span>
  );
}

export function AvisoMensagemNova({
  mensagem,
  total,
  onAbrir,
}: {
  mensagem: Mensagem;
  total: number;
  onAbrir: () => void;
}) {
  const outras = total - 1;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="bpp-toque bpp-surgir bp-glass w-full mb-3 p-4 flex items-center gap-3 text-left"
      aria-label={`Mensagem nova de ${mensagem.de}: ${mensagem.texto}. Abrir conversa`}
    >
      <span className="relative w-11 h-11 rounded-2xl bg-bion-sea/10 text-bion-sea dark:bg-sky-400/10 dark:text-sky-300 inline-flex items-center justify-center shrink-0" aria-hidden>
        <MessageCircle className="w-5 h-5" />
        <span className="bpp-aviso-ponto bpp-pulsar absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-black" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
          Mensagem nova{outras > 0 ? ` · +${outras}` : ""}
        </span>
        <span className="block text-sm font-bold truncate">{mensagem.de}</span>
        <span className="block text-sm text-bion-ink/75 dark:text-bion-paper/75 truncate">{mensagem.texto}</span>
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-bion-ink/75 dark:text-bion-paper/75" aria-hidden />
    </button>
  );
}

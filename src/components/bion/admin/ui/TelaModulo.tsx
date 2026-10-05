"use client";

import type { ComponentType, ReactNode } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import "../admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/**
 * Moldura de um módulo do admin (Agendamentos, Médicos, Repasses…):
 * cabeçalho com voltar opcional, ícone, título, subtítulo, "Atualizar"
 * (alternativa por botão ao puxar-para-atualizar) e ações; barra de
 * ferramentas (busca/filtros) e conteúdo.
 */
export function TelaModulo({
  titulo,
  subtitulo,
  icone: IconeModulo,
  onVoltar,
  onAtualizar,
  atualizando = false,
  acoes,
  ferramentas,
  children,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  icone?: Icone;
  onVoltar?: () => void;
  onAtualizar?: () => void;
  atualizando?: boolean;
  acoes?: ReactNode;
  ferramentas?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 lg:px-8 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-6 pb-28 lg:pb-10 max-w-[1400px] mx-auto w-full">
      <header className="flex flex-wrap items-center gap-3">
        {onVoltar ? (
          <button type="button" onClick={onVoltar} aria-label="Voltar" className="ba-icone-botao shrink-0">
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
        ) : null}
        {IconeModulo ? (
          <span className="ba-estado-icone !w-11 !h-11 shrink-0" data-tom="sinal" aria-hidden>
            <IconeModulo className="w-5 h-5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl lg:text-3xl font-black leading-tight break-words">{titulo}</h1>
          {subtitulo ? <p className="text-sm ba-texto-2 truncate">{subtitulo}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {onAtualizar ? (
            <button
              type="button"
              onClick={onAtualizar}
              disabled={atualizando}
              aria-label={atualizando ? "Atualizando…" : "Atualizar"}
              className="ba-icone-botao"
            >
              <RefreshCw className={`w-5 h-5 ${atualizando ? "motion-safe:animate-spin" : ""}`} aria-hidden />
            </button>
          ) : null}
          {acoes}
        </div>
      </header>
      {ferramentas ? <div className="mt-4 flex flex-col lg:flex-row gap-2 lg:items-center">{ferramentas}</div> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

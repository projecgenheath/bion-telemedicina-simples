"use client";

import { CalendarRange, ChevronDown, Clock, Tag } from "lucide-react";
import { CardFaturamento } from "../cards/CardFaturamento";
import { EmBreve } from "../sheets/SheetMedico";
import { fmtBRL } from "../metricas";
import type { DadosMedico } from "../useDadosMedico";

/** Tela 2 — faturamento (30 dias) + preço/promoções + agenda. */
export function TelaGestao({
  dados,
  onAbrirPreco,
  onAbrirAgenda,
}: {
  dados: DadosMedico;
  onAbrirPreco: () => void;
  onAbrirAgenda: () => void;
}) {
  const { medico, faturamento } = dados;
  const horarios = medico ? [...medico.horariosDisponiveis].sort() : [];

  return (
    <section className="bm-tela bm-tela-2 flex flex-col px-5 pt-10 pb-6" aria-labelledby="bm-t2-titulo">
      <h2 id="bm-t2-titulo" className="text-2xl font-black text-white">
        Gestão
      </h2>
      <p className="text-sm text-white/85 mb-5">Faturamento, preço e agenda.</p>

      <CardFaturamento {...faturamento} />

      {medico ? (
        <>
          <button
            type="button"
            onClick={onAbrirPreco}
            className="bp-glass p-5 mt-3 w-full text-left"
            aria-label={`Preço da consulta: ${fmtBRL(medico.valor)}. Alterar preço`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
                <Tag className="w-4 h-4" /> Preço da consulta
              </span>
              <span className="text-xs font-bold text-bion-sea dark:text-sky-300">Alterar</span>
            </div>
            <div className="mt-1 text-2xl font-black tabular-nums">{fmtBRL(medico.valor)}</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-bion-ink/75 dark:text-bion-paper/75">
              Promoções <EmBreve />
            </div>
          </button>

          <button
            type="button"
            onClick={onAbrirAgenda}
            className="bp-glass p-5 mt-3 w-full text-left"
            aria-label={`Agenda: ${horarios.length} horários por dia. Configurar agenda`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
                <CalendarRange className="w-4 h-4" /> Agenda
              </span>
              <span className="text-xs font-bold text-bion-sea dark:text-sky-300">Configurar</span>
            </div>
            {horarios.length ? (
              <>
                <div className="mt-1 text-lg font-black">
                  {horarios.length} horários por dia · {horarios[0]}–{horarios[horarios.length - 1]}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {horarios.slice(0, 8).map((h) => (
                    <span key={h} className="text-xs font-bold tabular-nums px-2 py-1 rounded-full bg-bion-ink/8 dark:bg-white/10">
                      {h}
                    </span>
                  ))}
                  {horarios.length > 8 ? <span className="text-xs font-bold px-2 py-1">+{horarios.length - 8}</span> : null}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Nenhum horário cadastrado ainda.
              </div>
            )}
          </button>
        </>
      ) : (
        <div className="bp-glass p-5 mt-3 text-sm text-bion-ink/75 dark:text-bion-paper/75">
          Seu cadastro ainda está em validação pela equipe BION. Preço e agenda ficam disponíveis assim que o CRM for aprovado.
        </div>
      )}

      <div className="mt-auto pt-8 flex flex-col items-center gap-1 text-white/90" aria-hidden>
        <span className="text-xs font-semibold">Seu perfil público abaixo</span>
        <ChevronDown className="w-5 h-5 motion-safe:animate-bounce" />
      </div>
    </section>
  );
}

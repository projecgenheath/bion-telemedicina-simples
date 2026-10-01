"use client";

import { CalendarX, ChevronLeft } from "lucide-react";
import type { AgendamentoCorpoProps } from "@/components/bion/agendamento/types";

export function PassoData(p: AgendamentoCorpoProps) {
  const {
    proximoPasso,
    dataSelecionada,
    setDataSelecionada,
    diasDisponiveis,
    irParaPasso,
    medicoAtual,
  } = p;

  if (diasDisponiveis.length === 0) {
    return (
      <div className="bg-card border rounded-3xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
          <CalendarX className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-lg font-bold">Sem horários livres nos próximos 14 dias</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            A agenda de <strong>{medicoAtual.nome}</strong> está completa neste período. Escolha
            outro profissional da especialidade para agendar mais cedo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => irParaPasso(1)}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-primary-foreground font-bold text-xs"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <ChevronLeft className="w-4 h-4" /> Escolher outro médico
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Escolha o melhor dia para ser atendido por <strong>{medicoAtual.nome}</strong>:
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {diasDisponiveis.map((d) => {
          const isSelected = dataSelecionada === d.rotulo;
          return (
            <button type="button"
              key={d.iso}
              onClick={() => {
                setDataSelecionada(d.rotulo);
                proximoPasso();
              }}
              className={`p-4 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-md scale-105"
                  : "bg-card hover:border-primary hover:bg-primary-soft"
              }`}
            >
              <span
                className={`text-xs ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}
              >
                {d.sem}
              </span>
              <span className="text-2xl font-extrabold">{d.diaNum}</span>
              <span
                className={`text-xs font-semibold ${isSelected ? "text-primary-foreground" : "text-primary"}`}
              >
                {d.rotulo === "Hoje" ? "Hoje" : d.mes}
              </span>
            </button>
          );
        })}
      </div>
    </div>

  );
}

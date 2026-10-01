"use client";

import { ChevronLeft } from "lucide-react";
import type { AgendamentoCorpoProps } from "@/components/bion/agendamento/types";
import { separarPorTurno } from "@/components/bion/agendamento/horarios";

export function PassoHorario(p: AgendamentoCorpoProps) {
  const {
    proximoPasso,
    dataSelecionada,
    horaSelecionada,
    setHoraSelecionada,
    diasDisponiveis,
    irParaPasso,
  } = p;

  // Só os horários LIVRES do médico no dia escolhido (fuso da clínica).
  const dia = diasDisponiveis.find((d) => d.rotulo === dataSelecionada);

  if (!dia) {
    return (
      <div className="bg-card border rounded-3xl p-8 text-center space-y-4 shadow-sm">
        <div>
          <h3 className="text-lg font-bold">Escolha um dia disponível</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            O dia selecionado não tem mais horários livres na agenda do médico.
          </p>
        </div>
        <button
          type="button"
          onClick={() => irParaPasso(2)}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-primary-foreground font-bold text-xs"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <ChevronLeft className="w-4 h-4" /> Escolher outro dia
        </button>
      </div>
    );
  }

  const { manha, tarde } = separarPorTurno(dia.horarios);
  const turnos = [
    { titulo: "Manhã", horarios: manha },
    { titulo: "Tarde / Noite", horarios: tarde },
  ].filter((t) => t.horarios.length > 0);

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Horários disponíveis para <strong>{dataSelecionada}</strong>:
      </div>

      <div className="bg-card border rounded-3xl p-6 space-y-6">
        {turnos.map((t) => (
          <div key={t.titulo}>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              {t.titulo}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {t.horarios.map((h) => (
                <button type="button"
                  key={h}
                  onClick={() => {
                    setHoraSelecionada(h);
                    proximoPasso();
                  }}
                  className={`py-3 rounded-xl border text-sm font-bold transition ${
                    horaSelecionada === h
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "hover:border-primary hover:bg-primary-soft"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>

  );
}

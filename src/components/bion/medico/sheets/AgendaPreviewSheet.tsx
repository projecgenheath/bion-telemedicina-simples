"use client";

import { useState } from "react";
import type { Consulta, Medico } from "@/lib/bion-store";
import { agendaLivreDoMedico } from "@/components/bion/paciente/agenda-medico";
import { SheetMedico } from "./SheetMedico";

/** Prévia (somente leitura) do "Agendar consulta" que o paciente vê. */
export function AgendaPreviewSheet({
  aberto,
  onFechar,
  medico,
  consultas,
}: {
  aberto: boolean;
  onFechar: () => void;
  medico: Medico;
  consultas: Consulta[];
}) {
  // O médico tem TODAS as próprias consultas, então a prévia é exata.
  const [agenda] = useState(() => agendaLivreDoMedico(medico, consultas));
  const [dia, setDia] = useState(() => agenda[0]?.iso ?? "");
  const selecionado = agenda.find((d) => d.iso === dia);

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Agendar consulta (prévia)"
      subtitulo="Horários livres nos próximos 14 dias, como o paciente vê. Nada é agendado aqui."
    >
      {agenda.length === 0 ? (
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhum horário livre nos próximos 14 dias.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto bp-coluna pb-1" role="listbox" aria-label="Datas disponíveis">
            {agenda.map((d) => (
              <button
                key={d.iso}
                type="button"
                role="option"
                aria-selected={d.iso === dia}
                onClick={() => setDia(d.iso)}
                className={`shrink-0 rounded-2xl px-3 py-2 text-left border ${
                  d.iso === dia
                    ? "border-transparent bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                    : "border-bion-ink/15 dark:border-white/15"
                }`}
              >
                <span className="block text-sm font-bold">{d.rotulo}</span>
                <span className="block text-xs">{d.sub}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {(selecionado?.horarios ?? []).map((h) => (
              <span
                key={h}
                className="py-2 rounded-xl text-center text-sm font-bold tabular-nums border border-bion-ink/15 dark:border-white/15"
              >
                {h}
              </span>
            ))}
          </div>
        </>
      )}
    </SheetMedico>
  );
}

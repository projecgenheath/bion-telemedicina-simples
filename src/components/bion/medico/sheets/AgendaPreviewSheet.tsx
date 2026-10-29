"use client";

import { useMemo, useState } from "react";
import type { Consulta, Medico } from "@/lib/bion-store";
import { agendaLivreDoMedico } from "@/components/bion/paciente/agenda-medico";
import { SheetMedico } from "./SheetMedico";
import { semDiasBloqueados } from "../metricas";
import { useBloqueiosAgenda } from "../useDadosMedico";

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
  // B-13: a grade ACOMPANHA o store (agendamentos que chegam com o sheet
  // aberto aparecem na hora; antes era congelada na montagem) e os dias
  // bloqueados pelo médico (que o paciente também não vê) saem quando a
  // lista de bloqueios chega.
  const base = useMemo(() => agendaLivreDoMedico(medico, consultas), [medico, consultas]);
  const bloqueios = useBloqueiosAgenda();
  const bloqueados = useMemo(() => new Set(bloqueios.porDia.keys()), [bloqueios.porDia]);
  // Sem a lista de bloqueios, a prévia NÃO pode ser mostrada: um dia
  // bloqueado apareceria como livre por falta de dado. Carregando ou erro
  // (com retry) — nunca uma agenda que parece livre sem a informação.
  const bloqueiosProntos = !bloqueios.carregando && !bloqueios.erro;
  const agenda = useMemo(
    () => (bloqueiosProntos ? semDiasBloqueados(base, bloqueados) : []),
    [bloqueiosProntos, base, bloqueados],
  );
  // Dia escolhido é a ESCOLHA explícita do médico; o primeiro dia livre é
  // só o padrão. Quando o dia escolhido é bloqueado ou fica sem horários,
  // a prévia mostra o primeiro dia livre COM AVISO (antes: substituição
  // silenciosa).
  const [escolhido, setDia] = useState<string | null>(null);
  const selecionado = (escolhido ? agenda.find((d) => d.iso === escolhido) : undefined) ?? agenda[0];
  const dia = selecionado?.iso ?? "";
  const diaEscolhidoSumiu = !!escolhido && !agenda.some((d) => d.iso === escolhido);

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Agendar consulta (prévia)"
      subtitulo="Horários livres nos próximos 14 dias, como o paciente vê. Nada é agendado aqui."
    >
      {bloqueios.carregando ? (
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75" role="status">
          Carregando dias bloqueados…
        </p>
      ) : bloqueios.erro ? (
        <div className="space-y-3">
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75" role="alert">
            Não foi possível carregar os dias bloqueados: {bloqueios.erro}. A prévia não é
            exibida sem essa informação, para nenhum dia bloqueado parecer livre.
          </p>
          <button type="button"
            onClick={() => void bloqueios.recarregar()}
            className="px-4 py-2 rounded-xl border text-sm font-bold"
          >
            Tentar de novo
          </button>
        </div>
      ) : agenda.length === 0 ? (
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhum horário livre nos próximos 14 dias.</p>
      ) : (
        <>
          {diaEscolhidoSumiu ? (
            <p className="text-xs font-semibold rounded-xl px-3 py-2 bg-amber-500/15 text-amber-900 dark:text-amber-100" role="status">
              O dia que você escolheu foi bloqueado ou ficou sem horários; mostrando o primeiro dia livre.
            </p>
          ) : null}
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

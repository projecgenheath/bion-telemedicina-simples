"use client";

import { useMemo, useState } from "react";
import { useBion, type Medico } from "@/lib/bion-store";
import {
  gerarGrade,
  INTERVALO_MINIMO,
  DURACAO_MINIMA,
  sugerirParametros,
  validarGrade,
  type ParametrosGrade,
} from "../metricas";
import { Campo, EmBreve, SheetMedico } from "./SheetMedico";
import type { Confirmar } from "./useConfirmarSalvamento";

const chaveLocal = (id: string) => `bion-medico-grade:${id}`;

function lerParametros(medico: Medico): ParametrosGrade {
  try {
    const salvo = localStorage.getItem(chaveLocal(medico.id));
    if (salvo) {
      const p = JSON.parse(salvo) as ParametrosGrade;
      if (!validarGrade(p)) return p;
    }
  } catch {
    /* ignora */
  }
  return sugerirParametros(medico.horariosDisponiveis);
}

/**
 * Agenda — gera a lista de horários de início (duração + intervalo ≥ 10 min
 * + pausa diária) e grava em PerfilMedico.horariosDisponiveis (único
 * caminho de gravação existente). Os parâmetros ficam só neste aparelho.
 */
export function AgendaSheet({
  aberto,
  onFechar,
  medico,
  confirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  medico: Medico;
  /** Compara a grade como string "HH:MM,HH:MM,…". */
  confirmar: Confirmar<string>;
}) {
  const { atualizarMedico } = useBion();
  const [p, setP] = useState<ParametrosGrade>(() => lerParametros(medico));
  const [excluidos, setExcluidos] = useState<Set<string>>(() => new Set());
  const erro = validarGrade(p);
  const gerados = useMemo(() => gerarGrade(p), [p]);
  const finais = gerados.filter((h) => !excluidos.has(h));
  const atual = [...medico.horariosDisponiveis].sort();
  const igualAoAtual = finais.join(",") === atual.join(",");

  const set = <K extends keyof ParametrosGrade>(k: K, v: ParametrosGrade[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (s: string) => (s === "" ? Number.NaN : Number.parseInt(s, 10));

  const alternar = (h: string) =>
    setExcluidos((s) => {
      const n = new Set(s);
      if (n.has(h)) n.delete(h);
      else n.add(h);
      return n;
    });

  const salvar = () => {
    if (erro || finais.length === 0) return;
    atualizarMedico(medico.id, { horariosDisponiveis: finais });
    confirmar(finais.join(","), "Salvando horários…", `Agenda atualizada: ${finais.length} horários por dia`);
    try {
      localStorage.setItem(chaveLocal(medico.id), JSON.stringify(p));
    } catch {
      /* ignora */
    }
    onFechar();
  };

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Minha agenda"
      subtitulo="Os horários gerados valem para todos os dias da semana."
    >
      <div className="space-y-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
            Horários atuais ({atual.length})
          </div>
          {atual.length ? (
            <p className="text-sm mt-1 leading-relaxed">{atual.join(" · ")}</p>
          ) : (
            <p className="text-sm mt-1 text-bion-ink/75 dark:text-bion-paper/75">
              Nenhum horário cadastrado — os pacientes veem a grade padrão da plataforma.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Início">
            <input type="time" value={p.inicio} onChange={(e) => set("inicio", e.target.value)} className="bp-entrada w-full px-4 py-2.5 text-sm" />
          </Campo>
          <Campo rotulo="Fim">
            <input type="time" value={p.fim} onChange={(e) => set("fim", e.target.value)} className="bp-entrada w-full px-4 py-2.5 text-sm" />
          </Campo>
          <Campo rotulo="Duração (min)">
            <input
              type="number"
              min={DURACAO_MINIMA}
              max={240}
              step={5}
              value={Number.isNaN(p.duracao) ? "" : p.duracao}
              onChange={(e) => set("duracao", num(e.target.value))}
              className="bp-entrada w-full px-4 py-2.5 text-sm"
            />
          </Campo>
          <Campo rotulo="Intervalo (min)" ajuda={`Mínimo ${INTERVALO_MINIMO} min.`}>
            <input
              type="number"
              min={INTERVALO_MINIMO}
              max={240}
              step={5}
              value={Number.isNaN(p.intervalo) ? "" : p.intervalo}
              onChange={(e) => set("intervalo", num(e.target.value))}
              className="bp-entrada w-full px-4 py-2.5 text-sm"
            />
          </Campo>
          <Campo rotulo="Pausa — início">
            <input type="time" value={p.pausaInicio ?? ""} onChange={(e) => set("pausaInicio", e.target.value || undefined)} className="bp-entrada w-full px-4 py-2.5 text-sm" />
          </Campo>
          <Campo rotulo="Pausa — fim">
            <input type="time" value={p.pausaFim ?? ""} onChange={(e) => set("pausaFim", e.target.value || undefined)} className="bp-entrada w-full px-4 py-2.5 text-sm" />
          </Campo>
        </div>

        {erro ? (
          <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
            {erro}
          </p>
        ) : (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
              Nova grade: {finais.length} horários — toque para remover ou devolver
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {gerados.map((h) => {
                const fora = excluidos.has(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => alternar(h)}
                    aria-pressed={!fora}
                    aria-label={`${h} ${fora ? "removido" : "incluído"}`}
                    className={`py-2 rounded-xl text-sm font-bold tabular-nums border ${
                      fora
                        ? "border-dashed border-bion-ink/30 dark:border-white/30 text-bion-ink/60 dark:text-bion-paper/60 line-through"
                        : "border-transparent bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">
          Só os horários de início são gravados; duração e intervalo ficam salvos neste aparelho. Consultas já marcadas não mudam.
        </p>

        <button
          type="button"
          onClick={salvar}
          disabled={Boolean(erro) || finais.length === 0 || igualAoAtual}
          className="bp-acao w-full py-3 text-sm"
        >
          {igualAoAtual ? "Grade igual à atual" : "Salvar horários"}
        </button>

        <ul className="space-y-2">
          {["Dias da semana de atendimento", "Pausas semanais", "Cancelar a agenda de um dia"].map((t) => (
            <li key={t} className="rounded-2xl border border-bion-ink/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{t}</span>
              <EmBreve />
            </li>
          ))}
        </ul>
      </div>
    </SheetMedico>
  );
}

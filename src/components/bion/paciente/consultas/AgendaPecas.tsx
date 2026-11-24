"use client";

import { DURACAO_SLOT_MIN } from "@/lib/teleconsulta-logica";
import { isoDia } from "../agenda-medico";
import { agruparHorarios, fimDoHorario, LETRAS_SEMANA, NOMES_SEMANA, nomeDiaLongo, semanasDoCalendario, tituloMeses } from "./consultas-dados";

/**
 * Peças de agenda do paciente (etapa 2), com o desenho da agenda do médico:
 * minicalendário (como a lateral da agenda) e horários em blocos (como os
 * eventos da grade). Só apresentação: os dias e horários livres chegam
 * prontos (agendaLivreDoMedico + diasDoAgendamento) — nada é recalculado.
 */

export type DiaLivre = { iso: string; horarios: string[] };

export function MiniCalendario({
  dias,
  selecionado,
  onEscolher,
  rotulo = "Dias com horário livre",
}: {
  dias: DiaLivre[];
  selecionado?: string;
  onEscolher: (iso: string) => void;
  rotulo?: string;
}) {
  const hoje = isoDia(Date.now());
  const livres = new Map(dias.map((d) => [d.iso, d.horarios.length]));
  const ultimo = dias.length ? dias[dias.length - 1]!.iso : hoje;
  const semanas = semanasDoCalendario(hoje, ultimo);
  const titulo = tituloMeses(semanas);
  return (
    <div className="bp2-mini" role="group" aria-label={rotulo}>
      <div className="bp2-mini-cab">
        <h3>
          {titulo.mes}, <span className="bp2-mini-ano">{titulo.ano}</span>
        </h3>
        <span className="bp2-mini-legenda">
          <i aria-hidden /> com horário
        </span>
      </div>
      <table className="bp2-mini-tab">
        <thead>
          <tr>
            {LETRAS_SEMANA.map((l, i) => (
              <th key={i} scope="col" abbr={NOMES_SEMANA[i]} className={i >= 5 ? "bp2-mini-fds" : ""}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((sem) => (
            <tr key={sem[0]!.iso}>
              {sem.map((d) => {
                const n = livres.get(d.iso) ?? 0;
                const passado = d.iso < hoje;
                return (
                  <td key={d.iso}>
                    <button
                      type="button"
                      disabled={n === 0}
                      data-opcao={n > 0 ? d.iso : undefined}
                      onClick={() => onEscolher(d.iso)}
                      aria-label={`${nomeDiaLongo(d)}${n ? `: ${n} horário${n > 1 ? "s" : ""} livre${n > 1 ? "s" : ""}` : passado ? "" : ": sem horário livre"}`}
                      aria-current={d.iso === hoje ? "date" : undefined}
                      aria-pressed={n > 0 ? d.iso === selecionado : undefined}
                      className={`${d.semana >= 5 ? "bp2-mini-fds" : ""} ${d.iso === hoje ? "bp2-mini-hoje" : ""} ${n > 0 ? "bp2-mini-livre" : ""}`}
                    >
                      {d.dia}
                      {n > 0 ? <i aria-hidden /> : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horários livres em blocos de agenda (início – fim do slot), por período. */
export function GradeHorarios({
  horarios,
  selecionado,
  onEscolher,
}: {
  horarios: string[];
  selecionado?: string;
  onEscolher: (h: string) => void;
}) {
  const grupos = agruparHorarios(horarios);
  return (
    <div className="bp2-horarios">
      {grupos.map((g) => (
        <section key={g.periodo} aria-label={`${g.periodo}: ${g.horarios.length} horário${g.horarios.length > 1 ? "s" : ""}`}>
          <p className="bp2-horarios-periodo">
            {g.periodo} <span className="bp2-t-2">· {g.horarios.length}</span>
          </p>
          <ul className="bp2-horarios-lista">
            {g.horarios.map((h) => (
              <li key={h}>
                <button
                  type="button"
                  data-opcao={h}
                  onClick={() => onEscolher(h)}
                  aria-pressed={selecionado === undefined ? undefined : selecionado === h}
                  aria-label={`${h} até ${fimDoHorario(h, DURACAO_SLOT_MIN)}`}
                  className="bp2-slot"
                >
                  <span className="bp2-slot-hora">{h}</span>
                  <span className="bp2-slot-fim">
                    {h} – {fimDoHorario(h, DURACAO_SLOT_MIN)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

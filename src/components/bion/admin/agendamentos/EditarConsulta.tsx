"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Save, ShieldAlert } from "lucide-react";
import { useBion, type Consulta } from "@/lib/bion-store";
import { instanteFusoClinica } from "@/lib/bion-tipos";
import { chaveDia, dataLonga, hora as horaDe, rotuloDia } from "../tempo";
import { useRecurso } from "../repasses/recurso";
import { useAcoesConsulta } from "./acoes";
import { corpoEdicao, horariosDoDia, validarHoraManual, type Horario } from "./agenda";

const ROTULO_MOTIVO: Record<NonNullable<Horario["motivo"]>, string> = {
  atual: "atual",
  ocupado: "ocupado",
  reservado: "reservado",
  passado: "já passou",
  vedado: "sem atendimento",
};

const instanteDe = (dia: string, h: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  const [hh, mm] = h.split(":").map(Number);
  return instanteFusoClinica(a, m - 1, d, hh, mm);
};

/**
 * Editar/remarcar (PATCH { acao: "atualizar" }): médico escolhido PELO ID e
 * grade dos horários livres daquele dia. O servidor confere de novo
 * (conflitos, reserva, dia bloqueado, 23:00–00:00) e só então avisamos.
 */
export function EditarConsulta({
  consulta: c,
  agora,
  onCancelar,
  onSalvo,
  onSujo,
}: {
  consulta: Consulta;
  agora: number;
  onCancelar: () => void;
  onSalvo: () => void;
  onSujo: (sujo: boolean) => void;
}) {
  const { medicos, consultas } = useBion();
  const { editar } = useAcoesConsulta();
  const [medicoId, setMedicoId] = useState(c.medicoId ?? "");
  const [dia, setDia] = useState(chaveDia(c.ts));
  const [hora, setHora] = useState(horaDe(c.ts));
  const [manual, setManual] = useState(false);
  const [horaManual, setHoraManual] = useState(horaDe(c.ts));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const medico = medicos.find((m) => m.id === medicoId);
  const ordenados = useMemo(() => [...medicos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [medicos]);
  const bloqueios = useRecurso<{ dias: string[] }>(medicoId ? `/api/medicos/${encodeURIComponent(medicoId)}/bloqueios` : null);
  const diaBloqueado = Boolean(bloqueios.dados?.dias.includes(dia));
  const horarios = useMemo(
    () => horariosDoDia({ grade: medico?.horariosDisponiveis ?? [], dia, medicoId, consultas, consultaId: c.id, agora }),
    [medico, dia, medicoId, consultas, c.id, agora],
  );

  const horaFinal = manual ? horaManual : hora;
  const erroManual = manual ? validarHoraManual(horaManual) : null;
  const corpo = /^\d{4}-\d{2}-\d{2}$/.test(dia) && horaFinal ? corpoEdicao(c, { dia, hora: horaFinal, medicoId, especialidade: medico?.especialidade ?? c.especialidade }) : null;
  const mudouHorario = Boolean(corpo?.data);
  const slotEscolhidoLivre = manual || horarios.some((h) => h.hora === hora && (h.livre || h.motivo === "atual"));
  const pode = Boolean(corpo) && !erroManual && !diaBloqueado && slotEscolhidoLivre && !enviando;

  const mexeu = (f: () => void) => {
    f();
    setErro(null);
    onSujo(true);
  };

  const salvar = async () => {
    if (!corpo || !pode) return;
    setEnviando(true);
    setErro(null);
    const novoTs = instanteDe(dia, horaFinal);
    const partes: string[] = [];
    if (corpo.data) partes.push(`para ${rotuloDia(novoTs, agora).toLowerCase()} às ${horaFinal}`);
    if (corpo.medicoId) partes.push(`com ${medico?.nome ?? "outro médico"}`);
    const r = await editar(c, corpo, `Consulta de ${c.paciente} remarcada ${partes.join(" ")}.`);
    setEnviando(false);
    if (r.ok) {
      onSujo(false);
      onSalvo();
    } else setErro(r.erro);
  };

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="ba-rotulo">Médico</span>
        <select
          value={medicoId}
          onChange={(e) => mexeu(() => setMedicoId(e.target.value))}
          className="ba-entrada mt-1 w-full"
        >
          {ordenados.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — {m.especialidade}
              {m.status === "pendente" ? " (em validação)" : m.status === "suspenso" ? " (suspenso)" : ""}
            </option>
          ))}
        </select>
      </label>
      {medicoId !== c.medicoId ? (
        <div className="ba-aviso" data-tom="atencao">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>Trocar o médico muda quem atende e quem recebe o repasse. Se a consulta já entrou num repasse, o servidor não deixa trocar.</p>
        </div>
      ) : null}

      <label className="block">
        <span className="ba-rotulo">Dia</span>
        <input type="date" value={dia} onChange={(e) => mexeu(() => setDia(e.target.value))} className="ba-entrada mt-1 w-full" />
      </label>
      {/^\d{4}-\d{2}-\d{2}$/.test(dia) ? <p className="text-xs ba-texto-2 -mt-2">{dataLonga(instanteDe(dia, "12:00"))}</p> : null}

      {diaBloqueado ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>O médico bloqueou este dia na agenda dele. Escolha outro dia.</p>
        </div>
      ) : null}

      <fieldset>
        <legend className="ba-rotulo">Horários do médico neste dia</legend>
        {horarios.length === 0 ? (
          <p className="text-sm ba-texto-2 mt-1">Este médico não tem grade de horários cadastrada. Use &quot;Outro horário&quot;.</p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-2" role="radiogroup" aria-label="Horários">
            {horarios.map((h) => {
              const escolhido = !manual && hora === h.hora;
              const usavel = (h.livre || h.motivo === "atual") && !diaBloqueado;
              return (
                <button
                  key={h.hora}
                  type="button"
                  role="radio"
                  aria-checked={escolhido}
                  disabled={!usavel}
                  onClick={() => mexeu(() => {
                    setManual(false);
                    setHora(h.hora);
                  })}
                  className="ba-slot"
                  data-escolhido={escolhido}
                >
                  <span className="font-bold tabular-nums">{h.hora}</span>
                  {h.motivo ? <span className="text-[10px] leading-none">{ROTULO_MOTIVO[h.motivo]}</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <label className="flex items-center gap-3 text-sm cursor-pointer">
        <input type="checkbox" className="w-5 h-5 accent-[var(--ba-sinal)]" checked={manual} onChange={(e) => mexeu(() => setManual(e.target.checked))} />
        <span>Outro horário (fora da grade)</span>
      </label>
      {manual ? (
        <label className="block">
          <span className="ba-rotulo">Horário</span>
          <input type="time" step={300} value={horaManual} onChange={(e) => mexeu(() => setHoraManual(e.target.value))} className="ba-entrada mt-1 w-full" />
          {erroManual ? (
            <span className="block text-sm font-bold mt-1" style={{ color: "var(--ba-critico)" }} role="alert">
              {erroManual}
            </span>
          ) : null}
        </label>
      ) : null}

      {corpo ? (
        <div className="ba-card text-sm" data-denso="true" aria-live="polite">
          <p className="ba-rotulo mb-1">Resumo</p>
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="ba-texto-2">
              {rotuloDia(c.ts, agora)} {horaDe(c.ts)} · {c.medico}
            </span>
            <ArrowRight className="w-3.5 h-3.5 ba-texto-3" aria-hidden />
            <span className="font-bold">
              {mudouHorario ? `${rotuloDia(instanteDe(dia, horaFinal), agora)} ${horaFinal}` : `${rotuloDia(c.ts, agora)} ${horaDe(c.ts)}`} ·{" "}
              {medico?.nome ?? c.medico}
            </span>
          </p>
          <p className="text-xs ba-texto-2 mt-1">Paciente e médico são avisados pelo app. Depois de salvar, dá para desfazer.</p>
        </div>
      ) : (
        <p className="text-sm ba-texto-2">Escolha um novo horário ou outro médico.</p>
      )}

      {erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{erro}</p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} disabled={enviando} className="ba-botao ba-botao-secundario">
          Voltar
        </button>
        <button type="button" onClick={() => void salvar()} disabled={!pode} className="ba-botao ba-botao-primario flex-1">
          {enviando ? <CalendarClock className="w-4 h-4" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
          {enviando ? "Salvando…" : "Salvar alteração"}
        </button>
      </div>
    </div>
  );
}

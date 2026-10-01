import { isoDia, type DiaAgenda } from "@/components/bion/paciente/agenda-medico";
import { MESES_AGENDA } from "@/components/bion/paciente/constantes";
import type { Consulta } from "@/lib/bion-tipos";

/**
 * Dia oferecido no agendamento novo. Derivado da agenda LIVRE do médico
 * (agendaLivreDoMedico): só entram dias com ao menos um horário livre no
 * fuso da clínica. `rotulo` é exatamente o que vai ao servidor ("Hoje",
 * "Amanhã" ou "D Mês" — formato lido por parseDataHora).
 */
export type DiaAgendamento = {
  iso: string;
  rotulo: string;
  sem: string;
  diaNum: number;
  mes: string;
  horarios: string[];
};

/**
 * Converte a agenda livre (dias com vaga) no formato dos cards de data.
 *
 * `consultasDoPaciente` (opcional) remove os horários em que o próprio
 * paciente já tem consulta ativa com QUALQUER médico — o servidor recusaria
 * com 409 ("Você já possui uma consulta neste horário"). Dias que ficam sem
 * horário somem da lista.
 */
export function diasDoAgendamento(
  agenda: DiaAgenda[],
  consultasDoPaciente: Consulta[] = [],
): DiaAgendamento[] {
  const ocupadosPaciente = new Set(
    consultasDoPaciente
      .filter((c) => !["cancelada", "concluida", "aguardando_reagendamento"].includes(c.status))
      .map((c) => `${isoDia(c.dataISO ?? c.ts)}|${c.hora}`),
  );
  return agenda
    .map((d) => ({ ...d, horarios: d.horarios.filter((h) => !ocupadosPaciente.has(`${d.iso}|${h}`)) }))
    .filter((d) => d.horarios.length > 0)
    .map((d) => {
      const [, mm, dd] = d.iso.split("-").map(Number);
      return {
        iso: d.iso,
        rotulo: d.rotulo,
        sem: d.sub,
        diaNum: dd,
        mes: MESES_AGENDA[mm - 1] ?? "",
        horarios: d.horarios,
      };
    });
}

/** Manhã (antes de 12:00) e tarde/noite (12:00 em diante), em ordem crescente. */
export function separarPorTurno(horarios: string[]): { manha: string[]; tarde: string[] } {
  const ordenados = [...horarios].sort();
  return {
    manha: ordenados.filter((h) => h < "12:00"),
    tarde: ordenados.filter((h) => h >= "12:00"),
  };
}

/**
 * Seleção efetiva a partir do que o paciente escolheu: se o dia saiu da agenda
 * (troca de médico, virada do dia, vaga ocupada) a data é descartada; se a hora
 * não está mais livre naquele dia, a hora é descartada.
 */
export function selecaoValida(
  dias: DiaAgendamento[],
  diaIso: string,
  hora: string,
): { dia: DiaAgendamento | undefined; hora: string } {
  const dia = dias.find((d) => d.iso === diaIso);
  return { dia, hora: dia && dia.horarios.includes(hora) ? hora : "" };
}

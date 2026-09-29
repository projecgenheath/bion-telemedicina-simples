import { MESES_AGENDA } from "./constantes";
import type { Consulta, Medico } from "@/lib/bion-tipos";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS_PADRAO = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];

export type DiaAgenda = {
  iso: string;
  rotulo: string;
  sub: string;
  horarios: string[];
};

function isoDia(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function chaveSlot(tsOuIso: number | string, hora: string) {
  const d = typeof tsOuIso === "number" ? new Date(tsOuIso) : new Date(tsOuIso);
  return `${isoDia(d)}|${hora}`;
}

export function agendaLivreDoMedico(
  medico: Medico | undefined,
  consultas: Consulta[],
  excluirConsultaId?: string,
  horizonteDias = 14,
): DiaAgenda[] {
  const horasBase = medico?.horariosDisponiveis?.length ? medico.horariosDisponiveis : HORAS_PADRAO;
  const agora = Date.now() + 30 * 60_000;

  const ocupados = new Set(
    consultas
      .filter(
        (c) =>
          c.id !== excluirConsultaId &&
          !["cancelada", "concluida"].includes(c.status) &&
          (medico ? c.medicoId === medico.id || c.medico === medico.nome : true),
      )
      .map((c) => chaveSlot(c.dataISO ?? c.ts, c.hora)),
  );

  const dias: DiaAgenda[] = [];
  for (let i = 0; i < horizonteDias; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const iso = isoDia(d);
    const horarios = horasBase.filter((h) => {
      const [hh, mm] = h.split(":").map(Number);
      const ts = new Date(d);
      ts.setHours(hh || 0, mm || 0, 0, 0);
      if (ts.getTime() < agora) return false;
      return !ocupados.has(`${iso}|${h}`);
    });
    if (!horarios.length) continue;
    dias.push({
      iso,
      rotulo: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${d.getDate()} ${MESES_AGENDA[d.getMonth()]}`,
      sub: DIAS[d.getDay()],
      horarios,
    });
  }
  return dias;
}

export function acharMedicoDaConsulta(consulta: Consulta | undefined, medicos: Medico[]) {
  if (!consulta) return undefined;
  return medicos.find((m) => m.id === consulta.medicoId || m.nome === consulta.medico);
}

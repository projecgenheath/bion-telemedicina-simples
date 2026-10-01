import { MESES_AGENDA } from "./constantes";
import { diaFusoClinica, instanteFusoClinica, partesFusoClinica } from "@/lib/bion-tipos";
import type { Consulta, Medico } from "@/lib/bion-tipos";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS_PADRAO = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];

export type DiaAgenda = {
  iso: string;
  rotulo: string;
  sub: string;
  horarios: string[];
};

/** Chave YYYY-MM-DD do dia no fuso da clínica (não no do navegador). */
export function isoDia(tsOuIso: number | string) {
  const p = partesFusoClinica(tsOuIso);
  return `${p.ano}-${String(p.mes + 1).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

function chaveSlot(tsOuIso: number | string, hora: string) {
  return `${isoDia(tsOuIso)}|${hora}`;
}

/** Mesma consulta do médico: por id; nome só para registros antigos sem medicoId. */
function eDoMedico(c: Consulta, medico: Medico) {
  return c.medicoId ? c.medicoId === medico.id : c.medico === medico.nome;
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
          !["cancelada", "concluida", "aguardando_reagendamento"].includes(c.status) &&
          (medico ? eDoMedico(c, medico) : true),
      )
      .map((c) => chaveSlot(c.dataISO ?? c.ts, c.hora)),
  );

  const dias: DiaAgenda[] = [];
  for (let i = 0; i < horizonteDias; i++) {
    const d = diaFusoClinica(i);
    const horarios = horasBase.filter((h) => {
      const [hh, mm] = h.split(":").map(Number);
      const ts = instanteFusoClinica(d.ano, d.mes, d.dia, hh || 0, mm || 0);
      if (ts < agora) return false;
      return !ocupados.has(`${d.iso}|${h}`);
    });
    if (!horarios.length) continue;
    dias.push({
      iso: d.iso,
      rotulo: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${d.dia} ${MESES_AGENDA[d.mes]}`,
      sub: DIAS[d.semana],
      horarios,
    });
  }
  return dias;
}

export function acharMedicoDaConsulta(consulta: Consulta | undefined, medicos: Medico[]) {
  if (!consulta) return undefined;
  return medicos.find((m) => m.id === consulta.medicoId || m.nome === consulta.medico);
}

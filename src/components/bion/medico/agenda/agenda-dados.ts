/* ==================================================================== */
/* Agenda semanal do médico (etapa 4, ref. 07) — funções puras.          */
/* Só as consultas reais do médico (dados.minhas), no fuso da clínica.   */
/* Regra da agenda: nada entre 23:00 e 00:00 — a grade termina às 23:00. */
/* ==================================================================== */

import { instanteFusoClinica, partesFusoClinica, type Consulta } from "@/lib/bion-tipos";
import { DURACAO_CONSULTA_SERVIDOR, VEDADO_INICIO_MIN } from "../metricas";

const DIA_MS = 86_400_000;

export type DiaAgenda = {
  ano: number;
  mes: number; // 0-11
  dia: number;
  iso: string; // AAAA-MM-DD
  semana: number; // 0=Dom
  inicio: number; // 00:00 no fuso da clínica (ms)
};

export type TomEvento = "azul" | "lavanda" | "pessego";

export type EventoAgenda = {
  consulta: Consulta;
  diaIso: string;
  inicioMin: number; // minutos do dia (fuso da clínica)
  fimMin: number;
  tom: TomEvento;
  /** Concluída, falta ou aguardando reagendamento: já não é um compromisso ativo. */
  passada: boolean;
};

export const NOMES_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const LETRAS_SEMANA = ["S", "T", "Q", "Q", "S", "S", "D"]; // começa na segunda
export const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

/** Dia (fuso da clínica) que contém o instante. */
export function diaDe(ts: number): DiaAgenda {
  const p = partesFusoClinica(ts);
  return {
    ano: p.ano,
    mes: p.mes,
    dia: p.dia,
    iso: iso(p.ano, p.mes, p.dia),
    semana: new Date(Date.UTC(p.ano, p.mes, p.dia)).getUTCDay(),
    inicio: instanteFusoClinica(p.ano, p.mes, p.dia),
  };
}

/** Dia a partir de ano/mês/dia de parede (aceita dia fora do mês: 0, 32…). */
export function diaDeParede(ano: number, mes: number, dia: number): DiaAgenda {
  const d = new Date(Date.UTC(ano, mes, dia));
  return diaDe(instanteFusoClinica(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
}

/** Os 7 dias (segunda a domingo) da semana do instante. */
export function semanaDe(ts: number): DiaAgenda[] {
  const d = diaDe(ts);
  const desdeSegunda = (d.semana + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => diaDeParede(d.ano, d.mes, d.dia - desdeSegunda + i));
}

/** Grade do mini calendário: semanas (segunda a domingo) que cobrem o mês. */
export function gradeMes(ano: number, mes: number): DiaAgenda[][] {
  const primeiro = diaDeParede(ano, mes, 1);
  const semanas: DiaAgenda[][] = [];
  let ref = semanaDe(primeiro.inicio + 12 * 3_600_000);
  while (semanas.length < 6) {
    semanas.push(ref);
    const prox = diaDeParede(ref[6].ano, ref[6].mes, ref[6].dia + 1);
    if (prox.mes !== mes && semanas.length >= 4) break;
    ref = semanaDe(prox.inicio + 12 * 3_600_000);
  }
  return semanas;
}

export function tomDoEvento(c: Consulta): TomEvento {
  if (c.tipoAtendimento === "renovacao") return "pessego";
  if (c.tipoAtendimento === "retorno" || c.tipoAtendimento === "segunda_opiniao") return "lavanda";
  return "azul";
}

/** Consultas → eventos posicionados. Canceladas ficam de fora (opção `comCanceladas`). */
export function eventosAgenda(consultas: Consulta[], comCanceladas = false): EventoAgenda[] {
  const out: EventoAgenda[] = [];
  for (const c of consultas) {
    if (!Number.isFinite(c.ts)) continue;
    if (c.status === "cancelada" && !comCanceladas) continue;
    const p = partesFusoClinica(c.ts);
    const inicioMin = p.hora * 60 + p.minuto;
    out.push({
      consulta: c,
      diaIso: iso(p.ano, p.mes, p.dia),
      inicioMin,
      // Mesma duração que o servidor conta para cada consulta; nunca passa de 23:00 na grade.
      fimMin: Math.min(inicioMin + DURACAO_CONSULTA_SERVIDOR, Math.max(inicioMin + 15, VEDADO_INICIO_MIN)),
      tom: tomDoEvento(c),
      passada: c.status === "concluida" || c.status === "falta_paciente" || c.status === "aguardando_reagendamento" || c.status === "cancelada",
    });
  }
  return out.sort((a, b) => a.consulta.ts - b.consulta.ts);
}

/**
 * Horas mostradas na grade: 7h–19h como a ref., ampliadas para caber as
 * consultas reais, mas nunca além de 23:00 (sem a faixa 23:00–00:00).
 */
export function faixaHoras(eventos: EventoAgenda[]): { inicio: number; fim: number } {
  let inicio = 7;
  let fim = 19;
  for (const e of eventos) {
    inicio = Math.min(inicio, Math.floor(e.inicioMin / 60));
    fim = Math.max(fim, Math.ceil(e.fimMin / 60));
  }
  return { inicio: Math.max(0, inicio), fim: Math.min(VEDADO_INICIO_MIN / 60, fim) };
}

/** Eventos que se sobrepõem no mesmo dia ganham colunas lado a lado. */
export function colunasSobrepostas(eventos: EventoAgenda[]): Map<EventoAgenda, { col: number; de: number }> {
  const mapa = new Map<EventoAgenda, { col: number; de: number }>();
  let grupo: EventoAgenda[] = [];
  let fimGrupo = -1;
  const fechar = () => {
    const fins: number[] = [];
    const cols = new Map<EventoAgenda, number>();
    for (const e of grupo) {
      let k = fins.findIndex((f) => f <= e.inicioMin);
      if (k < 0) k = fins.length;
      fins[k] = e.fimMin;
      cols.set(e, k);
    }
    for (const e of grupo) mapa.set(e, { col: cols.get(e) ?? 0, de: Math.max(1, fins.length) });
    grupo = [];
  };
  for (const e of [...eventos].sort((a, b) => a.inicioMin - b.inicioMin)) {
    if (grupo.length && e.inicioMin >= fimGrupo) fechar();
    grupo.push(e);
    fimGrupo = Math.max(fimGrupo, e.fimMin);
  }
  if (grupo.length) fechar();
  return mapa;
}

export const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const proximoDia = (d: DiaAgenda, n: number) => diaDeParede(d.ano, d.mes, d.dia + n);
export { DIA_MS };

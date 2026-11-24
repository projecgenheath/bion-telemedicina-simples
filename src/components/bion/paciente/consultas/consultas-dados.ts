/**
 * Derivações da etapa 2 do redesign do paciente (consultas e agendamento).
 * Módulo puro: recebe o que o app já tem (dados reais do estado) e devolve o
 * que as telas mostram. Testes em consultas-dados.teste.ts.
 */
import type { Consulta } from "@/lib/bion-tipos";
import { rotuloHistorico } from "../etiqueta-consulta";

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const LETRAS_SEMANA = ["S", "T", "Q", "Q", "S", "S", "D"];
export const NOMES_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export type DiaCalendario = { iso: string; dia: number; mes: number; ano: number; semana: number };

const partes = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return { a: a || 1970, m: (m || 1) - 1, d: d || 1 };
};
const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (iso: string) => {
  const p = partes(iso);
  return Date.UTC(p.a, p.m, p.d);
};
const DIA = 86_400_000;

/**
 * Semanas (segunda a domingo) do minicalendário de agendamento: da semana de
 * `hojeIso` até a semana do último dia com horário. Como o minicalendário da
 * agenda do médico, mas só com o intervalo em que dá para marcar (14 dias).
 */
export function semanasDoCalendario(hojeIso: string, ultimoIso: string): DiaCalendario[][] {
  const ini = utc(hojeIso);
  const fim = Math.max(ini, utc(ultimoIso));
  const dsIni = (new Date(ini).getUTCDay() + 6) % 7;
  const dsFim = (new Date(fim).getUTCDay() + 6) % 7;
  const primeiro = ini - dsIni * DIA;
  const ultimo = fim + (6 - dsFim) * DIA;
  const semanas: DiaCalendario[][] = [];
  for (let t = primeiro; t <= ultimo; t += 7 * DIA) {
    const sem: DiaCalendario[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(t + i * DIA);
      sem.push({ iso: isoDe(t + i * DIA), dia: d.getUTCDate(), mes: d.getUTCMonth(), ano: d.getUTCFullYear(), semana: i });
    }
    semanas.push(sem);
  }
  return semanas;
}

/** "Novembro, 2026" ou "Novembro – Dezembro, 2026" (ou anos diferentes). */
export function tituloMeses(semanas: DiaCalendario[][]): { mes: string; ano: string } {
  const dias = semanas.flat();
  if (!dias.length) return { mes: "", ano: "" };
  const a = dias[0]!;
  const b = dias[dias.length - 1]!;
  if (a.ano !== b.ano) return { mes: `${NOMES_MES[a.mes]} ${a.ano} – ${NOMES_MES[b.mes]}`, ano: String(b.ano) };
  if (a.mes !== b.mes) return { mes: `${NOMES_MES[a.mes]} – ${NOMES_MES[b.mes]}`, ano: String(a.ano) };
  return { mes: NOMES_MES[a.mes]!, ano: String(a.ano) };
}

/** "Quarta, 26 de novembro" para o leitor de tela. */
export function nomeDiaLongo(d: DiaCalendario): string {
  return `${NOMES_SEMANA[d.semana]}, ${d.dia} de ${NOMES_MES[d.mes]!.toLowerCase()}`;
}

export type GrupoHorarios = { periodo: "Manhã" | "Tarde" | "Noite"; horarios: string[] };

/** Horários livres em Manhã (< 12 h), Tarde (< 18 h) e Noite, sem grupos vazios. */
export function agruparHorarios(horarios: string[]): GrupoHorarios[] {
  const g: GrupoHorarios[] = [
    { periodo: "Manhã", horarios: [] },
    { periodo: "Tarde", horarios: [] },
    { periodo: "Noite", horarios: [] },
  ];
  for (const h of horarios) {
    const hh = Number(h.split(":")[0]);
    (hh < 12 ? g[0]! : hh < 18 ? g[1]! : g[2]!).horarios.push(h);
  }
  return g.filter((x) => x.horarios.length > 0);
}

/** Fim do horário ("10:00" + 30 → "10:30"), como os blocos da agenda do médico. */
export function fimDoHorario(h: string, duracaoMin: number): string {
  const [hh, mm] = h.split(":").map(Number);
  const t = ((hh || 0) * 60 + (mm || 0) + duracaoMin) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const ENCERRADAS = new Set(["concluida", "cancelada", "falta_paciente"]);

/** Consulta que abre em destaque: a próxima não encerrada; sem ela, a mais recente. */
export function consultaEmFoco(consultas: Consulta[], agora: number): Consulta | null {
  const futuras = consultas
    .filter((c) => !ENCERRADAS.has(c.status) && c.ts >= agora - 60 * 60_000)
    .sort((a, b) => a.ts - b.ts);
  if (futuras[0]) return futuras[0];
  return [...consultas].sort((a, b) => b.ts - a.ts)[0] ?? null;
}

/** Próximas (não encerradas), da mais perto para a mais longe. */
export function proximasConsultas(consultas: Consulta[], agora: number): Consulta[] {
  return consultas.filter((c) => !ENCERRADAS.has(c.status) && c.ts >= agora - 60 * 60_000).sort((a, b) => a.ts - b.ts);
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Busca por médico, especialidade ou situação (sem acento e sem caixa). */
export function filtrarConsultas(consultas: Consulta[], busca: string): Consulta[] {
  const q = normalizar(busca);
  if (!q) return consultas;
  return consultas.filter(
    (c) =>
      normalizar(c.medico).includes(q) ||
      normalizar(c.especialidade).includes(q) ||
      normalizar(rotuloHistorico(c.status, c.pago).texto).includes(q),
  );
}

/** Pode remarcar ou cancelar por aqui? Só consultas futuras ainda não encerradas. */
export function podeMexer(c: Consulta, agora: number): boolean {
  return !ENCERRADAS.has(c.status) && c.status !== "aguardando_reagendamento" && c.ts > agora;
}

/** "R$ 180,00" → "180,00" + "R$" (número grande e unidade pequena, como na ficha). */
export function partesValor(valor: string | undefined): { numero: string; moeda: string } | null {
  if (!valor) return null;
  const m = valor.match(/^\s*(R\$)\s*(.+)$/);
  if (!m) return { numero: valor.trim(), moeda: "" };
  return { numero: m[2]!.trim(), moeda: m[1]! };
}

/* ------------------ Agenda própria do paciente (rodada 2) ------------------ */

/** "10:30" → 630 minutos. */
export function minutosDoHorario(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

/**
 * Faixa de horas da grade (como a calha da agenda do médico): da hora cheia
 * do primeiro horário livre até a hora cheia depois do fim do último. Sem
 * horário, 08:00–18:00. Sempre pelo menos 4 horas.
 */
export function faixaDaGrade(horarios: string[], duracaoMin: number): { inicio: number; fim: number } {
  if (!horarios.length) return { inicio: 8, fim: 18 };
  const mins = horarios.map(minutosDoHorario);
  // Janela mínima de 10 h, como a grade 8–18 da agenda do médico: a grade preenche o cartão.
  let inicio = Math.floor(Math.min(...mins) / 60);
  const fim = Math.min(24, Math.max(inicio + 10, Math.ceil((Math.max(...mins) + duracaoMin) / 60)));
  inicio = Math.max(0, Math.min(inicio, fim - 10));
  return { inicio, fim };
}

/** Índice da semana (segunda a domingo) que contém o dia; -1 se nenhuma. */
export function semanaDoDia(semanas: DiaCalendario[][], iso: string): number {
  return semanas.findIndex((s) => s.some((d) => d.iso === iso));
}

/** Passo atual do agendamento pela agenda: 1 especialidade … 5 confirmar. */
export function passoDaAgenda(e: { especialidade?: string; medico?: string; diaIso?: string; hora?: string }): "especialidade" | "medico" | "dia" | "hora" | "confirmar" {
  if (!e.especialidade) return "especialidade";
  if (!e.medico) return "medico";
  if (!e.diaIso) return "dia";
  if (!e.hora) return "hora";
  return "confirmar";
}

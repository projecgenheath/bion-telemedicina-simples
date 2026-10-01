/**
 * Fuso da clínica (America/Sao_Paulo) no SERVIDOR.
 *
 * Correção (2026-09): o servidor (Vercel) roda em UTC. `parseDataHora` montava
 * a data com setHours() no fuso do processo, então "14:00" virava 14:00Z
 * (11:00 em Brasília) e o navegador mostrava 3 h a menos. Do mesmo jeito, os
 * textos formatados no servidor (toLocale* sem timeZone) só pareciam certos
 * porque formatavam em UTC um instante que já estava errado.
 *
 * Regra: o banco guarda o INSTANTE real (UTC). Data e hora digitadas pelo
 * usuário são horário de parede de São Paulo, e textos para humanos são
 * formatados em São Paulo. Usa só Intl (ICU do Node), sem dependências. O
 * offset é calculado pelo próprio Intl, então funciona mesmo se o horário de
 * verão voltar (hoje é UTC-3 fixo, desde 2019).
 */
export const FUSO_CLINICA = "America/Sao_Paulo";

const fmtPartes = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_CLINICA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type PartesData = {
  ano: number;
  mes: number; // 1–12
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

/** Componentes de calendário/relógio de `instante` em São Paulo. */
export function partesNoFuso(instante: Date): PartesData {
  const p = fmtPartes.formatToParts(instante);
  const g = (t: Intl.DateTimeFormatPartTypes) => Number(p.find((x) => x.type === t)?.value ?? "0");
  return {
    ano: g("year"),
    mes: g("month"),
    dia: g("day"),
    hora: g("hour") % 24,
    minuto: g("minute"),
    segundo: g("second"),
  };
}

/** Offset (ms) de São Paulo em relação a UTC no instante dado (ex.: -3 h). */
function offsetMs(instante: number): number {
  const p = partesNoFuso(new Date(instante));
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - (instante - (((instante % 1000) + 1000) % 1000));
}

/**
 * Instante real correspondente ao horário de parede de São Paulo.
 * Componentes fora da faixa são normalizados como em Date.UTC (ex.: dia 32).
 * Exemplo: (2026, 10, 1, 14, 0) → 2026-10-01T17:00:00.000Z.
 */
export function instanteNoFuso(ano: number, mes: number, dia: number, hora = 0, minuto = 0): Date {
  const parede = Date.UTC(ano, mes - 1, dia, hora, minuto, 0, 0);
  let t = parede - offsetMs(parede);
  const o2 = offsetMs(t);
  if (parede - o2 !== t) t = parede - o2; // borda de transição de horário de verão
  return new Date(t);
}

/** "01/10/2026" (ou com opções próprias), em São Paulo. */
export function fmtDataClinica(d: Date, opcoes: Intl.DateTimeFormatOptions = {}): string {
  return d.toLocaleDateString("pt-BR", { ...opcoes, timeZone: FUSO_CLINICA });
}

/** "14:00", em São Paulo. */
export function fmtHoraClinica(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO_CLINICA });
}

/** "01/10/2026 às 14:00", em São Paulo (mesmo formato dos textos antigos). */
export function quandoClinica(d: Date, opcoesData: Intl.DateTimeFormatOptions = {}): string {
  return `${fmtDataClinica(d, opcoesData)} às ${fmtHoraClinica(d)}`;
}

/** "AAAA-MM-DD" do dia de `instante` em São Paulo (não o dia em UTC). */
export function dataIsoClinica(instante: Date = new Date()): string {
  const p = partesNoFuso(instante);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

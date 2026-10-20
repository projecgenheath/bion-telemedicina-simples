/**
 * Dias úteis no calendário de São Paulo (regra do Alisson, 20/10/2026).
 *
 * Prazo para o paciente escolher (remarcar ou reembolso integral) depois de
 * uma correção do desfecho pelo admin: 7 dias úteis, contados a partir do dia
 * SEGUINTE ao da correção. Dia útil = segunda a sexta, menos os feriados
 * nacionais (fixos e móveis, ver `ehFeriadoNacional`). Feriados estaduais e
 * municipais não entram. O prazo termina
 * no fim (23:59:59.999, horário de Brasília) do último dia útil.
 *
 * PURO: só Intl (via fuso.ts), sem banco.
 */
import { instanteNoFuso, partesNoFuso } from "@/lib/server/fuso";

/** 0 = domingo … 6 = sábado, para uma data de calendário (ano, mês 1–12, dia). */
function diaDaSemana(ano: number, mes: number, dia: number): number {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Feriados nacionais fixos (mês, dia). 20/11 é nacional desde 2024 (Lei 14.759/2023). */
const FIXOS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [12, 25],
];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

/** Datas (AAAA-MM-DD) dos feriados móveis: Carnaval (seg e ter), Sexta-feira Santa e Corpus Christi. */
function moveis(ano: number): string[] {
  const p = pascoa(ano);
  const base = Date.UTC(ano, p.mes - 1, p.dia);
  return [-48, -47, -2, 60].map((off) => new Date(base + off * 86_400_000).toISOString().slice(0, 10));
}

const chave = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

/** Feriado nacional numa data de calendário de São Paulo (ano, mês 1–12, dia). */
export function ehFeriadoNacional(ano: number, mes: number, dia: number): boolean {
  if (FIXOS.some(([m, d]) => m === mes && d === dia)) return true;
  if (mes === 11 && dia === 20 && ano >= 2024) return true;
  return moveis(ano).includes(chave(ano, mes, dia));
}

/** Segunda a sexta, menos feriados nacionais. */
export function ehDiaUtil(ano: number, mes: number, dia: number): boolean {
  const s = diaDaSemana(ano, mes, dia);
  return s >= 1 && s <= 5 && !ehFeriadoNacional(ano, mes, dia);
}

/**
 * Fim do `dias`-ésimo dia útil contado a partir do dia seguinte a `inicio`
 * (no calendário de São Paulo).
 */
export function fimDoPrazoEmDiasUteis(inicio: Date, dias: number): Date {
  const p = partesNoFuso(inicio);
  // Date.UTC normaliza dia 32 etc.; usamos só o calendário.
  const cursor = new Date(Date.UTC(p.ano, p.mes - 1, p.dia));
  let contados = 0;
  while (contados < dias) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (ehDiaUtil(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate())) contados++;
  }
  // Início do dia seguinte ao último dia útil, menos 1 ms.
  const seguinte = instanteNoFuso(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate() + 1, 0, 0);
  return new Date(seguinte.getTime() - 1);
}

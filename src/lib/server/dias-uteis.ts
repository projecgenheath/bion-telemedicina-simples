/**
 * Dias úteis no calendário de São Paulo (regra do Alisson, 20/10/2026).
 *
 * Prazo para o paciente escolher (remarcar ou reembolso integral) depois de
 * uma correção do desfecho pelo admin: 7 dias úteis, contados a partir do dia
 * SEGUINTE ao da correção. Dia útil = segunda a sexta (o repo não tem
 * calendário de feriados; quando tiver, entra em `ehDiaUtil`). O prazo termina
 * no fim (23:59:59.999, horário de Brasília) do último dia útil.
 *
 * PURO: só Intl (via fuso.ts), sem banco.
 */
import { instanteNoFuso, partesNoFuso } from "@/lib/server/fuso";

/** 0 = domingo … 6 = sábado, para uma data de calendário (ano, mês 1–12, dia). */
function diaDaSemana(ano: number, mes: number, dia: number): number {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Segunda a sexta. */
export function ehDiaUtil(ano: number, mes: number, dia: number): boolean {
  const s = diaDaSemana(ano, mes, dia);
  return s >= 1 && s <= 5;
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

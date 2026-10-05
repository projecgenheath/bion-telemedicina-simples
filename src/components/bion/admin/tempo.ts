/**
 * Datas e valores do admin SEMPRE no fuso da clínica (America/Sao_Paulo),
 * independentemente do fuso do navegador. Funções puras: o "agora" entra
 * como parâmetro para ser testável (ver admin.teste.ts).
 * Reusa FUSO_CLINICA / partesFusoClinica / instanteFusoClinica de
 * bion-tipos (só importação).
 */
import { FUSO_CLINICA, instanteFusoClinica, partesFusoClinica } from "@/lib/bion-tipos";

const D = 86_400_000;
const dd = (n: number) => String(n).padStart(2, "0");
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const valido = (t: number) => Number.isFinite(t);

/** Chave AAAA-MM-DD do dia do instante no fuso da clínica. */
export function chaveDia(ts: number): string {
  if (!valido(ts)) return "";
  const p = partesFusoClinica(ts);
  return `${p.ano}-${dd(p.mes + 1)}-${dd(p.dia)}`;
}

/** Início (00:00) e fim exclusivo (00:00 do dia seguinte) do dia do instante, no fuso da clínica. */
export function limitesDia(ts: number): { inicio: number; fim: number } {
  const p = partesFusoClinica(ts);
  const inicio = instanteFusoClinica(p.ano, p.mes, p.dia, 0, 0);
  const amanha = partesFusoClinica(instanteFusoClinica(p.ano, p.mes, p.dia, 12) + D);
  return { inicio, fim: instanteFusoClinica(amanha.ano, amanha.mes, amanha.dia, 0, 0) };
}

export function mesmoDia(a: number, b: number): boolean {
  return valido(a) && valido(b) && chaveDia(a) === chaveDia(b);
}

/** Diferença em dias de calendário (fuso da clínica) entre o dia de `ts` e o de `agora`. */
export function diasDeDiferenca(ts: number, agora: number): number {
  const a = chaveDia(ts).split("-").map(Number);
  const b = chaveDia(agora).split("-").map(Number);
  return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / D);
}

/** "Hoje", "Amanhã", "Ontem" ou "seg, 06/10" (com o ano quando for outro ano). */
export function rotuloDia(ts: number, agora: number): string {
  if (!valido(ts)) return "—";
  const n = diasDeDiferenca(ts, agora);
  if (n === 0) return "Hoje";
  if (n === 1) return "Amanhã";
  if (n === -1) return "Ontem";
  const p = partesFusoClinica(ts);
  const semana = SEMANA[new Date(Date.UTC(p.ano, p.mes, p.dia)).getUTCDay()];
  const ano = p.ano !== partesFusoClinica(agora).ano ? `/${p.ano}` : "";
  return `${semana}, ${dd(p.dia)}/${dd(p.mes + 1)}${ano}`;
}

/** "14:30" no fuso da clínica. */
export function hora(ts: number): string {
  if (!valido(ts)) return "—";
  const p = partesFusoClinica(ts);
  return `${dd(p.hora)}:${dd(p.minuto)}`;
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias", "em 20 min", "em 1 h"… */
export function relativo(ts: number, agora: number): string {
  if (!valido(ts)) return "—";
  const diff = ts - agora;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  let txt: string;
  if (min < 1) return "agora";
  if (min < 60) txt = `${min} min`;
  else if (min < 60 * 24) txt = `${Math.round(min / 60)} h`;
  else {
    const dias = Math.round(min / (60 * 24));
    txt = `${dias} ${dias === 1 ? "dia" : "dias"}`;
  }
  return diff < 0 ? `há ${txt}` : `em ${txt}`;
}

/** Competência "AAAA-MM-DD" → "03/10" (ou "03/10/2025" quando de outro ano). */
export function competenciaCurta(competencia: string, agora: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(competencia);
  if (!m) return competencia || "—";
  const ano = Number(m[1]) !== partesFusoClinica(agora).ano ? `/${m[1]}` : "";
  return `${m[3]}/${m[2]}${ano}`;
}

/** Data longa para cabeçalhos: "domingo, 4 de outubro". */
export function dataLonga(ts: number): string {
  if (!valido(ts)) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_CLINICA, weekday: "long", day: "numeric", month: "long" }).format(ts);
}

/** Saudação pela hora do fuso da clínica. */
export function saudacao(agora: number): string {
  const h = partesFusoClinica(agora).hora;
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos inteiros → "R$ 1.234,56" (o financeiro do servidor trabalha em centavos). */
export function brl(centavos: number): string {
  if (!Number.isFinite(centavos)) return "—";
  return fmtBRL.format(Math.round(centavos) / 100);
}

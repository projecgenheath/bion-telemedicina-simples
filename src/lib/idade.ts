/**
 * Data de nascimento do paciente → idade (M4, auditoria do perfil do paciente).
 *
 * - A data é um DIA DE CALENDÁRIO ("YYYY-MM-DD"; coluna Postgres DATE,
 *   `PerfilPaciente.dataNascimento`). Nunca passa por fuso: no servidor o
 *   Prisma devolve DATE como Date à meia-noite UTC e lemos só as partes UTC.
 * - "Hoje" é o dia corrente em America/Sao_Paulo (Intl com timeZone), não o
 *   fuso do navegador nem do servidor (a Vercel roda em UTC).
 * - Nascido em 29/02: em ano não bissexto faz aniversário em 01/03.
 *
 * Arquivo puro e isomórfico (servidor e cliente).
 */

export const FUSO_IDADE = "America/Sao_Paulo";
export const IDADE_MAXIMA = 130;

export type DataCalendario = { ano: number; mes: number; dia: number };

/** Campo extra do perfil no payload (o tipo PacientePerfil fica intacto). */
export type ComDataNascimento = { dataNascimento?: string | null };

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" → partes, ou null se o formato ou a data de calendário for inválida. */
export function lerDataIso(iso: unknown): DataCalendario | null {
  if (typeof iso !== "string") return null;
  const m = RE_ISO.exec(iso.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1) return null;
  const t = new Date(Date.UTC(ano, mes - 1, dia));
  // Date.UTC trata anos 0–99 como 1900+; o round-trip pega 31/02 etc.
  if (t.getUTCFullYear() !== ano || t.getUTCMonth() !== mes - 1 || t.getUTCDate() !== dia) return null;
  return { ano, mes, dia };
}

/** Dia corrente em America/Sao_Paulo. */
export function hojeEmSaoPaulo(agora: Date = new Date()): DataCalendario {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_IDADE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const p = (t: string) => Number(partes.find((x) => x.type === t)?.value);
  return { ano: p("year"), mes: p("month"), dia: p("day") };
}

/**
 * Idade completa em anos hoje (America/Sao_Paulo). null se a data for
 * inválida ou estiver no futuro.
 */
export function idadeDeNascimento(iso: string, agora: Date = new Date()): number | null {
  const n = lerDataIso(iso);
  if (!n) return null;
  const h = hojeEmSaoPaulo(agora);
  const chave = (d: DataCalendario) => d.ano * 10_000 + d.mes * 100 + d.dia;
  if (chave(n) > chave(h)) return null;
  let idade = h.ano - n.ano;
  if (h.mes * 100 + h.dia < n.mes * 100 + n.dia) idade--;
  return idade;
}

/** Hoje em America/Sao_Paulo como "YYYY-MM-DD" (ex.: `max` do input de data). */
export function hojeIsoSaoPaulo(agora: Date = new Date()): string {
  const h = hojeEmSaoPaulo(agora);
  return `${String(h.ano).padStart(4, "0")}-${String(h.mes).padStart(2, "0")}-${String(h.dia).padStart(2, "0")}`;
}

/** DATE do Prisma (meia-noite UTC) → "YYYY-MM-DD" pelas partes UTC; null se vazio. */
export function dataNascimentoParaIso(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → Date à meia-noite UTC (o que o Prisma grava numa coluna DATE). */
export function isoParaDataNascimento(iso: string): Date | null {
  const n = lerDataIso(iso);
  return n ? new Date(Date.UTC(n.ano, n.mes - 1, n.dia)) : null;
}

/** "YYYY-MM-DD" → "DD/MM/AAAA"; "" se inválida. */
export function formatarDataNascimento(iso: string | null | undefined): string {
  const n = lerDataIso(iso);
  if (!n) return "";
  return `${String(n.dia).padStart(2, "0")}/${String(n.mes).padStart(2, "0")}/${String(n.ano).padStart(4, "0")}`;
}

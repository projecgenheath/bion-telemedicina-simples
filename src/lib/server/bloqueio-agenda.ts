/**
 * Bloqueio de dia inteiro na agenda do médico (folga/férias) — regras e
 * cálculo de datas, sem dependências de rota.
 *
 * Datas:
 * - O bloqueio é um DIA CIVIL em America/Sao_Paulo ("AAAA-MM-DD"), gravado
 *   em BloqueioAgenda.dia (coluna DATE). O Prisma lê/grava DATE como
 *   meia-noite UTC daquele dia: "2026-10-01" ⇄ new Date("2026-10-01T00:00:00Z").
 * - Uma consulta/remarcação (instante real, UTC) cai no dia de São Paulo
 *   calculado por `partesNoFuso` — ex.: 22:00 de 01/10 em São Paulo
 *   (2026-10-02T01:00Z) é o dia "2026-10-01".
 * - NUNCA comparar `dia` com o início do dia em São Paulo em UTC
 *   (03:00Z): DATE é meia-noite UTC.
 *
 * Este arquivo NÃO importa financeiro.ts (financeiro.ts importa daqui).
 * Sem "server-only" e sem acesso direto ao banco (o cliente Prisma chega por
 * parâmetro), para ser testável com `bun scripts/teste_bloqueio_agenda.ts`.
 */

import type { Prisma } from "@prisma/client";
import type { db } from "@/lib/db";
import { instanteNoFuso, partesNoFuso } from "@/lib/server/fuso";

/** Mensagem única (409) para agendar/remarcar/mover consulta para um dia bloqueado. */
export const ERRO_DIA_BLOQUEADO = "O médico não atende neste dia.";
/** O médico bloqueia de hoje até hoje + 365 dias (São Paulo). */
export const HORIZONTE_BLOQUEIO_DIAS = 365;
/** Teto de bloqueios FUTUROS (hoje em diante) por médico. */
export const MAX_BLOQUEIOS_FUTUROS = 120;
/** Janela da lista pública (pacientes): hoje até hoje + 60 dias. */
export const JANELA_PUBLICA_DIAS = 60;
export const MOTIVO_MAX = 120;

export type ClienteBanco = Prisma.TransactionClient | typeof db;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_CONTROLE = /[\u0000-\u001F\u007F]/g;

/** Dia civil (AAAA-MM-DD) de um instante em São Paulo. */
export function diaIsoSaoPaulo(instante: Date): string {
  const p = partesNoFuso(instante);
  return `${String(p.ano).padStart(4, "0")}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/** "AAAA-MM-DD" → valor da coluna DATE como o Prisma usa (meia-noite UTC). */
export function diaParaDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Valor DATE do Prisma (meia-noite UTC) → "AAAA-MM-DD" (partes UTC). */
export function dateParaDiaIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Soma `n` dias de calendário a "AAAA-MM-DD" (sem fuso: aritmética de datas). */
export function somarDiasIso(iso: string, n: number): string {
  const d = diaParaDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return dateParaDiaIso(d);
}

/** Hoje em São Paulo ("AAAA-MM-DD"). */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return diaIsoSaoPaulo(agora);
}

/**
 * Valida o dia de um bloqueio/desbloqueio, como em cancelar-dia: formato
 * "AAAA-MM-DD", data real do calendário (meio-dia em São Paulo, longe das
 * bordas do dia), de hoje (São Paulo) em diante e — se `horizonte` — até
 * hoje + HORIZONTE_BLOQUEIO_DIAS. Devolve o dia e o meio-dia dele em São Paulo.
 */
export function validarDiaBloqueio(
  v: unknown,
  agora: Date = new Date(),
  opcoes: { horizonte?: boolean } = {},
): Resultado<{ dia: string; meioDia: Date }> {
  const m = typeof v === "string" ? RE_DIA.exec(v.trim()) : null;
  if (!m) return { ok: false, erro: "Informe o dia no formato AAAA-MM-DD." };
  const [ano, mes, diaMes] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dia = `${m[1]}-${m[2]}-${m[3]}`;
  const meioDia = instanteNoFuso(ano, mes, diaMes, 12, 0);
  if (diaIsoSaoPaulo(meioDia) !== dia) return { ok: false, erro: "Data inválida." };
  const hoje = hojeSaoPaulo(agora);
  if (dia < hoje) return { ok: false, erro: "Não dá para bloquear ou desbloquear um dia que já passou." };
  if (opcoes.horizonte !== false && dia > somarDiasIso(hoje, HORIZONTE_BLOQUEIO_DIAS)) {
    return { ok: false, erro: `Bloqueie no máximo ${HORIZONTE_BLOQUEIO_DIAS} dias à frente.` };
  }
  return { ok: true, valor: { dia, meioDia } };
}

/** Motivo opcional: sem caracteres de controle, espaços normalizados, ≤ MOTIVO_MAX. */
export function limparMotivo(v: unknown): Resultado<string> {
  if (v === undefined || v === null) return { ok: true, valor: "" };
  if (typeof v !== "string") return { ok: false, erro: "Motivo deve ser um texto." };
  const s = v.replace(RE_CONTROLE, " ").replace(/\s+/g, " ").trim();
  if (s.length > MOTIVO_MAX) return { ok: false, erro: `Motivo: no máximo ${MOTIVO_MAX} caracteres.` };
  return { ok: true, valor: s };
}

/**
 * O dia de São Paulo do instante `dataInicio` está bloqueado para o médico?
 * Use o `tx` da transação quando houver (ex.: aprovação de multa).
 */
export async function diaBloqueado(client: ClienteBanco, medicoId: string, dataInicio: Date): Promise<boolean> {
  const r = await client.bloqueioAgenda.findUnique({
    where: { medicoId_dia: { medicoId, dia: diaParaDate(diaIsoSaoPaulo(dataInicio)) } },
    select: { id: true },
  });
  return !!r;
}

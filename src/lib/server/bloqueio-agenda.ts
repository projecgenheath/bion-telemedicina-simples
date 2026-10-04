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
 * Concorrência: agendar (POST /api/consultas) e bloquear o dia
 * (POST /api/medico/agenda/bloqueios) tomam a MESMA trava transacional por
 * (médico, dia de São Paulo) — `travarDiaDoMedico`, pg_advisory_xact_lock —
 * e fazem checagem + escrita dentro dessa transação. Assim um agendamento
 * que passou pela checagem não termina depois do bloqueio/cancelamentos:
 * ou ele entra antes (e o bloqueio o vê e cancela/pede confirmação), ou
 * espera o bloqueio terminar (e recebe 409).
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

/* ------------------------------------------------------------------ */
/* Horário vedado: sem teleconsulta entre 23:00 e 00:00 (São Paulo)     */
/* ------------------------------------------------------------------ */

/** Mensagem única (409) para agendar/remarcar/mover consulta para 23:00–00:00. */
export const ERRO_HORARIO_VEDADO = "Não há atendimento entre 23:00 e 00:00.";
/** Início da janela vedada, em minutos desde a meia-noite de São Paulo (23:00). */
export const VEDADO_INICIO_MIN = 23 * 60;
/** Fim (exclusivo) da janela vedada: meia-noite do dia seguinte (00:00). */
export const VEDADO_FIM_MIN = 24 * 60;
/**
 * Duração considerada no servidor para uma consulta. A Consulta não tem
 * dataFim nem duração no banco (presenca-consulta.ts: "Não existe duração de
 * consulta gravada no banco"); a duração da grade é um parâmetro só do
 * aparelho do médico (AgendaSheet, padrão 30 min em `sugerirParametros`).
 * Então o fim real usado aqui é início + 30 min: 22:30 termina 23:00 e pode;
 * 22:31 invadiria a janela e é recusado.
 */
export const DURACAO_CONSULTA_MIN = 30;

/** Fim considerado da consulta que começa em `inicio`. */
export function fimDaConsulta(inicio: Date, duracaoMin: number = DURACAO_CONSULTA_MIN): Date {
  return new Date(inicio.getTime() + duracaoMin * 60_000);
}

/**
 * O intervalo [inicio, fim) encosta em 23:00–00:00 de São Paulo em algum
 * dia? Pura (sem banco), independe do fuso do processo. Atravessar a
 * meia-noite ou vários dias funciona: confere a janela do dia (São Paulo) de
 * `inicio` e as seguintes até passar de `fim`. Intervalo vazio (fim ≤
 * inicio) vale como o instante `inicio`. Data inválida → false (as rotas já
 * recusam data inválida antes).
 */
export function horarioVedado(inicio: Date, fim: Date): boolean {
  const a = inicio.getTime();
  let b = fim.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (b <= a) b = a + 1;
  const p = partesNoFuso(inicio);
  for (let d = 0; ; d++) {
    const ini = instanteNoFuso(p.ano, p.mes, p.dia + d, 23, 0).getTime();
    const fimJanela = instanteNoFuso(p.ano, p.mes, p.dia + d + 1, 0, 0).getTime();
    if (ini >= b) return false;
    if (a < fimJanela && b > ini) return true;
  }
}

/** A consulta que começa em `inicio` (duração DURACAO_CONSULTA_MIN) cai em 23:00–00:00? */
export function consultaEmHorarioVedado(inicio: Date): boolean {
  return horarioVedado(inicio, fimDaConsulta(inicio));
}

/**
 * Horário da grade ("HH:MM", São Paulo) cuja consulta de `duracaoMin`
 * encosta em 23:00–00:00. São Paulo não tem horário de verão (UTC-3 fixo),
 * então dá para fazer em minutos do dia. Formato inválido → false (a rota
 * valida o formato à parte).
 */
export function slotVedado(hora: string, duracaoMin: number = DURACAO_CONSULTA_MIN): boolean {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora);
  if (!m) return false;
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = a + Math.max(1, duracaoMin);
  for (let k = 0; VEDADO_INICIO_MIN + k * 1440 < b; k++) {
    if (a < VEDADO_FIM_MIN + k * 1440 && b > VEDADO_INICIO_MIN + k * 1440) return true;
  }
  return false;
}

/** Horários da grade que encostam em 23:00–00:00 (vazio = grade aceita). */
export function horariosVedadosDaGrade(horarios: unknown): string[] {
  if (!Array.isArray(horarios)) return [];
  return horarios.filter((h): h is string => typeof h === "string" && slotVedado(h));
}

/** Mensagem (400) para grade com horários vedados. */
export function erroGradeVedada(vedados: string[]): string {
  return (
    `Não há atendimento entre 23:00 e 00:00. Cada consulta conta ${DURACAO_CONSULTA_MIN} min e precisa terminar até 23:00 — ` +
    `remova: ${vedados.join(", ")}.`
  );
}

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

/* ------------------------------------------------------------------ */
/* Trava por (médico, dia) — serializa agendar × bloquear o mesmo dia  */
/* ------------------------------------------------------------------ */

/** Chave da trava: "medicoId:AAAA-MM-DD" (dia de São Paulo). */
export function chaveTravaDia(medicoId: string, diaIso: string): string {
  return `${medicoId}:${diaIso}`;
}

/**
 * Trava transacional por (médico, dia de São Paulo do instante):
 * `pg_advisory_xact_lock(hashtext(chave))`. Espera quem estiver com a trava e
 * só a libera no COMMIT/ROLLBACK — chame no início da transação, antes de
 * ler/escrever. Funciona no Transaction Pooler (a transação interativa fica
 * na mesma conexão do começo ao fim). Devolve o dia ("AAAA-MM-DD").
 */
export async function travarDiaDoMedico(tx: Prisma.TransactionClient, medicoId: string, instante: Date): Promise<string> {
  const dia = diaIsoSaoPaulo(instante);
  await travarDiaIso(tx, medicoId, dia);
  return dia;
}

/** Mesma trava, a partir do dia "AAAA-MM-DD" já validado. */
export async function travarDiaIso(tx: Prisma.TransactionClient, medicoId: string, diaIso: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chaveTravaDia(medicoId, diaIso)}::text))`;
}

/** Opções das transações que tomam a trava (espera pela trava conta no timeout). */
export const OPCOES_TX_TRAVA = { maxWait: 10_000, timeout: 20_000 } as const;

/**
 * Agendamento atômico: trava o dia → confere o bloqueio e a janela vedada
 * (23:00–00:00) → `criar(tx)`, tudo na transação `tx`. Recusado →
 * `{ bloqueado: true, erro }` (ERRO_DIA_BLOQUEADO ou ERRO_HORARIO_VEDADO) e
 * nada é criado.
 */
export async function criarSeDiaLivre<T>(
  tx: Prisma.TransactionClient,
  medicoId: string,
  dataInicio: Date,
  criar: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ bloqueado: true; erro: string } | { bloqueado: false; valor: T }> {
  await travarDiaDoMedico(tx, medicoId, dataInicio);
  if (consultaEmHorarioVedado(dataInicio)) return { bloqueado: true, erro: ERRO_HORARIO_VEDADO };
  if (await diaBloqueado(tx, medicoId, dataInicio)) return { bloqueado: true, erro: ERRO_DIA_BLOQUEADO };
  return { bloqueado: false, valor: await criar(tx) };
}

export type AfetadosDoDia = { consultas: number; reservas: number };

/** Operações do cancelamento do dia (implementadas em agenda-dia.ts, que pode usar financeiro.ts). */
export type OperacoesBloqueio<R> = {
  contar: (tx: Prisma.TransactionClient) => Promise<AfetadosDoDia>;
  cancelar: (tx: Prisma.TransactionClient) => Promise<R>;
};

export type ResultadoBloqueio<R> =
  | { tipo: "limite" }
  | { tipo: "confirmar"; consultas: number; reservas: number }
  | {
      tipo: "ok";
      bloqueio: { dia: Date; motivo: string; criadoEm: Date };
      /** null = nada a cancelar. */
      cancelamento: R | null;
      /** Apareceu consulta/reserva entre a contagem e o bloqueio (sem cancelarConsultas): foi cancelada. */
      apareceuDepois: boolean;
    };

/**
 * Bloqueio do dia, numa transação com a trava do dia:
 * 1. trava (médico, dia) — agendamentos do mesmo dia esperam;
 * 2. teto de bloqueios futuros (só se o dia ainda não está bloqueado);
 * 3. conta consultas/reservas; se houver e não veio `cancelarConsultas` →
 *    `confirmar` (nada é gravado);
 * 4. grava o bloqueio (upsert idempotente);
 * 5. sem `cancelarConsultas`, RECONTA: algo que entrou por um caminho sem a
 *    trava (ex.: remarcação) entre a contagem e o bloqueio é cancelado do
 *    mesmo jeito; com `cancelarConsultas`, cancela o que houver.
 * Tudo ou nada: se o cancelamento falhar, o bloqueio também é desfeito.
 */
export async function bloquearDiaTravado<R>(
  tx: Prisma.TransactionClient,
  p: { medicoId: string; dia: string; motivo: string; cancelarConsultas: boolean; agora: Date },
  ops: OperacoesBloqueio<R>,
): Promise<ResultadoBloqueio<R>> {
  await travarDiaIso(tx, p.medicoId, p.dia);
  const diaDate = diaParaDate(p.dia);
  const chave = { medicoId_dia: { medicoId: p.medicoId, dia: diaDate } };

  const existente = await tx.bloqueioAgenda.findUnique({ where: chave, select: { id: true } });
  if (!existente) {
    const futuros = await tx.bloqueioAgenda.count({
      where: { medicoId: p.medicoId, dia: { gte: diaParaDate(hojeSaoPaulo(p.agora)) } },
    });
    if (futuros >= MAX_BLOQUEIOS_FUTUROS) return { tipo: "limite" };
  }

  const antes = await ops.contar(tx);
  if ((antes.consultas || antes.reservas) && !p.cancelarConsultas) {
    return { tipo: "confirmar", consultas: antes.consultas, reservas: antes.reservas };
  }

  const bloqueio = await tx.bloqueioAgenda.upsert({
    where: chave,
    create: { medicoId: p.medicoId, dia: diaDate, motivo: p.motivo },
    update: { motivo: p.motivo },
    select: { dia: true, motivo: true, criadoEm: true },
  });

  let apareceuDepois = false;
  let cancelar = p.cancelarConsultas;
  if (!cancelar) {
    const depois = await ops.contar(tx);
    apareceuDepois = depois.consultas > 0 || depois.reservas > 0;
    cancelar = apareceuDepois;
  }
  const cancelamento = cancelar ? await ops.cancelar(tx) : null;
  return { tipo: "ok", bloqueio, cancelamento, apareceuDepois };
}

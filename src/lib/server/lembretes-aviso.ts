import "server-only";
import { db } from "@/lib/db";
import { lerPosologia } from "@/lib/saude-paciente";
import { lembreteDevido, type LembreteDisparo } from "@/lib/lembrete-ciclo";
import { enviarPushParaUsuario, SEM_INSCRICAO } from "@/lib/server/web-push";
import { payloadPushNotificacao } from "@/lib/server/push-notificacao";

/* ------------------------------------------------------------------ */
/* F6 (auditoria de errinhos): o lembrete não disparava NADA — a tela  */
/* se chamava "Lembretes & Alarmes", mas nenhuma rotina lia a tabela.  */
/*                                                                     */
/* Mecanismo (o mesmo do toque da consulta): pg_cron + pg_net no       */
/* Supabase chamam /api/cron/lembretes a cada minuto (a Vercel Hobby   */
/* só tem cron diário). Para cada lembrete devido NESTE minuto         */
/* (regras puras em src/lib/lembrete-ciclo.ts): cria a Notificação     */
/* na central do paciente e tenta Web Push genérico nos aparelhos      */
/* inscritos.                                                          */
/*                                                                     */
/* Pré-requisito: colunas feitoEm/ultimoDisparoEm no Lembrete          */
/* (20261104a, e 20261110a com IF NOT EXISTS + diaSemana). Em          */
/* produção as colunas já existem; o model Prisma agora as declara,    */
/* então o job lê e grava com o client tipado. Sem as colunas neste    */
/* ambiente, `rodarAvisos` responde { ativo: false } e nada dispara.   */
/* ------------------------------------------------------------------ */

/** Orçamento da rodada (o pg_net espera 10 s; a rota tem maxDuration 10). */
export const ORCAMENTO_AVISOS_MS = 7_000;
const MAX_EXAMINADOS = 500;
const MAX_DISPAROS = 60;
/** Título do push na tela de bloqueio: genérico, sem dado de saúde. */
export const TITULO_PUSH_LEMBRETE = "Lembrete de saúde";
export const URL_PUSH_LEMBRETE = "/lembretes";

export type { LembreteDisparo };

export type ResultadoAvisos = {
  ativo: boolean;
  examinados: number;
  disparados: number;
  pushes: number;
  semInscricao: number;
  erros: number;
  incompleto: boolean;
};

/** Subconjunto do Prisma usado pelo job (injetável nos testes). */
export type BancoAvisos = {
  $queryRaw: (typeof db)["$queryRaw"];
  lembrete: {
    findMany: (typeof db)["lembrete"]["findMany"];
    update: (typeof db)["lembrete"]["update"];
  };
  medicamentoEmUso: { findMany: (typeof db)["medicamentoEmUso"]["findMany"] };
  notificacao: { create: (typeof db)["notificacao"]["create"] };
};

type DependenciasAvisos = {
  colunasExistem?: () => Promise<boolean>;
  enviarPush?: typeof enviarPushParaUsuario;
  db?: BancoAvisos;
};

async function colunasExistemPadrao(banco: BancoAvisos): Promise<boolean> {
  try {
    const linhas = await banco.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'Lembrete' AND column_name IN ('feitoEm', 'ultimoDisparoEm')`;
    return (linhas[0]?.n ?? 0) === 2;
  } catch {
    return false;
  }
}

/**
 * Uma rodada do job (chamada por /api/cron/lembretes a cada minuto).
 * Idempotente por ocorrência via ultimoDisparoEm; orçamento de 7 s.
 */
export async function rodarAvisosLembretes(
  agora: Date = new Date(),
  dep: DependenciasAvisos = {},
): Promise<ResultadoAvisos> {
  const r: ResultadoAvisos = { ativo: false, examinados: 0, disparados: 0, pushes: 0, semInscricao: 0, erros: 0, incompleto: false };
  const banco = dep.db ?? db;
  const colunasExistem = dep.colunasExistem ?? (() => colunasExistemPadrao(banco));
  if (!(await colunasExistem())) return r; // migração 20261104a ausente neste ambiente
  r.ativo = true;
  const enviarPush = dep.enviarPush ?? ((u, payload, o) => enviarPushParaUsuario(u, payload, o));
  const prazo = Date.now() + ORCAMENTO_AVISOS_MS;

  const lembretes = (await banco.lembrete.findMany({
    orderBy: { horario: "asc" },
    take: MAX_EXAMINADOS,
  })) as LembreteDisparo[];
  r.examinados = lembretes.length;

  // Dia da semana dos lembretes semanais ligados a medicamento (posologia).
  const idsMed = [...new Set(lembretes.map((l) => l.medicamentoEmUsoId).filter((x): x is string => !!x))];
  const diaPorMed = new Map<string, number | null>();
  if (idsMed.length) {
    const meds = await banco.medicamentoEmUso.findMany({
      where: { id: { in: idsMed } },
      select: { id: true, posologia: true },
    });
    for (const m of meds) diaPorMed.set(m.id, lerPosologia(m.posologia).diaSemana ?? null);
  }

  for (const l of lembretes) {
    if (r.disparados >= MAX_DISPAROS) {
      r.incompleto = true;
      break;
    }
    const diaSemanal = l.medicamentoEmUsoId ? diaPorMed.get(l.medicamentoEmUsoId) : null;
    if (!lembreteDevido(l, agora, diaSemanal)) continue;
    if (Date.now() > prazo) {
      r.incompleto = true;
      break;
    }
    try {
      // Marca ANTES de avisar: duas rodadas simultâneas não duplicam.
      await banco.lembrete.update({
        where: { id: l.id },
        data: { ultimoDisparoEm: agora },
      });
      await banco.notificacao.create({
        data: {
          usuarioId: l.usuarioId,
          tipo: "lembrete",
          titulo: l.titulo,
          texto: `Lembrete programado para as ${l.horario} (${l.frequencia}).`,
        },
      });
      r.disparados++;
      const push = await enviarPush(l.usuarioId, payloadPushNotificacao(TITULO_PUSH_LEMBRETE, URL_PUSH_LEMBRETE), {
        ttl: 3_600,
        prazo,
      }).catch(() => null);
      if (push === SEM_INSCRICAO) r.semInscricao++;
      else if (typeof push === "number" && push > 0) r.pushes++;
    } catch (e) {
      r.erros++;
      console.error("[Lembretes] falha ao disparar aviso", { lembreteId: l.id, erro: e instanceof Error ? e.name : "erro" });
    }
  }
  return r;
}

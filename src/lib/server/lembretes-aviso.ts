import "server-only";
import { Prisma } from "@prisma/client";
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
/* Pré-requisito: migração 20261104a (colunas feitoEm/                 */
/* ultimoDisparoEm). Em produção as colunas JÁ existem (aplicadas      */
/* fora do schema_migrations); o model Prisma de Lembrete NÃO as      */
/* declara de propósito — se o client passar a SELECIONÁ-las,         */
/* ambientes sem a migration quebram em TODA leitura de Lembrete.      */
/*                                                                     */
/* Por isso este job lê e grava os dois campos por SQL cru             */
/* ($queryRaw / $executeRaw). Um `db.lembrete.update({ ultimoDisparoEm */
/* })` é rejeitado pelo client com PrismaClientValidationError         */
/* (54 falhas em /api/cron/lembretes, 04/11 a 10/11). Sem as           */
/* colunas, `rodarAvisos` responde { ativo: false } e nada dispara.    */
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
  $executeRaw: (typeof db)["$executeRaw"];
  lembrete: { findMany: (typeof db)["lembrete"]["findMany"] };
  medicamentoEmUso: { findMany: (typeof db)["medicamentoEmUso"]["findMany"] };
  notificacao: { create: (typeof db)["notificacao"]["create"] };
};

type DependenciasAvisos = {
  colunasExistem?: () => Promise<boolean>;
  enviarPush?: typeof enviarPushParaUsuario;
  db?: BancoAvisos;
};

type CamposDisparo = { id: string; feitoEm: Date | null; ultimoDisparoEm: Date | null };

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

/** Lê feitoEm/ultimoDisparoEm por SQL cru — o model Prisma não tem os campos. */
async function camposDisparoPorId(banco: BancoAvisos, ids: string[]): Promise<Map<string, CamposDisparo>> {
  const mapa = new Map<string, CamposDisparo>();
  if (!ids.length) return mapa;
  const linhas = await banco.$queryRaw<CamposDisparo[]>`
    SELECT id, "feitoEm", "ultimoDisparoEm" FROM "Lembrete" WHERE id IN (${Prisma.join(ids)})`;
  for (const l of linhas) mapa.set(l.id, l);
  return mapa;
}

/** Grava ultimoDisparoEm sem passar pelo validador do Prisma (campo fora do model). */
async function marcarUltimoDisparo(banco: BancoAvisos, id: string, agora: Date): Promise<void> {
  await banco.$executeRaw`UPDATE "Lembrete" SET "ultimoDisparoEm" = ${agora} WHERE "id" = ${id}`;
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

  const linhas = await banco.lembrete.findMany({
    orderBy: { horario: "asc" },
    take: MAX_EXAMINADOS,
  });
  const extras = await camposDisparoPorId(banco, linhas.map((l) => l.id));
  const lembretes = linhas.map((l) => {
    const extra = extras.get(l.id);
    return { ...l, feitoEm: extra?.feitoEm ?? null, ultimoDisparoEm: extra?.ultimoDisparoEm ?? null } as LembreteDisparo;
  });
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
      await marcarUltimoDisparo(banco, l.id, agora);
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

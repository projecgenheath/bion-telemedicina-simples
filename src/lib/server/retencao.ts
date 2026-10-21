import { db } from "@/lib/db";
import {
  ACAO_MONITOR_IA,
  PREFIXO_CODIGO,
  codigoPaciente,
  ORCAMENTO_MS,
  auditoriaDescartavel,
  cortesRetencao,
  filtroDescarteAuditoria,
  pseudonimizarTexto,
} from "@/lib/retencao-logica";

/** Limites por execução: o que sobrar fica para o dia seguinte. */
export const LIMITE_APAGAR = 5000;
export const LIMITE_ATUALIZAR = 500;
const LOTE = 500;

export type ResultadoRetencao = {
  simulacao: boolean;
  chamadosPseudonimizados: number;
  auditoriaPseudonimizada: number;
  monitorIaApagado: number;
  auditoriaApagada: number;
  /** Último chamado (id) processado; a próxima execução retoma daí. null = recomeça do início. */
  cursorChamados: string | null;
  etapasPuladasPorTempo: string[];
};

type Ctx = { simulacao: boolean; prazo: number };
const semTempo = (ctx: Ctx) => Date.now() >= ctx.prazo;

/** Apaga em lotes de ids (deleteMany do Prisma não tem limite). */
async function apagarEmLotes(
  where: Record<string, unknown>,
  limite: number,
  ctx: Ctx,
  conferir?: (r: { acao: string; categoria: string; entidade: string | null }) => boolean,
): Promise<number> {
  if (ctx.simulacao) return Math.min(await db.auditLog.count({ where }), limite);
  let total = 0;
  while (total < limite && !semTempo(ctx)) {
    const lote = await db.auditLog.findMany({
      where,
      select: { id: true, acao: true, categoria: true, entidade: true },
      orderBy: { createdAt: "asc" },
      take: Math.min(LOTE, limite - total),
    });
    if (!lote.length) break;
    // Segunda checagem em código: nada fora da allowlist é apagado, mesmo se o filtro falhar.
    const ids = lote.filter((r) => !conferir || conferir(r)).map((r) => r.id);
    if (ids.length) total += (await db.auditLog.deleteMany({ where: { id: { in: ids } } })).count;
    if (lote.length < LOTE || ids.length < lote.length) break;
  }
  return total;
}

/** Chamados de paciente com mais de 6 meses: nome no assunto/mensagem/resposta vira código. */
async function pseudonimizarChamados(
  corte: Date,
  inicio: string | null,
  ctx: Ctx,
): Promise<{ atualizados: number; cursor: string | null }> {
  let atualizados = 0;
  let cursor: string | undefined = inicio ?? undefined;
  let chegouAoFim = false;
  // Varre em lotes por id a partir do cursor salvo; só grava quando o texto muda (idempotente).
  for (let volta = 0; volta < 20 && atualizados < LIMITE_ATUALIZAR && !semTempo(ctx); volta++) {
    const lote = await db.ticket.findMany({
      where: { createdAt: { lt: corte }, usuario: { role: "PACIENTE" } },
      select: { id: true, assunto: true, mensagem: true, resposta: true, usuarioId: true, usuario: { select: { nome: true } } },
      orderBy: { id: "asc" },
      take: LOTE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!lote.length) {
      chegouAoFim = true;
      break;
    }
    for (const t of lote) {
      cursor = t.id;
      const cod = codigoPaciente(t.usuarioId);
      const nome = t.usuario.nome;
      const assunto = pseudonimizarTexto(t.assunto, nome, cod);
      const mensagem = pseudonimizarTexto(t.mensagem, nome, cod);
      const resposta = t.resposta == null ? null : pseudonimizarTexto(t.resposta, nome, cod);
      if (assunto !== t.assunto || mensagem !== t.mensagem || resposta !== t.resposta) {
        if (!ctx.simulacao) await db.ticket.update({ where: { id: t.id }, data: { assunto, mensagem, resposta } });
        if (++atualizados >= LIMITE_ATUALIZAR) break;
      }
    }
    if (lote.length < LOTE && cursor === lote[lote.length - 1].id) {
      chegouAoFim = true;
      break;
    }
  }
  // Fim da lista: a próxima execução recomeça do início (chamados que passaram do prazo depois).
  return { atualizados, cursor: chegouAoFim ? null : (cursor ?? null) };
}

/**
 * Auditoria com mais de 6 meses (fora do monitor de IA):
 * 1) registros feitos pelo próprio paciente: usuarioNome e o nome dentro de `detalhes` viram código;
 * 2) registros de chamado feitos por outra pessoa (ex.: admin respondeu): o nome do paciente dono do chamado sai de `detalhes`.
 */
async function pseudonimizarAuditoria(corte: Date, ctx: Ctx): Promise<number> {
  let atualizados = 0;
  const proprios = await db.auditLog.findMany({
    where: {
      createdAt: { lt: corte },
      acao: { not: ACAO_MONITOR_IA },
      role: "PACIENTE",
      usuarioId: { not: null },
      NOT: { usuarioNome: { startsWith: PREFIXO_CODIGO } },
    },
    select: { id: true, usuarioId: true, usuarioNome: true, detalhes: true, usuario: { select: { nome: true } } },
    orderBy: { createdAt: "asc" },
    take: LIMITE_ATUALIZAR,
  });
  for (const a of proprios) {
    const cod = codigoPaciente(a.usuarioId!);
    let detalhes = a.detalhes;
    for (const nome of new Set([a.usuarioNome, a.usuario?.nome].filter(Boolean) as string[])) {
      if (detalhes) detalhes = pseudonimizarTexto(detalhes, nome, cod);
    }
    if (!ctx.simulacao) await db.auditLog.update({ where: { id: a.id }, data: { usuarioNome: cod, detalhes } });
    atualizados++;
    if (semTempo(ctx)) return atualizados;
  }

  const restante = LIMITE_ATUALIZAR - atualizados;
  if (restante <= 0) return atualizados;
  const deChamado = await db.auditLog.findMany({
    where: {
      createdAt: { lt: corte },
      entidade: { in: ["ticket", "Ticket"] },
      entidadeId: { not: null },
      detalhes: { not: null },
      NOT: { role: "PACIENTE" },
    },
    select: { id: true, entidadeId: true, detalhes: true },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  if (!deChamado.length) return atualizados;
  const tickets = await db.ticket.findMany({
    where: { id: { in: Array.from(new Set(deChamado.map((a) => a.entidadeId!))) }, usuario: { role: "PACIENTE" } },
    select: { id: true, usuarioId: true, usuario: { select: { nome: true } } },
  });
  const dono = new Map(tickets.map((t) => [t.id, t]));
  let feitos = 0;
  for (const a of deChamado) {
    const t = dono.get(a.entidadeId!);
    if (!t || !a.detalhes) continue;
    const detalhes = pseudonimizarTexto(a.detalhes, t.usuario.nome, codigoPaciente(t.usuarioId));
    if (detalhes === a.detalhes) continue;
    if (!ctx.simulacao) await db.auditLog.update({ where: { id: a.id }, data: { detalhes } });
    if (++feitos >= restante || semTempo(ctx)) break;
  }
  return atualizados + feitos;
}

/** Cursor dos chamados salvo no último registro RETENCAO_DESCARTE_CRON (sem migração). */
export async function lerCursorChamados(): Promise<string | null> {
  const ult = await db.auditLog.findFirst({
    where: { acao: "RETENCAO_DESCARTE_CRON" },
    orderBy: { createdAt: "desc" },
    select: { detalhes: true },
  });
  try {
    const c = ult?.detalhes ? JSON.parse(ult.detalhes).cursorChamados : null;
    return typeof c === "string" && c ? c : null;
  } catch {
    return null;
  }
}

/**
 * Roda as 4 etapas com orçamento de tempo (padrão 240 s, abaixo do maxDuration de 300 s).
 * Em simulação só conta; nada é apagado nem alterado e o cursor não avança.
 */
export async function executarRetencao(
  agora = new Date(),
  opcoes: { simulacao?: boolean; orcamentoMs?: number; cursorChamados?: string | null } = {},
): Promise<ResultadoRetencao> {
  const ctx: Ctx = { simulacao: opcoes.simulacao ?? true, prazo: Date.now() + (opcoes.orcamentoMs ?? ORCAMENTO_MS) };
  const c = cortesRetencao(agora);
  const inicio = opcoes.cursorChamados !== undefined ? opcoes.cursorChamados : await lerCursorChamados();
  const r: ResultadoRetencao = {
    simulacao: ctx.simulacao,
    chamadosPseudonimizados: 0,
    auditoriaPseudonimizada: 0,
    monitorIaApagado: 0,
    auditoriaApagada: 0,
    cursorChamados: inicio,
    etapasPuladasPorTempo: [],
  };
  const etapas: [string, () => Promise<void>][] = [
    ["monitorIa", async () => {
      r.monitorIaApagado = await apagarEmLotes({ acao: ACAO_MONITOR_IA, createdAt: { lt: c.monitorIa } }, LIMITE_APAGAR, ctx);
    }],
    ["auditoria5anos", async () => {
      r.auditoriaApagada = await apagarEmLotes(filtroDescarteAuditoria(c.auditoria), LIMITE_APAGAR, ctx, auditoriaDescartavel);
    }],
    ["chamados", async () => {
      const ch = await pseudonimizarChamados(c.pseudonimizar, inicio, ctx);
      r.chamadosPseudonimizados = ch.atualizados;
      if (!ctx.simulacao) r.cursorChamados = ch.cursor;
    }],
    ["auditoriaPseudonimizar", async () => {
      r.auditoriaPseudonimizada = await pseudonimizarAuditoria(c.pseudonimizar, ctx);
    }],
  ];
  for (const [nome, rodar] of etapas) {
    if (semTempo(ctx)) r.etapasPuladasPorTempo.push(nome);
    else await rodar();
  }
  return r;
}

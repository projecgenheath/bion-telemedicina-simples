import { db } from "@/lib/db";
import {
  ACAO_MONITOR_IA,
  PREFIXO_CODIGO,
  codigoPaciente,
  cortesRetencao,
  pseudonimizarTexto,
} from "@/lib/retencao-logica";

/** Limites por execução: o que sobrar fica para o dia seguinte. */
export const LIMITE_APAGAR = 5000;
export const LIMITE_ATUALIZAR = 500;
const LOTE = 500;

export type ResultadoRetencao = {
  chamadosPseudonimizados: number;
  auditoriaPseudonimizada: number;
  monitorIaApagado: number;
  auditoriaApagada: number;
};

/** Apaga em lotes de ids (deleteMany do Prisma não tem limite). */
async function apagarEmLotes(where: Record<string, unknown>, limite: number): Promise<number> {
  let total = 0;
  while (total < limite) {
    const ids = (
      await db.auditLog.findMany({ where, select: { id: true }, orderBy: { createdAt: "asc" }, take: Math.min(LOTE, limite - total) })
    ).map((r) => r.id);
    if (!ids.length) break;
    const r = await db.auditLog.deleteMany({ where: { id: { in: ids } } });
    total += r.count;
    if (ids.length < LOTE) break;
  }
  return total;
}

/** Chamados de paciente com mais de 6 meses: nome no assunto/mensagem/resposta vira código. */
async function pseudonimizarChamados(corte: Date): Promise<number> {
  let atualizados = 0;
  let cursor: string | undefined;
  // Varre em lotes por id; só grava quando o texto muda (idempotente).
  for (let volta = 0; volta < 20 && atualizados < LIMITE_ATUALIZAR; volta++) {
    const lote = await db.ticket.findMany({
      where: { createdAt: { lt: corte }, usuario: { role: "PACIENTE" } },
      select: { id: true, assunto: true, mensagem: true, resposta: true, usuarioId: true, usuario: { select: { nome: true } } },
      orderBy: { id: "asc" },
      take: LOTE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!lote.length) break;
    cursor = lote[lote.length - 1].id;
    for (const t of lote) {
      const cod = codigoPaciente(t.usuarioId);
      const nome = t.usuario.nome;
      const assunto = pseudonimizarTexto(t.assunto, nome, cod);
      const mensagem = pseudonimizarTexto(t.mensagem, nome, cod);
      const resposta = t.resposta == null ? null : pseudonimizarTexto(t.resposta, nome, cod);
      if (assunto !== t.assunto || mensagem !== t.mensagem || resposta !== t.resposta) {
        await db.ticket.update({ where: { id: t.id }, data: { assunto, mensagem, resposta } });
        if (++atualizados >= LIMITE_ATUALIZAR) break;
      }
    }
    if (lote.length < LOTE) break;
  }
  return atualizados;
}

/**
 * Auditoria com mais de 6 meses (fora do monitor de IA):
 * 1) registros feitos pelo próprio paciente: usuarioNome e o nome dentro de `detalhes` viram código;
 * 2) registros de chamado feitos por outra pessoa (ex.: admin respondeu): o nome do paciente dono do chamado sai de `detalhes`.
 */
async function pseudonimizarAuditoria(corte: Date): Promise<number> {
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
    await db.auditLog.update({ where: { id: a.id }, data: { usuarioNome: cod, detalhes } });
    atualizados++;
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
    await db.auditLog.update({ where: { id: a.id }, data: { detalhes } });
    if (++feitos >= restante) break;
  }
  return atualizados + feitos;
}

export async function executarRetencao(agora = new Date()): Promise<ResultadoRetencao> {
  const c = cortesRetencao(agora);
  const monitorIaApagado = await apagarEmLotes({ acao: ACAO_MONITOR_IA, createdAt: { lt: c.monitorIa } }, LIMITE_APAGAR);
  const auditoriaApagada = await apagarEmLotes({ createdAt: { lt: c.auditoria } }, LIMITE_APAGAR);
  const chamadosPseudonimizados = await pseudonimizarChamados(c.pseudonimizar);
  const auditoriaPseudonimizada = await pseudonimizarAuditoria(c.pseudonimizar);
  return { chamadosPseudonimizados, auditoriaPseudonimizada, monitorIaApagado, auditoriaApagada };
}

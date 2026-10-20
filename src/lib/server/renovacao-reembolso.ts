import "server-only";
import type { Prisma } from "@prisma/client";
import { criarReembolsoPorPagamento } from "@/lib/server/financeiro";

/**
 * Reembolso INTEGRAL (sem a taxa de 10%) do pedido de renovação recusado pelo
 * médico. Sem pagamentoId (pedido antigo, sem cobrança): no-op. Idempotente
 * (criarReembolsoPorPagamento devolve o reembolso ativo, se já existir).
 * Chamar na mesma transação que grava "recusada".
 */
export async function reembolsarPedidoRenovacao(pedidoId: string, tx: Prisma.TransactionClient): Promise<void> {
  const pedido = await tx.pedidoRenovacao.findUnique({ where: { id: pedidoId }, select: { pagamentoId: true } });
  if (!pedido?.pagamentoId) return;
  await criarReembolsoPorPagamento(pedido.pagamentoId, "renovacao_recusada", tx, { multaCentavos: 0 });
}

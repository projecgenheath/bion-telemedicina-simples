import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { REEMBOLSO_AUTOMATICO, REEMBOLSO_STATUS_ATIVOS } from "@/lib/server/financeiro";

type Tx = Prisma.TransactionClient;

/**
 * Reembolso INTEGRAL (sem a taxa de 10%) do pagamento de um pedido de
 * renovação de receita — usado quando o médico recusa (status "recusada").
 * Vai direto pelo PedidoRenovacao.pagamentoId (o pedido não tem consulta).
 * Idempotente: com reembolso ativo para o pagamento, devolve o existente.
 * Sem pagamento confirmado (ou valor 0): null, nada é criado.
 * Chamar dentro da transação que grava a recusa (tx); sem tx, usa o db.
 */
export async function reembolsarPedidoRenovacao(pedidoId: string, tx: Tx = db as unknown as Tx) {
  const pedido = await tx.pedidoRenovacao.findUnique({
    where: { id: pedidoId },
    select: { id: true, pacienteId: true, pagamentoId: true, valorCentavos: true },
  });
  if (!pedido?.pagamentoId) return null;
  const pagamento = await tx.pagamento.findUnique({ where: { id: pedido.pagamentoId } });
  if (!pagamento || pagamento.status !== "confirmado") return null;
  const valorCentavos = Math.round(pagamento.valor * 100);
  if (valorCentavos <= 0) return null;
  const ativo = await tx.reembolso.findFirst({
    where: { pagamentoId: pagamento.id, status: { in: REEMBOLSO_STATUS_ATIVOS } },
  });
  if (ativo) return ativo;
  return tx.reembolso.create({
    data: {
      pagamentoId: pagamento.id,
      valorCentavos,
      multaCentavos: 0,
      motivo: "renovacao_recusada",
      status: REEMBOLSO_AUTOMATICO ? "aprovado" : "solicitado",
      solicitadoPor: "sistema",
    },
  });
}

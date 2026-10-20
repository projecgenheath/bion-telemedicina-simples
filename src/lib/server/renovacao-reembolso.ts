import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * STUB MÍNIMO — será substituído pela versão do #66 (Pacientes), que é a
 * dona desta função (reembolso pelo pagamentoId do pedido de renovação).
 * Mantido aqui só porque o #68 parte da main, que ainda não tem o #66.
 * Sem lógica de propósito: hoje não faz nada.
 */
export async function reembolsarPedidoRenovacao(pedidoId: string, tx: Prisma.TransactionClient): Promise<void> {}

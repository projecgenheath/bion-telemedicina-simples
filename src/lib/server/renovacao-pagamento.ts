import "server-only";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Cobrança da renovação de receita por mensagem (#66 + #70): o pedido nasce
 * "aguardando_pagamento" com um Pagamento SEM consulta (consultaId nulo,
 * vínculo em PedidoRenovacao.pagamentoId) no valor normal da consulta do médico.
 */

/** Cria o pedido + a cobrança PIX pendente. O valor vem de PerfilMedico.valor (reais). */
export async function criarCobrancaRenovacao(
  tx: Tx,
  dados: { id: string; pacienteId: string; medicoId: string; consultaOrigemId: string | null; documentoId: string; observacaoPaciente: string | null },
) {
  const perfil = await tx.perfilMedico.findUnique({ where: { userId: dados.medicoId }, select: { valor: true } });
  const valorReais = Math.max(0, Math.round((perfil?.valor ?? 150) * 100) / 100);
  const valorCentavos = Math.round(valorReais * 100);
  const pagamento = await tx.pagamento.create({
    data: { consultaId: null, valor: valorReais, metodo: "pix", status: "pendente", via: "webhook", gatewayRef: `renovacao:${dados.id}` },
  });
  const pedido = await tx.pedidoRenovacao.create({
    data: { ...dados, status: "aguardando_pagamento", valorCentavos, pagamentoId: pagamento.id },
  });
  return { pedido, pagamento };
}

/**
 * Pagamento da renovação CONFIRMADO (webhook ou simulado). Idempotente:
 * aguardando_pagamento → pendente (vai para a fila do médico). Qualquer outro
 * status: nada muda. Devolve o desfecho.
 */
export async function confirmarPagamentoRenovacao(pagamentoId: string, tx: Tx): Promise<"pendente" | "ja_processado" | "sem_pedido"> {
  const pedido = await tx.pedidoRenovacao.findUnique({ where: { pagamentoId }, select: { id: true } });
  if (!pedido) return "sem_pedido";
  const pg = await tx.pagamento.findUnique({ where: { id: pagamentoId }, select: { status: true } });
  if (pg?.status !== "confirmado") return "ja_processado";
  const r = await tx.pedidoRenovacao.updateMany({
    where: { id: pedido.id, status: "aguardando_pagamento" },
    data: { status: "pendente" },
  });
  return r.count === 1 ? "pendente" : "ja_processado";
}

/** PIX expirado ou falho: aguardando_pagamento → cancelado (idempotente). */
export async function cancelarRenovacaoPagamentoFalhou(pagamentoId: string, tx: Tx): Promise<boolean> {
  const r = await tx.pedidoRenovacao.updateMany({
    where: { pagamentoId, status: "aguardando_pagamento" },
    data: { status: "cancelado", respondidoEm: new Date() },
  });
  return r.count === 1;
}

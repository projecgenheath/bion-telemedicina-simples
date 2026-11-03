import "server-only";
import type { Prisma } from "@prisma/client";
import { conferirMedicoAtivoNaTransacao } from "@/lib/server/bloqueio-agenda";
import { reembolsarPedidoRenovacao } from "@/lib/server/renovacao-reembolso";

type Tx = Prisma.TransactionClient;

/**
 * Cobrança da renovação de receita por mensagem (#66 + #70): o pedido nasce
 * "aguardando_pagamento" com um Pagamento SEM consulta (consultaId nulo,
 * vínculo em PedidoRenovacao.pagamentoId) no valor normal da consulta do médico.
 */

/**
 * Cria o pedido + a cobrança pendente, paga com CARTÃO pelo checkout Stripe
 * (POST /api/pagamentos/stripe/checkout { pagamentoId }). O app não cobra
 * por Pix. O valor vem de PerfilMedico.valor (reais).
 */
export async function criarCobrancaRenovacao(
  tx: Tx,
  dados: { id: string; pacienteId: string; medicoId: string; consultaOrigemId: string | null; documentoId: string; observacaoPaciente: string | null },
) {
  const erroMedico = await conferirMedicoAtivoNaTransacao(tx, dados.medicoId);
  if (erroMedico) throw Object.assign(new Error(erroMedico), { status: 409 });
  const perfil = await tx.perfilMedico.findUnique({ where: { userId: dados.medicoId }, select: { valor: true } });
  const valorReais = Math.max(0, Math.round((perfil?.valor ?? 150) * 100) / 100);
  const valorCentavos = Math.round(valorReais * 100);
  const pagamento = await tx.pagamento.create({
    data: { consultaId: null, valor: valorReais, metodo: "cartao", status: "pendente", via: "webhook", gatewayRef: `renovacao:${dados.id}` },
  });
  const pedido = await tx.pedidoRenovacao.create({
    data: { ...dados, status: "aguardando_pagamento", valorCentavos, pagamentoId: pagamento.id },
  });
  return { pedido, pagamento };
}

/** Estados finais em que o paciente NÃO recebeu a renovação: pagamento
 *  que chegar depois disso é sempre reembolsado. */
export const STATUS_RENOVACAO_ENCERRADA_SEM_ATENDIMENTO = ["cancelado", "recusada"] as const;
export function renovacaoEncerradaSemAtendimento(status: string): boolean {
  return (STATUS_RENOVACAO_ENCERRADA_SEM_ATENDIMENTO as readonly string[]).includes(status);
}

/**
 * Pagamento da renovação CONFIRMADO (webhook ou simulado). Idempotente:
 * aguardando_pagamento → pendente (vai para a fila do médico). Pedido já
 * CANCELADO (confirmação tardia — paciente cancelou enquanto o pagamento
 * ainda estava no ar): reembolso INTEGRAL imediato na mesma transação
 * (P1-3 da auditoria: nunca confirmar pagamento de pedido cancelado sem
 * devolver o valor). Devolve o desfecho.
 */
export async function confirmarPagamentoRenovacao(pagamentoId: string, tx: Tx): Promise<"pendente" | "ja_processado" | "sem_pedido" | "reembolsado"> {
  const pedido = await tx.pedidoRenovacao.findUnique({ where: { pagamentoId }, select: { id: true } });
  if (!pedido) return "sem_pedido";
  const pg = await tx.pagamento.findUnique({ where: { id: pagamentoId }, select: { status: true } });
  if (pg?.status !== "confirmado") return "ja_processado";
  // Confirmação tardia sobre pedido ENCERRADO sem atendimento (cancelado
  // pelo paciente, ou recusado — inclusive pelo cancelamento do documento
  // pelo médico enquanto o checkout estava aberto): devolve o dinheiro na
  // hora. Idempotente: criarReembolsoPorPagamento devolve o reembolso ativo.
  const atual = await tx.pedidoRenovacao.findUnique({ where: { id: pedido.id }, select: { status: true } });
  if (atual && renovacaoEncerradaSemAtendimento(atual.status)) {
    await reembolsarPedidoRenovacao(pedido.id, tx);
    return "reembolsado";
  }
  const r = await tx.pedidoRenovacao.updateMany({
    where: { id: pedido.id, status: "aguardando_pagamento" },
    data: { status: "pendente" },
  });
  return r.count === 1 ? "pendente" : "ja_processado";
}

/** Pagamento falho: aguardando_pagamento → cancelado (idempotente). */
export async function cancelarRenovacaoPagamentoFalhou(pagamentoId: string, tx: Tx): Promise<boolean> {
  const r = await tx.pedidoRenovacao.updateMany({
    where: { pagamentoId, status: "aguardando_pagamento" },
    data: { status: "cancelado", respondidoEm: new Date() },
  });
  return r.count === 1;
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { lerPedidoRenovacao, STATUS_RENOVACAO_ABERTOS } from "@/lib/atendimento-tipo";
import { reembolsarPedidoRenovacao } from "@/lib/server/renovacao-reembolso";

/**
 * Cancelamento do pedido de renovação — SÓ o paciente dono, SÓ enquanto
 * aberto (aguardando_pagamento ou pendente). Um único UPDATE condicional
 * (dono + aberto): 1 linha = ok; 0 = já respondido/cancelado ou não é dele
 * → 409. respondidoEm é preenchido (CHECK (status='pendente') =
 * (respondidoEm IS NULL)).
 *
 * P1-3 da auditoria (risco financeiro): um pedido com status "pendente" JÁ
 * FOI PAGO (o webhook muda para "pendente" quando o pagamento é confirmado).
 * Cancelar sem reembolsar deixava a plataforma com o valor retido. Agora o
 * cancelamento, quando existe pagamento confirmado (pagamentoId), cria o
 * reembolso INTEGRAL na MESMA transação — mesmo ponto único da recusa pelo
 * médico (reembolsarPedidoRenovacao).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { acao?: string } | null;
    if (body?.acao !== "cancelar") return Response.json({ erro: "Ação inválida." }, { status: 400 });
    if (!id || id.length > 64) return Response.json({ erro: "Pedido inválido." }, { status: 400 });

    // UPDATE condicional + reembolso (se pago) na MESMA transação: ou tudo
    // acontece, ou nada (o cancelamento nunca grava sem o reembolso).
    await db.$transaction(async (tx) => {
      const r = await tx.pedidoRenovacao.updateMany({
        where: { id, pacienteId: usuario.id, status: { in: [...STATUS_RENOVACAO_ABERTOS] } },
        data: { status: "cancelado", respondidoEm: new Date() },
      });
      if (r.count !== 1) {
        throw new Error("pedido_ja_respondido");
      }
      // Pedido pago (pagamentoId presente): reembolso integral na mesma
      // transação — idempotente, no-op para pedidos antigos sem cobrança.
      await reembolsarPedidoRenovacao(id, tx);
    });
    const linha = await db.pedidoRenovacao.findUnique({ where: { id } });
    const pedido = lerPedidoRenovacao(linha);
    const efeitos = pedido
      ? await aplicarSideEffects(
          usuario,
          [{ tipo: "receita", titulo: "Pedido de renovação cancelado", texto: `${usuario.nome} cancelou o pedido de renovação de receita.`, usuarioId: pedido.medicoId }],
          { acao: "RENOVACAO_CANCELADA", categoria: "consulta", entidade: "pedido_renovacao", entidadeId: pedido.id },
        )
      : {};
    return ok({ pedido, ...efeitos });
  } catch (erro) {
    if ((erro as Error)?.message === "pedido_ja_respondido") {
      return Response.json({ erro: "Este pedido já foi respondido ou cancelado." }, { status: 409 });
    }
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { lerPedidoRenovacao } from "@/lib/atendimento-tipo";

/**
 * Cancelamento do pedido de renovação — SÓ o paciente dono, SÓ enquanto
 * pendente. Um único UPDATE condicional (dono + pendente): 1 linha = ok;
 * 0 = já respondido/cancelado ou não é dele → 409. respondidoEm é
 * preenchido (CHECK (status='pendente') = (respondidoEm IS NULL)).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { acao?: string } | null;
    if (body?.acao !== "cancelar") return Response.json({ erro: "Ação inválida." }, { status: 400 });
    if (!id || id.length > 64) return Response.json({ erro: "Pedido inválido." }, { status: 400 });

    // Um único UPDATE condicional (dono + pendente).
    const r = await db.pedidoRenovacao.updateMany({
      where: { id, pacienteId: usuario.id, status: "pendente" },
      data: { status: "cancelado", respondidoEm: new Date() },
    });
    if (r.count !== 1) {
      return Response.json({ erro: "Este pedido já foi respondido ou cancelado." }, { status: 409 });
    }
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
    return falha(erro);
  }
}

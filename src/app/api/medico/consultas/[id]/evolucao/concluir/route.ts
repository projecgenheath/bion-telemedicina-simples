import { NextRequest, after } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { broadcastCanal } from "@/lib/supabase/broadcast";
import { topicoSala } from "@/lib/server/sala-canal";
import { erroHttp, evolucaoWire } from "@/lib/server/evolucao";

/**
 * POST /api/medico/consultas/[id]/evolucao/concluir — só o MÉDICO dono.
 * Rascunho → concluida (concluidaEm = agora), libera a trava e, na mesma
 * transação, cancela os PedidoMedicao 'pendente' da consulta
 * (updateMany WHERE status='pendente' → 'cancelado').
 * 404 sem evolução; 409 { erro: "evolucao_concluida" } se já concluída.
 * → { evolucao, pedidosMedicaoCancelados: string[] }
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await params;
    const ev = await db.evolucao.findFirst({ where: { consultaId: id, medicoId: medico.id }, select: { id: true, status: true } });
    if (!ev) return Response.json({ erro: "Evolução não encontrada." }, { status: 404 });
    if (ev.status === "concluida") return Response.json({ erro: "evolucao_concluida" }, { status: 409 });

    const agora = new Date();
    const { atualizada, cancelados } = await db.$transaction(async (tx) => {
      const r = await tx.evolucao.updateMany({
        where: { id: ev.id, medicoId: medico.id, status: "rascunho" },
        data: { status: "concluida", concluidaEm: agora },
      });
      if (r.count === 0) throw erroHttp(409, "evolucao_concluida");
      const pend = await tx.pedidoMedicao.findMany({ where: { consultaId: id, status: "pendente" }, select: { id: true } });
      if (pend.length) {
        await tx.pedidoMedicao.updateMany({ where: { id: { in: pend.map((p) => p.id) }, status: "pendente" }, data: { status: "cancelado" } });
      }
      const atualizada = await tx.evolucao.findUniqueOrThrow({ where: { id: ev.id } });
      return { atualizada, cancelados: pend.map((p) => p.id) };
    });
    for (const pedidoId of cancelados) {
      after(() => broadcastCanal(topicoSala(id), "pedido_medicao_cancelado", { pedidoId }, { privado: true }));
    }
    await registrarAudit(medico, {
      acao: "EVOLUCAO_CONCLUIDA",
      categoria: "prontuario",
      entidade: "evolucao",
      entidadeId: ev.id,
      detalhes: `consultaId=${id}${cancelados.length ? ` pedidosMedicaoCancelados=${cancelados.join(",")}` : ""}`,
    });
    return ok({ evolucao: evolucaoWire(atualizada), pedidosMedicaoCancelados: cancelados });
  } catch (erro) {
    return falha(erro);
  }
}

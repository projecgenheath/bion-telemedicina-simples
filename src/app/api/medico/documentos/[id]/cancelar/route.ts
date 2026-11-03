import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha, lerCorpoJson, corpoObjeto } from "@/lib/server/http";
import { decidirCancelamento, lerMotivo, STATUS_DOCUMENTO_CANCELADO } from "@/components/bion/medico/cancelar-documento";

/** POST /api/medico/documentos/[id]/cancelar — { motivo? }
 *  Só o médico EMISSOR (sessão MEDICO e Documento.medicoId = sessão).
 *  Documento de outro médico ou inexistente → 404. Já cancelado → 200
 *  idempotente (não regrava a data nem a auditoria). Nunca apaga:
 *  grava status="cancelado" + canceladoEm e registra DOCUMENTO_CANCELADO. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await params;
    const corpo = corpoObjeto(await lerCorpoJson(req)) ?? {};
    const motivo = lerMotivo(corpo.motivo);

    const doc = await db.documento.findUnique({
      where: { id },
      select: { id: true, medicoId: true, pacienteId: true, status: true, canceladoEm: true, tipo: true, titulo: true },
    });
    const decisao = decidirCancelamento(doc, medico.id);
    if (decisao.tipo === "nao_encontrado" || !doc) {
      return Response.json({ erro: "Documento não encontrado." }, { status: 404 });
    }
    if (decisao.tipo === "ja_cancelado") {
      return ok({ documento: { id: doc.id, status: STATUS_DOCUMENTO_CANCELADO, canceladoEm: doc.canceladoEm?.toISOString() ?? null }, jaCancelado: true });
    }

    const agora = new Date();
    // updateMany com status no where: duas chamadas simultâneas não gravam duas vezes.
    const r = await db.documento.updateMany({
      where: { id: doc.id, medicoId: medico.id, status: { not: STATUS_DOCUMENTO_CANCELADO } },
      data: { status: STATUS_DOCUMENTO_CANCELADO, canceladoEm: agora },
    });
    if (r.count === 0) {
      const atual = await db.documento.findUnique({ where: { id: doc.id }, select: { canceladoEm: true } });
      return ok({ documento: { id: doc.id, status: STATUS_DOCUMENTO_CANCELADO, canceladoEm: atual?.canceladoEm?.toISOString() ?? null }, jaCancelado: true });
    }

    const efeitos = await aplicarSideEffects(
      medico,
      [{ tipo: "receita", titulo: "Documento cancelado", texto: `${doc.titulo} foi cancelado por ${medico.nome}. Ele continua no seu histórico, marcado como cancelado.`, usuarioId: doc.pacienteId }],
      {
        acao: "DOCUMENTO_CANCELADO",
        categoria: "documento",
        entidade: "documento",
        entidadeId: doc.id,
        detalhes: `tipo=${doc.tipo}${motivo ? ` motivo=${motivo}` : ""}`,
      },
    );
    return ok({ documento: { id: doc.id, status: STATUS_DOCUMENTO_CANCELADO, canceladoEm: agora.toISOString() }, jaCancelado: false, ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

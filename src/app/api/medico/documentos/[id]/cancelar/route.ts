import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha, lerCorpoJson, corpoObjeto } from "@/lib/server/http";
import { reembolsarPedidoRenovacao } from "@/lib/server/renovacao-reembolso";
import { STATUS_RENOVACAO_ABERTOS } from "@/lib/atendimento-tipo";
import { gatewayCheckout } from "@/lib/server/gateway-pagamento";
import {
  decidirCancelamento,
  detalhesAuditoriaCancelamento,
  lerMotivo,
  MENSAGEM_RECUSA_CANCELADO,
  STATUS_DOCUMENTO_CANCELADO,
  tipoNotificacaoDocumento,
} from "@/components/bion/medico/cancelar-documento";

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
    // Mesma transação: cancela o documento e RECUSA os pedidos de renovação
    // abertos dele (pago → reembolso pelo fluxo da recusa do médico; não
    // pago → recusado, o checkout não cobra mais). O motivo NÃO é gravado
    // (Documento não tem coluna e a auditoria só guarda temMotivo).
    const { count, pedidosRecusados } = await db.$transaction(async (tx) => {
      const r = await tx.documento.updateMany({
        where: { id: doc.id, medicoId: medico.id, status: { not: STATUS_DOCUMENTO_CANCELADO } },
        data: { status: STATUS_DOCUMENTO_CANCELADO, canceladoEm: agora },
      });
      if (r.count === 0) return { count: 0, pedidosRecusados: [] as { id: string; pacienteId: string }[] };
      const abertos = await tx.pedidoRenovacao.findMany({
        where: { documentoId: doc.id, status: { in: [...STATUS_RENOVACAO_ABERTOS] } },
        select: { id: true, pacienteId: true },
      });
      const recusados: { id: string; pacienteId: string }[] = [];
      for (const p of abertos) {
        const u = await tx.pedidoRenovacao.updateMany({
          where: { id: p.id, status: { in: [...STATUS_RENOVACAO_ABERTOS] } },
          data: { status: "recusada", mensagemMedico: MENSAGEM_RECUSA_CANCELADO, respondidoEm: agora },
        });
        if (u.count === 0) continue;
        await reembolsarPedidoRenovacao(p.id, tx); // no-op se não houve pagamento confirmado
        recusados.push(p);
      }
      return { count: r.count, pedidosRecusados: recusados };
    });
    if (count === 0) {
      const atual = await db.documento.findUnique({ where: { id: doc.id }, select: { canceladoEm: true } });
      return ok({ documento: { id: doc.id, status: STATUS_DOCUMENTO_CANCELADO, canceladoEm: atual?.canceladoEm?.toISOString() ?? null }, jaCancelado: true });
    }

    // Defesa extra: expira o checkout Stripe ainda aberto dos pedidos
    // recusados. Se o paciente pagar mesmo assim, o webhook
    // (confirmarPagamentoRenovacao) reembolsa pedido "recusada".
    await expirarCheckoutsAbertos(pedidosRecusados.map((p) => p.id));

    const efeitos = await aplicarSideEffects(
      medico,
      [{ tipo: tipoNotificacaoDocumento(doc.tipo), titulo: "Documento cancelado", texto: `${doc.titulo} foi cancelado por ${medico.nome}. Ele continua no seu histórico, marcado como cancelado.`, usuarioId: doc.pacienteId }],
      {
        acao: "DOCUMENTO_CANCELADO",
        categoria: "documento",
        entidade: "documento",
        entidadeId: doc.id,
        detalhes: detalhesAuditoriaCancelamento(doc.tipo, motivo, pedidosRecusados.length),
      },
    );
    return ok({ documento: { id: doc.id, status: STATUS_DOCUMENTO_CANCELADO, canceladoEm: agora.toISOString() }, jaCancelado: false, renovacoesRecusadas: pedidosRecusados.map((p) => p.id), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

async function expirarCheckoutsAbertos(pedidoIds: string[]): Promise<void> {
  if (!pedidoIds.length) return;
  try {
    const pedidos = await db.pedidoRenovacao.findMany({
      where: { id: { in: pedidoIds } },
      select: { pagamento: { select: { status: true, stripeCheckoutSessionId: true } } },
    });
    const sessoes = pedidos
      .map((p) => (p.pagamento?.status === "pendente" ? p.pagamento.stripeCheckoutSessionId : null))
      .filter((s): s is string => !!s);
    if (!sessoes.length) return;
    const gateway = gatewayCheckout();
    await Promise.all(sessoes.map((s) => gateway.expirarSessao(s)));
  } catch {
    // Ignorado de propósito: o reembolso no webhook cobre o pagamento tardio.
  }
}

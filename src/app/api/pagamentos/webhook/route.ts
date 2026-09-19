import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  confirmarPagamento,
  falharPagamento,
  paraWire,
  verificarAssinaturaWebhook,
} from "@/lib/server/pagamentos";
import { registrarAudit } from "@/lib/server/auth";

/**
 * Webhook do gateway de pagamento (server-to-server).
 *
 * Segurança: a confirmação só é aceita com assinatura HMAC-SHA256 do corpo
 * bruto no header `x-bion-signature`, computada com BION_PAGAMENTO_WEBHOOK_SECRET.
 * Sem segredo configurado, o endpoint fica desativado (503).
 *
 * Payload: { evento: "pagamento.confirmado" | "pagamento.falhou", pagamentoId, gatewayRef? }
 * Idempotente: reentregas não duplicam efeitos.
 */
export async function POST(req: NextRequest) {
  const corpo = await req.text();
  const assinatura = req.headers.get("x-bion-signature");

  if (!process.env.BION_PAGAMENTO_WEBHOOK_SECRET) {
    return Response.json(
      { erro: "Webhook de pagamento não configurado neste ambiente." },
      { status: 503 },
    );
  }
  if (!verificarAssinaturaWebhook(corpo, assinatura)) {
    return Response.json({ erro: "Assinatura inválida." }, { status: 401 });
  }

  try {
    const body = JSON.parse(corpo) as { evento?: string; pagamentoId?: string; gatewayRef?: string };
    if (!body.pagamentoId) {
      return Response.json({ erro: "pagamentoId obrigatório." }, { status: 400 });
    }

    if (body.evento === "pagamento.falhou") {
      const p = await falharPagamento(body.pagamentoId, "webhook");
      await registrarAudit(null, {
        acao: "PAGAMENTO_FALHOU",
        categoria: "pagamento",
        severidade: "warning",
        entidade: "pagamento",
        entidadeId: body.pagamentoId,
        detalhes: `Gateway reportou falha de pagamento (${p?.metodo ?? "?"}) — consulta ${p?.consultaId ?? "?"}`,
      });
      return Response.json({ ok: true, pagamento: p ? paraWire(p) : null });
    }

    const p = await confirmarPagamento(body.pagamentoId, "webhook");
    if (!p) {
      return Response.json({ erro: "Pagamento não encontrado." }, { status: 404 });
    }
    // O pagamento CONFIRMOU a consulta (regra imposta no servidor): avisa o
    // paciente e registra a trilha de auditoria server-side.
    const consulta = await db.consulta.findUnique({
      where: { id: p.consultaId },
      include: { medico: { select: { nome: true } } },
    });
    if (consulta && consulta.status === "confirmada") {
      const quando = consulta.dataInicio.toLocaleDateString("pt-BR") +
        " às " + consulta.dataInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      await db.notificacao.create({
        data: {
          tipo: "agenda",
          titulo: "Consulta confirmada",
          texto: `Pagamento aprovado — ${consulta.especialidade} com ${consulta.medico.nome} (${quando}) está confirmada. Faça sua triagem com a BION IA até 5 minutos antes do horário.`,
          usuarioId: consulta.pacienteId,
        },
      });
    }
    await registrarAudit(null, {
      acao: "PAGAMENTO_CONFIRMADO",
      categoria: "pagamento",
      entidade: "pagamento",
      entidadeId: p.id,
      detalhes: `Pagamento confirmado via webhook do gateway — consulta ${p.consultaId} (status: confirmada)`,
    });
    return Response.json({ ok: true, pagamento: paraWire(p) });
  } catch {
    return Response.json({ erro: "Payload inválido." }, { status: 400 });
  }
}

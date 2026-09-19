import { NextRequest } from "next/server";
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
    await registrarAudit(null, {
      acao: "PAGAMENTO_CONFIRMADO",
      categoria: "pagamento",
      entidade: "pagamento",
      entidadeId: p.id,
      detalhes: `Pagamento confirmado via webhook do gateway — consulta ${p.consultaId}`,
    });
    return Response.json({ ok: true, pagamento: paraWire(p) });
  } catch {
    return Response.json({ erro: "Payload inválido." }, { status: 400 });
  }
}

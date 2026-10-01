import { NextRequest } from "next/server";
import { quandoClinica } from "@/lib/server/fuso";
import { db } from "@/lib/db";
import {
  confirmarPagamento,
  falharPagamento,
  paraWire,
  verificarAssinaturaWebhook,
} from "@/lib/server/pagamentos";
import { registrarAudit } from "@/lib/server/auth";
import { aprovarMultaRemarcacao, falharMultaRemarcacao } from "@/lib/server/financeiro";

/**
 * Webhook do gateway de pagamento (server-to-server).
 *
 * Segurança: a confirmação só é aceita com assinatura HMAC-SHA256 do corpo
 * bruto no header `x-bion-signature`, computada com BION_PAGAMENTO_WEBHOOK_SECRET.
 * Sem segredo configurado, o endpoint fica desativado (503).
 *
 * Payload: { evento: "pagamento.confirmado" | "pagamento.falhou", pagamentoId, gatewayRef? }
 *       ou { evento: "multa.confirmada" | "multa.falhou", remarcacaoId, gatewayRef? }
 *       (multa de remarcação com ≤24 h — ver src/lib/server/financeiro.ts)
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
    const body = JSON.parse(corpo) as {
      evento?: string;
      pagamentoId?: string;
      remarcacaoId?: string;
      gatewayRef?: string;
    };

    if (body.evento === "multa.confirmada" || body.evento === "multa.falhou") {
      if (!body.remarcacaoId) {
        return Response.json({ erro: "remarcacaoId obrigatório." }, { status: 400 });
      }
      if (body.evento === "multa.falhou") {
        const r = await falharMultaRemarcacao(body.remarcacaoId, "webhook");
        if (!r) return Response.json({ erro: "Remarcação não encontrada." }, { status: 404 });
        await registrarAudit(null, {
          acao: "MULTA_REMARCACAO_FALHOU",
          categoria: "pagamento",
          severidade: "warning",
          entidade: "consulta",
          entidadeId: r.consultaId,
          detalhes: `Gateway reportou falha na multa da remarcação ${r.id}; consulta mantida na data original`,
        });
        return Response.json({ ok: true, status: r.status });
      }
      const res = await aprovarMultaRemarcacao(body.remarcacaoId, "webhook", body.gatewayRef);
      if (!res) return Response.json({ erro: "Remarcação não encontrada." }, { status: 404 });
      if (!res.jaProcessada) {
        await registrarAudit(null, {
          acao: res.aplicada ? "CONSULTA_REMARCADA_MULTA_PAGA" : "MULTA_REMARCACAO_REEMBOLSADA",
          categoria: "pagamento",
          severidade: res.aplicada ? "info" : "warning",
          entidade: "consulta",
          entidadeId: res.remarcacao.consultaId,
          detalhes: res.aplicada
            ? `Multa paga; consulta remarcada para ${quandoClinica(res.remarcacao.novaData)}`
            : `Multa paga com a reserva já cancelada/expirada ou horário ocupado; consulta não movida, multa em reembolso automático`,
        });
      }
      return Response.json({ ok: true, aplicada: res.aplicada, status: res.remarcacao.status });
    }
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
      const quando = quandoClinica(consulta.dataInicio);
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

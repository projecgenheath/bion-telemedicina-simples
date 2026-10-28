import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { registrarAudit } from "@/lib/server/auth";
import { quandoClinica } from "@/lib/server/fuso";
import { confirmarPagamento, falharPagamento } from "@/lib/server/pagamentos";
import { gatewayCheckout } from "@/lib/server/gateway-pagamento";
import { jaProcessado, marcarEvento, registrarEventoReembolsoStripe, stripe } from "@/lib/server/stripe";
import { acaoDoEvento, valorConfere } from "@/lib/stripe-checkout-logica";

/**
 * Webhook do Stripe (checkout do paciente).
 *
 * - Assinatura conferida sobre o corpo BRUTO com STRIPE_WEBHOOK_SECRET ou
 *   STRIPE_CONNECT_WEBHOOK_SECRET (endpoint Connect, modo "direta").
 * - Idempotente pelo id do evento (tabela StripeEvento) e, além disso, as
 *   funções de pagamento já são idempotentes (reentrega não duplica nada).
 * - Confirma pela MESMA função do fluxo atual (confirmarPagamento), então a
 *   consulta fica paga + confirmada exatamente como no webhook HMAC antigo.
 * - Aceita eventos do Connect (cobrança direta): `event.account` é a conta do
 *   médico e é usada para ler o PaymentIntent/taxa nessa conta.
 * - Não usa a flag BION_PAGAMENTO_STRIPE: sessões já abertas continuam sendo
 *   confirmadas mesmo se a flag for desligada depois.
 */

export async function POST(req: NextRequest) {
  // Conta da BION (STRIPE_WEBHOOK_SECRET) e endpoint Connect das contas dos
  // médicos no modo "direta" (STRIPE_CONNECT_WEBHOOK_SECRET): aceita os dois.
  const segredos = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET]
    .map((x) => x?.trim())
    .filter((x): x is string => !!x);
  if (!segredos.length || !process.env.STRIPE_SECRET_KEY?.trim()) {
    return Response.json({ erro: "Webhook do Stripe não configurado neste ambiente." }, { status: 503 });
  }
  const corpo = await req.text();
  const assinatura = req.headers.get("stripe-signature") ?? "";
  let evento: Stripe.Event | null = null;
  for (const segredo of segredos) {
    try {
      evento = stripe().webhooks.constructEvent(corpo, assinatura, segredo);
      break;
    } catch {
      /* tenta o próximo segredo */
    }
  }
  if (!evento) return Response.json({ erro: "Assinatura inválida." }, { status: 400 });

  if (await jaProcessado(evento.id)) {
    return Response.json({ ok: true, repetido: true });
  }

  const sessao = evento.data.object as Stripe.Checkout.Session;
  const acao = acaoDoEvento(evento.type, evento.type.startsWith("checkout.session.") ? sessao.payment_status : null);
  let resultado: Record<string, unknown> = { acao };

  if (acao === "reembolso") {
    // Reembolsos são do Admin (src/lib/server/stripe.ts).
    resultado = { acao, atualizados: await registrarEventoReembolsoStripe(evento) };
  } else if (acao === "confirmar" || acao === "falhar" || acao === "expirar") {
    const pagamento = await acharPagamento(sessao);
    if (!pagamento) {
      await registrarAudit(null, {
        acao: "STRIPE_PAGAMENTO_NAO_ENCONTRADO",
        categoria: "pagamento",
        severidade: "warning",
        entidade: "consulta",
        entidadeId: sessao.client_reference_id ?? undefined,
        detalhes: `Evento ${evento.type} sem pagamento correspondente`,
      });
      resultado = { acao, ignorado: true };
    } else if (acao === "confirmar") {
      resultado = await confirmar(sessao, pagamento, evento.account ?? null);
    } else if (acao === "falhar") {
      const p = await falharPagamento(pagamento.id, "webhook");
      await registrarAudit(null, {
        acao: "PAGAMENTO_FALHOU",
        categoria: "pagamento",
        severidade: "warning",
        entidade: "pagamento",
        entidadeId: pagamento.id,
        detalhes: `Stripe: pagamento assíncrono falhou — consulta ${pagamento.consultaId ?? "?"}`,
      });
      resultado = { acao, status: p?.status ?? null };
    } else {
      // Sessão expirada: a cobrança continua "pendente"; o paciente abre outra pelo botão Pagar.
      resultado = { acao };
    }
  }

  // Só marca depois de tratar: se algo acima lançar, o Stripe reenvia (500).
  await marcarEvento(evento.id, evento.type);
  return Response.json({ ok: true, ...resultado });
}

async function acharPagamento(s: Stripe.Checkout.Session) {
  const id = s.metadata?.pagamentoId;
  if (id) {
    const p = await db.pagamento.findUnique({ where: { id }, select: { id: true, consultaId: true, valor: true } });
    if (p && (!s.client_reference_id || p.consultaId === s.client_reference_id)) return p;
  }
  return db.pagamento.findUnique({
    where: { stripeCheckoutSessionId: s.id },
    select: { id: true, consultaId: true, valor: true },
  });
}

async function confirmar(
  s: Stripe.Checkout.Session,
  pagamento: { id: string; consultaId: string | null; valor: number },
  conta: string | null,
) {
  if (!valorConfere(s.amount_total, pagamento.valor)) {
    await registrarAudit(null, {
      acao: "STRIPE_VALOR_DIVERGENTE",
      categoria: "pagamento",
      severidade: "critical",
      entidade: "pagamento",
      entidadeId: pagamento.id,
      detalhes: `Valor pago (${s.amount_total} centavos) diferente do valor da cobrança — não confirmado`,
    });
    return { acao: "confirmar", confirmado: false };
  }
  const paymentIntentId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  let cobranca: { chargeId: string | null; taxaCentavos: number | null } = { chargeId: null, taxaCentavos: null };
  if (paymentIntentId) {
    try {
      cobranca = await gatewayCheckout().lerCobranca(paymentIntentId, conta);
    } catch {
      /* sem taxa agora; o pagamento confirma do mesmo jeito */
    }
  }
  await db.pagamento.update({
    where: { id: pagamento.id },
    data: {
      stripeCheckoutSessionId: s.id,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: cobranca.chargeId,
      stripeTaxaCentavos: cobranca.taxaCentavos,
    },
  });
  await informarTaxaAoFinanceiro(pagamento.id, cobranca.taxaCentavos);

  const p = await confirmarPagamento(pagamento.id, "webhook");
  if (!p?.consultaId) return { acao: "confirmar", confirmado: !!p };
  const consulta = await db.consulta.findUnique({
    where: { id: p.consultaId },
    include: { medico: { select: { nome: true } } },
  });
  if (consulta?.status === "confirmada") {
    await db.notificacao.create({
      data: {
        tipo: "agenda",
        titulo: "Consulta confirmada",
        texto: `Pagamento aprovado — ${consulta.especialidade} com ${consulta.medico.nome} (${quandoClinica(consulta.dataInicio)}) está confirmada. Faça sua triagem com a BION IA até 5 minutos antes do horário.`,
        usuarioId: consulta.pacienteId,
      },
    });
  }
  await registrarAudit(null, {
    acao: "PAGAMENTO_CONFIRMADO",
    categoria: "pagamento",
    entidade: "pagamento",
    entidadeId: p.id,
    detalhes: `Pagamento confirmado via Stripe — consulta ${p.consultaId} (status: ${consulta?.status ?? "?"})`,
  });
  return { acao: "confirmar", confirmado: true };
}

/**
 * ÚNICO ponto de chamada do financeiro com a taxa real do gateway.
 * TODO(Médicos): chamar aqui a função do financeiro.ts (comissão de 10% da BION
 * e taxa do Stripe saindo dos 90% do médico; no reembolso a taxa fica com o app).
 * A taxa já fica gravada em Pagamento.stripeTaxaCentavos (null quando o Stripe
 * ainda não liquidou, ex.: Pix).
 */
async function informarTaxaAoFinanceiro(_pagamentoId: string, _taxaCentavos: number | null): Promise<void> {}

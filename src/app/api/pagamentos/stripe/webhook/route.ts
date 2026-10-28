import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { registrarAudit } from "@/lib/server/auth";
import { quandoClinica } from "@/lib/server/fuso";
import { confirmarPagamentoSeMudou, falharPagamento } from "@/lib/server/pagamentos";
import { gatewayCheckout } from "@/lib/server/gateway-pagamento";
import { liberarEvento, reivindicarEvento, registrarEventoReembolsoStripe, stripe } from "@/lib/server/stripe";
import { acaoDoEvento, moedaCheckout, moedaConfere, valorConfere } from "@/lib/stripe-checkout-logica";

/**
 * Webhook do Stripe (checkout do paciente).
 *
 * - Assinatura conferida sobre o corpo BRUTO com STRIPE_WEBHOOK_SECRET ou
 *   STRIPE_CONNECT_WEBHOOK_SECRET (endpoint Connect, modo "direta").
 * - Idempotente pelo id do evento: reserva a linha StripeEvento ANTES de
 *   processar (reivindicarEvento; repetido → 200; falha → liberarEvento e 500). As
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

  // Idempotência contra concorrência: reivindica o evento ANTES de processar
  // (StripeEvento, id único — stripe.ts do Admin). Já reivindicado → 200.
  if (!(await reivindicarEvento(evento.id, evento.type))) {
    return Response.json({ ok: true, repetido: true });
  }
  try {
    const resultado = await processar(evento);
    return Response.json({ ok: true, ...resultado });
  } catch (erro) {
    // Libera a reivindicação para o Stripe reenviar: o evento não se perde.
    await liberarEvento(evento.id).catch(() => undefined);
    console.error("[stripe webhook] falha ao processar", evento.type, erro instanceof Error ? erro.message : "erro");
    return Response.json({ erro: "Falha ao processar o evento." }, { status: 500 });
  }
}

async function processar(evento: Stripe.Event): Promise<Record<string, unknown>> {
  const sessao = evento.data.object as Stripe.Checkout.Session;
  const acao = acaoDoEvento(evento.type, evento.type.startsWith("checkout.session.") ? sessao.payment_status : null);
  const conta = evento.account ?? null;

  if (acao === "reembolso") {
    // Reembolsos são do Admin (src/lib/server/stripe.ts).
    return { acao, atualizados: await registrarEventoReembolsoStripe(evento) };
  }
  if (acao === "taxa") {
    return { acao, preenchida: await preencherTaxaDaCharge(evento.data.object as Stripe.Charge, conta) };
  }
  if (acao !== "confirmar" && acao !== "falhar" && acao !== "expirar") return { acao };

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
    return { acao, ignorado: true };
  }
  if (acao === "confirmar") return confirmar(sessao, pagamento, conta);
  if (acao === "falhar") {
    const p = await falharPagamento(pagamento.id, "webhook");
    await registrarAudit(null, {
      acao: "PAGAMENTO_FALHOU",
      categoria: "pagamento",
      severidade: "warning",
      entidade: "pagamento",
      entidadeId: pagamento.id,
      detalhes: `Stripe: pagamento assíncrono falhou — consulta ${pagamento.consultaId ?? "?"}`,
    });
    return { acao, status: p?.status ?? null };
  }
  // Sessão expirada: a cobrança continua "pendente"; o paciente abre outra pelo botão Pagar.
  return { acao };
}

/**
 * charge.updated: a balance_transaction costuma chegar depois da confirmação.
 * Preenche Pagamento.stripeTaxaCentavos SÓ se ainda for null (nunca sobrescreve).
 */
async function preencherTaxaDaCharge(charge: Stripe.Charge, conta: string | null): Promise<boolean> {
  const bt = charge.balance_transaction;
  if (!bt) return false;
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
  const pagamento = await db.pagamento.findFirst({
    where: { OR: [{ stripeChargeId: charge.id }, ...(pi ? [{ stripePaymentIntentId: pi }] : [])] },
    select: { id: true, stripeTaxaCentavos: true, stripeChargeId: true },
  });
  if (!pagamento || pagamento.stripeTaxaCentavos !== null) return false;
  const taxa = await gatewayCheckout().lerTaxa(typeof bt === "string" ? bt : bt.id, conta);
  if (taxa === null) return false;
  return gravarTaxaSeVazia(pagamento.id, taxa, pagamento.stripeChargeId ? null : charge.id);
}

/** Grava a taxa só se ainda estiver vazia (updateMany condicional) e avisa o financeiro uma vez. */
async function gravarTaxaSeVazia(pagamentoId: string, taxaCentavos: number, chargeId: string | null): Promise<boolean> {
  if (chargeId) {
    await db.pagamento.updateMany({ where: { id: pagamentoId, stripeChargeId: null }, data: { stripeChargeId: chargeId } });
  }
  const r = await db.pagamento.updateMany({
    where: { id: pagamentoId, stripeTaxaCentavos: null },
    data: { stripeTaxaCentavos: taxaCentavos },
  });
  if (r.count !== 1) return false;
  await informarTaxaAoFinanceiro(pagamentoId, taxaCentavos);
  return true;
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
  if (!valorConfere(s.amount_total, pagamento.valor) || !moedaConfere(s.currency, moedaCheckout())) {
    await registrarAudit(null, {
      acao: "STRIPE_VALOR_DIVERGENTE",
      categoria: "pagamento",
      severidade: "critical",
      entidade: "pagamento",
      entidadeId: pagamento.id,
      detalhes: `Valor/moeda pagos (${s.amount_total} ${s.currency ?? "?"}) diferentes da cobrança — não confirmado`,
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
  // Nunca grava null por cima de um id ou taxa já preenchidos (lerCobranca pode falhar).
  await db.pagamento.updateMany({ where: { id: pagamento.id, stripeCheckoutSessionId: null }, data: { stripeCheckoutSessionId: s.id } });
  if (paymentIntentId) {
    await db.pagamento.updateMany({ where: { id: pagamento.id, stripePaymentIntentId: null }, data: { stripePaymentIntentId: paymentIntentId } });
  }
  if (cobranca.chargeId) {
    await db.pagamento.updateMany({ where: { id: pagamento.id, stripeChargeId: null }, data: { stripeChargeId: cobranca.chargeId } });
  }
  if (cobranca.taxaCentavos !== null) await gravarTaxaSeVazia(pagamento.id, cobranca.taxaCentavos, null);

  // Avisa e audita SÓ se esta chamada moveu o pagamento para "confirmado"
  // (updateMany condicional, count === 1). Evento repetido ou
  // async_payment_succeeded depois do completed não avisam de novo.
  const { pagamento: p, mudou } = await confirmarPagamentoSeMudou(pagamento.id, "webhook");
  if (!mudou) return { acao: "confirmar", confirmado: p?.status === "confirmado", repetido: true };
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

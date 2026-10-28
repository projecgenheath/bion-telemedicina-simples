/* ------------------------------------------------------------------ */
/* Checkout do paciente (Stripe) — regras puras, sem banco e sem SDK.  */
/* Testes: bun src/lib/stripe-checkout-logica.teste.ts                  */
/* ------------------------------------------------------------------ */

import type { ModoCobranca } from "@/lib/server/stripe";

type Env = Record<string, string | undefined>;

/** Flag do fluxo Stripe. Desligada = continua o fluxo atual (simulado/HMAC). */
export function stripeAtivo(env: Env = process.env): boolean {
  return env.BION_PAGAMENTO_STRIPE === "true" && !!env.STRIPE_SECRET_KEY?.trim();
}

/** Moeda da cobrança (STRIPE_MOEDA). Padrão BRL; a conta de teste atual é USD. */
export function moedaCheckout(env: Env = process.env): string {
  const m = (env.STRIPE_MOEDA ?? "brl").trim().toLowerCase();
  return /^[a-z]{3}$/.test(m) ? m : "brl";
}

/**
 * Métodos aceitos: SÓ cartão, para sempre. O Stripe proíbe Pix para
 * telemedicina; Pix, se vier, será por outro gateway (ver gateway-pagamento.ts).
 */
export function metodosCheckout(): string[] {
  return ["card"];
}

export type ConsultaParaCheckout = {
  id: string;
  pacienteId: string;
  status: string;
  pago: boolean;
  valor: number; // reais (do banco)
  tipoAtendimento: string;
  pagamento: { id: string; status: string; gatewayRef: string | null } | null;
};

export type Elegibilidade =
  | { ok: true; valorCentavos: number }
  | { ok: false; status: number; erro: string };

/** Status em que a consulta pode estar "aguardando pagamento" (mesma regra das etiquetas). */
export const STATUS_AGUARDANDO = ["em_espera", "pendente_anamnese", "confirmada"] as const;

export function avaliarElegibilidade(c: ConsultaParaCheckout | null, pacienteId: string): Elegibilidade {
  if (!c) return { ok: false, status: 404, erro: "Consulta não encontrada." };
  if (c.pacienteId !== pacienteId) return { ok: false, status: 403, erro: "Acesso negado." };
  const valorCentavos = Math.round((c.valor ?? 0) * 100);
  if (c.tipoAtendimento === "retorno" && valorCentavos === 0) {
    return { ok: false, status: 409, erro: "Retorno grátis não tem cobrança." };
  }
  if (c.pago || c.pagamento?.status === "confirmado") {
    return { ok: false, status: 409, erro: "Esta consulta já está paga." };
  }
  if (!(STATUS_AGUARDANDO as readonly string[]).includes(c.status)) {
    return { ok: false, status: 409, erro: "Esta consulta não está aguardando pagamento." };
  }
  if (valorCentavos <= 0) return { ok: false, status: 409, erro: "Consulta sem valor a cobrar." };
  // gatewayRef guarda marcadores do app ("espera:<id>", "renovacao:<id>") lidos
  // por outras rotinas: essas cobranças seguem no fluxo atual por enquanto.
  if (c.pagamento?.gatewayRef) {
    return { ok: false, status: 409, erro: "Esta cobrança ainda não pode ser paga por aqui." };
  }
  return { ok: true, valorCentavos };
}

/**
 * Chave de idempotência por consulta + valor + sessão anterior: dois cliques
 * juntos geram a MESMA sessão; depois que uma expira, a próxima ganha chave nova.
 */
export function chaveIdempotencia(consultaId: string, valorCentavos: number, sessaoAnterior: string | null): string {
  const tentativa = sessaoAnterior ? sessaoAnterior.slice(-12) : "0";
  return `bion-checkout-${consultaId}-${valorCentavos}-${tentativa}`;
}

/* --------------------------- modo de cobrança --------------------------- */
/*  plataforma (padrão, Connect desligado): cobra só na conta da BION, sem    */
/*             divisão; o repasse ao médico segue por PIX (financeiro.ts).    */
/*  destino:   cobrança na plataforma com transfer_data.destination +         */
/*             on_behalf_of (conta do médico) + application_fee_amount.       */
/*  direta:    cobrança direta na conta do médico (header Stripe-Account) +   */
/*             application_fee_amount; o webhook recebe event.account.        */
/*  STRIPE_MODO_COBRANCA; destino/direta só valem com STRIPE_CONNECT=true.    */
/*  Produção: o modo RECOMENDADO é "direta". "plataforma" nunca roda com      */
/*  chave live (exigência do Jurídico; ver bloqueioChaveLive).                */
/*   A comissão vem de   */
/*  taxaPlataformaConnectCentavos (financeiro.ts) — nunca calculada aqui.     */
/* ------------------------------------------------------------------------- */

// Modo lido por stripeConnectAtivo() + modoCobrancaStripe() (src/lib/server/stripe.ts, Admin).
export type { ModoCobranca };

/**
 * Exigência jurídica: o modo "plataforma" (dinheiro só na conta da BION)
 * nunca roda com chave live. true = recusar a cobrança.
 */
export function bloqueioChaveLive(modo: ModoCobranca, chave: string | undefined = process.env.STRIPE_SECRET_KEY): boolean {
  return modo === "plataforma" && (chave ?? "").trim().startsWith("sk_live_");
}

/** Dados do Connect (só nos modos destino/direta). */
export type DadosConnect = { contaMedico: string; taxaPlataformaCentavos: number };

export type EntradaSessao = {
  consultaId: string;
  pacienteId: string;
  pagamentoId: string;
  valorCentavos: number;
  moeda: string;
  metodos: string[];
  descricao: string;
  baseUrl: string;
  email?: string | null;
  modo?: ModoCobranca;
  connect?: DadosConnect | null;
};

/** Parâmetros da sessão de Checkout — ÚNICO lugar que monta a cobrança. */
export function parametrosSessao(e: EntradaSessao) {
  const metadata = { consultaId: e.consultaId, pacienteId: e.pacienteId, pagamentoId: e.pagamentoId };
  const base = e.baseUrl.replace(/\/$/, "");
  const q = `consulta=${encodeURIComponent(e.consultaId)}`;
  return {
    mode: "payment" as const,
    payment_method_types: e.metodos,
    client_reference_id: e.consultaId,
    metadata,
    ...(e.email ? { customer_email: e.email } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: { currency: e.moeda, unit_amount: e.valorCentavos, product_data: { name: e.descricao } },
      },
    ],
    payment_intent_data: { metadata, ...divisaoConnect(e) },
    success_url: `${base}/pagamento/sucesso?${q}`,
    cancel_url: `${base}/pagamento/cancelado?${q}`,
  };
}

/** Campos de divisão do PaymentIntent conforme o modo. */
export function divisaoConnect(e: Pick<EntradaSessao, "modo" | "connect" | "valorCentavos">) {
  const modo = e.modo ?? "plataforma";
  if (modo === "plataforma") return {};
  const c = e.connect;
  if (!c?.contaMedico?.startsWith("acct_")) throw new Error(`Modo ${modo} exige a conta Stripe do médico.`);
  const taxa = Math.round(c.taxaPlataformaCentavos);
  if (!Number.isInteger(taxa) || taxa < 0 || taxa > e.valorCentavos) throw new Error("Comissão da plataforma inválida.");
  if (modo === "destino") {
    return { application_fee_amount: taxa, on_behalf_of: c.contaMedico, transfer_data: { destination: c.contaMedico } };
  }
  return { application_fee_amount: taxa }; // direta: a conta vai no header Stripe-Account
}

/** Opções da requisição (header Stripe-Account só na cobrança direta). */
export function opcoesRequisicao(e: Pick<EntradaSessao, "modo" | "connect">): { stripeAccount?: string } {
  return e.modo === "direta" && e.connect ? { stripeAccount: e.connect.contaMedico } : {};
}

/** Sessão salva ainda serve? (aberta, mesmo valor, com folga antes de expirar). */
export function sessaoReaproveitavel(
  s: { status: string | null; valorCentavos: number | null; expiraEmSeg: number; url: string | null } | null,
  valorCentavos: number,
  agoraSeg = Math.floor(Date.now() / 1000),
): boolean {
  return !!s && s.status === "open" && s.valorCentavos === valorCentavos && !!s.url && s.expiraEmSeg - 120 > agoraSeg;
}

/* ----------------------------- webhook ----------------------------- */

export type AcaoWebhook = "confirmar" | "falhar" | "expirar" | "aguardar" | "reembolso" | "ignorar";

/** O que fazer com cada evento do Stripe. */
export function acaoDoEvento(tipo: string, paymentStatus?: string | null): AcaoWebhook {
  switch (tipo) {
    case "checkout.session.completed":
      // Pix: completed chega "unpaid"; o pagamento vem no async_payment_succeeded.
      return paymentStatus === "paid" ? "confirmar" : "aguardar";
    case "checkout.session.async_payment_succeeded":
      return "confirmar";
    case "checkout.session.async_payment_failed":
      return "falhar";
    case "checkout.session.expired":
      return "expirar";
    case "charge.refunded":
    case "refund.updated":
    case "refund.failed":
      return "reembolso";
    default:
      return "ignorar";
  }
}

/** O valor pago bate com o valor do banco? */
export function valorConfere(pagoCentavos: number | null | undefined, bancoReais: number): boolean {
  return pagoCentavos === Math.round(bancoReais * 100);
}

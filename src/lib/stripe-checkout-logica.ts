/* ------------------------------------------------------------------ */
/* Checkout do paciente (Stripe) — regras puras, sem banco e sem SDK.  */
/* Testes: bun src/lib/stripe-checkout-logica.teste.ts                  */
/* ------------------------------------------------------------------ */

import type { ModoCobranca } from "@/lib/server/stripe";

type Env = Record<string, string | undefined>;

/**
 * Flag do fluxo Stripe. Desligada: só o gateway simulado (demonstração)
 * confirma; com gateway real configurado, a cobrança responde 503
 * "pagamento_indisponivel" (ver decisaoCobranca). Nunca Pix.
 */
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
 * telemedicina e a decisão do Alisson é cobrar tudo no cartão (consulta,
 * renovação, multa e diferença da remarcação): o app não cobra por Pix.
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
  // gatewayRef guarda marcadores do app ("espera:<id>", "renovacao:<id>"):
  // essas cobranças pagam pelo pagamentoId (avaliarPagamentoAvulso), não aqui.
  if (c.pagamento?.gatewayRef) {
    return { ok: false, status: 409, erro: "Esta cobrança ainda não pode ser paga por aqui." };
  }
  return { ok: true, valorCentavos };
}

/* ------------- cobranças sem ser a consulta (cartão, Stripe) ------------- */
/*  renovacao: Pagamento SEM consulta, gatewayRef "renovacao:<pedidoId>".     */
/*  espera:    diferença da remarcação da espera do médico, Pagamento da      */
/*             consulta nova com gatewayRef "espera:<esperaId>".              */
/*  multa:     multa da remarcação ≤24 h (RemarcacaoPendente, sem Pagamento). */
/* ------------------------------------------------------------------------- */

export type TipoCobranca = "consulta" | "renovacao" | "espera" | "multa";

/** Tipo da cobrança pelo marcador do Pagamento.gatewayRef. */
export function tipoPorGatewayRef(gatewayRef: string | null | undefined): Exclude<TipoCobranca, "multa"> | null {
  if (!gatewayRef) return "consulta";
  if (gatewayRef.startsWith("renovacao:")) return "renovacao";
  if (gatewayRef.startsWith("espera:")) return "espera";
  return null;
}

export type PagamentoAvulso = {
  id: string;
  status: string;
  valor: number; // reais
  gatewayRef: string | null;
  /** Renovação: o pedido ligado (PedidoRenovacao.pagamentoId). */
  pedidoRenovacao: { pacienteId: string; status: string } | null;
  /** Espera: a consulta nova + a espera (status e reserva). */
  consulta: { pacienteId: string; status: string } | null;
  espera: { status: string; reservaExpiraEmMs: number | null } | null;
};

/** O paciente pode pagar esta cobrança de renovação ou de diferença da espera? */
export function avaliarPagamentoAvulso(p: PagamentoAvulso | null, pacienteId: string, agoraMs = Date.now()): Elegibilidade & { tipo?: "renovacao" | "espera" } {
  if (!p) return { ok: false, status: 404, erro: "Cobrança não encontrada." };
  const tipo = tipoPorGatewayRef(p.gatewayRef);
  if (tipo !== "renovacao" && tipo !== "espera") return { ok: false, status: 409, erro: "Esta cobrança não pode ser paga por aqui." };
  const dono = tipo === "renovacao" ? p.pedidoRenovacao?.pacienteId : p.consulta?.pacienteId;
  if (!dono) return { ok: false, status: 404, erro: "Cobrança não encontrada." };
  if (dono !== pacienteId) return { ok: false, status: 403, erro: "Acesso negado." };
  if (p.status === "confirmado") return { ok: false, status: 409, erro: "Esta cobrança já está paga." };
  if (tipo === "renovacao" && p.pedidoRenovacao?.status !== "aguardando_pagamento") {
    return { ok: false, status: 409, erro: "Este pedido de renovação não está aguardando pagamento." };
  }
  if (tipo === "espera") {
    const e = p.espera;
    if (!e || e.status !== "remarcando" || p.status !== "pendente") {
      return { ok: false, status: 409, erro: "Esta remarcação não está aguardando pagamento." };
    }
    if (e.reservaExpiraEmMs !== null && e.reservaExpiraEmMs <= agoraMs) {
      return { ok: false, status: 409, erro: "A reserva do novo horário venceu. Escolha de novo." };
    }
  }
  const valorCentavos = Math.round((p.valor ?? 0) * 100);
  if (valorCentavos <= 0) return { ok: false, status: 409, erro: "Cobrança sem valor a pagar." };
  return { ok: true, valorCentavos, tipo };
}

export type MultaParaCheckout = {
  id: string;
  status: string;
  multaCentavos: number;
  expiraEmMs: number;
  consulta: { pacienteId: string };
};

/** O paciente pode pagar a multa desta remarcação (reserva vigente)? */
export function avaliarMulta(r: MultaParaCheckout | null, pacienteId: string, agoraMs = Date.now()): Elegibilidade {
  if (!r) return { ok: false, status: 404, erro: "Remarcação não encontrada." };
  if (r.consulta.pacienteId !== pacienteId) return { ok: false, status: 403, erro: "Acesso negado." };
  if (r.status !== "pendente") return { ok: false, status: 409, erro: "Esta remarcação não está aguardando pagamento." };
  if (r.expiraEmMs <= agoraMs) return { ok: false, status: 409, erro: "A reserva do novo horário venceu. Escolha de novo." };
  if (!(r.multaCentavos > 0)) return { ok: false, status: 409, erro: "Remarcação sem multa a pagar." };
  return { ok: true, valorCentavos: r.multaCentavos };
}

/**
 * Como cobrar renovação, multa e diferença da espera (cartão, nunca Pix):
 *  - "stripe":       flag ligada → checkout Stripe;
 *  - "simulado":     flag desligada no gateway simulado (demonstração): o
 *                    servidor confirma na hora, como no agendar;
 *  - "indisponivel": flag desligada com gateway real → 503 pagamento_indisponivel.
 */
export function decisaoCobranca(ativo: boolean, modoGateway: string): "stripe" | "simulado" | "indisponivel" {
  if (ativo) return "stripe";
  return modoGateway === "simulado" ? "simulado" : "indisponivel";
}

export const ERRO_PAGAMENTO_INDISPONIVEL = "Pagamento online indisponível no momento.";

/** Resposta padrão (503) quando o cartão está desligado com gateway real. */
export function respostaIndisponivel() {
  return { corpo: { erro: ERRO_PAGAMENTO_INDISPONIVEL, codigo: "pagamento_indisponivel" }, status: 503 } as const;
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
/*             divisão; o repasse ao médico é feito fora do Stripe            */
/*             (financeiro.ts). O paciente paga só com cartão.                */
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
  /** Consulta cobrada; null na renovação (Pagamento sem consulta) e omitido na multa. */
  consultaId: string | null;
  pacienteId: string;
  /** Pagamento cobrado; null na multa (RemarcacaoPendente, sem Pagamento). */
  pagamentoId: string | null;
  /** Padrão "consulta". */
  tipo?: TipoCobranca;
  /** Só na multa. */
  remarcacaoId?: string | null;
  /** Expiração da sessão (seg. epoch). O Stripe exige 30 min a 24 h. */
  expiraEmSeg?: number | null;
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
  const tipo = e.tipo ?? "consulta";
  const metadata: Record<string, string> = {
    ...(e.consultaId ? { consultaId: e.consultaId } : {}),
    pacienteId: e.pacienteId,
    ...(e.pagamentoId ? { pagamentoId: e.pagamentoId } : {}),
    ...(tipo !== "consulta" ? { tipo } : {}),
    ...(e.remarcacaoId ? { remarcacaoId: e.remarcacaoId } : {}),
  };
  const base = e.baseUrl.replace(/\/$/, "");
  const q = e.consultaId ? `consulta=${encodeURIComponent(e.consultaId)}` : `tipo=${tipo}`;
  return {
    mode: "payment" as const,
    payment_method_types: e.metodos,
    client_reference_id: referenciaCliente(e),
    metadata,
    ...(e.expiraEmSeg ? { expires_at: e.expiraEmSeg } : {}),
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

/** client_reference_id: a consulta; renovação "pagamento:<id>"; multa "multa:<id>". */
export function referenciaCliente(e: Pick<EntradaSessao, "consultaId" | "pagamentoId" | "tipo" | "remarcacaoId">): string {
  if (e.tipo === "multa") return `multa:${e.remarcacaoId ?? ""}`;
  if (e.consultaId) return e.consultaId;
  return `pagamento:${e.pagamentoId ?? ""}`;
}

/** O Pagamento achado pelo metadata é o da sessão? (confere o client_reference_id) */
export function referenciaConfere(ref: string | null | undefined, p: { id: string; consultaId: string | null }): boolean {
  if (!ref) return true;
  return p.consultaId ? ref === p.consultaId : ref === `pagamento:${p.id}`;
}

/** Remarcação com multa da sessão (metadata.tipo "multa"), ou null. */
export function multaDaSessao(metadata: Record<string, string> | null | undefined): string | null {
  return metadata?.tipo === "multa" && metadata.remarcacaoId ? metadata.remarcacaoId : null;
}

/** gatewayRef da RemarcacaoPendente com a sessão aberta da multa ("stripe_cs:<id>"). */
export const PREFIXO_SESSAO_MULTA = "stripe_cs:";
export function sessaoDaMulta(gatewayRef: string | null | undefined): string | null {
  return gatewayRef?.startsWith(PREFIXO_SESSAO_MULTA) ? gatewayRef.slice(PREFIXO_SESSAO_MULTA.length) || null : null;
}

/** Expiração da sessão para reservas curtas: o mínimo do Stripe (30 min + folga). */
export function expiracaoReservaSeg(agoraMs = Date.now()): number {
  return Math.floor(agoraMs / 1000) + 31 * 60;
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

export type AcaoWebhook = "confirmar" | "falhar" | "expirar" | "aguardar" | "reembolso" | "taxa" | "ignorar";

/** O que fazer com cada evento do Stripe. */
export function acaoDoEvento(tipo: string, paymentStatus?: string | null): AcaoWebhook {
  switch (tipo) {
    case "checkout.session.completed":
      // Método assíncrono: completed chega "unpaid" e o pagamento vem no
      // async_payment_succeeded. Cartão chega "paid" (o app só aceita cartão).
      return paymentStatus === "paid" ? "confirmar" : "aguardar";
    case "checkout.session.async_payment_succeeded":
      return "confirmar";
    case "checkout.session.async_payment_failed":
      return "falhar";
    case "checkout.session.expired":
      return "expirar";
    case "charge.updated":
      return "taxa"; // balance_transaction chegou depois: preenche stripeTaxaCentavos
    case "refund.created":
    case "charge.refunded":
    case "refund.updated":
    case "refund.failed":
      return "reembolso";
    default:
      return "ignorar";
  }
}

/** A moeda paga é a moeda configurada da cobrança? */
export function moedaConfere(paga: string | null | undefined, esperada: string): boolean {
  return !!paga && paga.toLowerCase() === esperada.toLowerCase();
}

/** O valor pago bate com o valor do banco? */
export function valorConfere(pagoCentavos: number | null | undefined, bancoReais: number): boolean {
  return pagoCentavos === Math.round(bancoReais * 100);
}

/* Chamadas do navegador para o checkout Stripe (sem chave, sem valor: o servidor decide). */

/*
 * Cache da flag "checkout Stripe ligado": só guarda RESPOSTA do servidor
 * (por TTL_ATIVO_MS). Falha de rede/HTTP NÃO é cacheada — antes, um único
 * GET falho fixava `false` na sessão inteira e TODOS os botões de pagar
 * sumiam até recarregar o app. Com falha, devolve `false` só para aquela
 * chamada e a próxima montagem de botão tenta de novo.
 */
const TTL_ATIVO_MS = 30_000;

/** ligado / desligado vêm da resposta do servidor. incerto = rede ou HTTP
 *  falhou: não cacheia e não afirma que o cartão está desligado. */
export type SituacaoCheckout = "ligado" | "desligado" | "incerto";

let ativoCache: { valor: "ligado" | "desligado"; ate: number } | null = null;
let ativoEmVoo: Promise<SituacaoCheckout> | null = null;

/** O checkout Stripe está ligado, desligado de propósito, ou a consulta falhou? */
export function situacaoCheckoutStripe(): Promise<SituacaoCheckout> {
  if (ativoCache && Date.now() < ativoCache.ate) return Promise.resolve(ativoCache.valor);
  if (ativoEmVoo) return ativoEmVoo;
  ativoEmVoo = (async () => {
    try {
      const r = await fetch("/api/pagamentos/stripe/checkout", { cache: "no-store" });
      if (!r.ok) return "incerto"; // 5xx/rede: transitório — não cacheia
      const j = (await r.json()) as { ativo?: boolean };
      const valor = j.ativo === true ? "ligado" : "desligado";
      ativoCache = { valor, ate: Date.now() + TTL_ATIVO_MS };
      return valor;
    } catch {
      return "incerto"; // sem conexão: transitório — não cacheia
    } finally {
      ativoEmVoo = null;
    }
  })();
  return ativoEmVoo;
}

/** O checkout Stripe está ligado neste ambiente? (flag do servidor) */
export function checkoutStripeAtivo(): Promise<boolean> {
  return situacaoCheckoutStripe().then((s) => s === "ligado");
}

/**
 * O que pagar: a consulta, uma cobrança avulsa (renovação de receita ou
 * diferença da espera do médico, pelo pagamentoId) ou a multa da remarcação.
 */
export type AlvoCheckout = { consultaId: string } | { pagamentoId: string } | { remarcacaoId: string };

/** O que a tela precisa para montar o cartão aqui. Não há endereço de outra página. */
export type SessaoNoApp = {
  clientSecret?: string;
  chavePublica?: string;
  conta?: string;
  erro?: string;
};

function segredoDeSessao(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("cs_test_") && v.includes("_secret_") && !v.includes("sk_") && v.length < 500;
}

function chavePublicaCliente(v: unknown): v is string {
  return typeof v === "string" && /^pk_test_[A-Za-z0-9]+$/.test(v);
}

/** Abre (ou reaproveita) a sessão embutida. Só cartão. Não devolve URL. */
export async function abrirCheckoutStripe(alvo: string | AlvoCheckout): Promise<SessaoNoApp> {
  try {
    const corpo: AlvoCheckout = typeof alvo === "string" ? { consultaId: alvo } : alvo;
    const r = await fetch("/api/pagamentos/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = (await r.json().catch(() => ({}))) as {
      clientSecret?: unknown;
      chavePublica?: unknown;
      conta?: unknown;
      erro?: unknown;
    };
    const erro = typeof j.erro === "string" ? j.erro : "Não foi possível abrir o pagamento.";
    if (!r.ok || !segredoDeSessao(j.clientSecret) || !chavePublicaCliente(j.chavePublica)) return { erro };
    const conta = typeof j.conta === "string" && /^acct_[A-Za-z0-9]+$/.test(j.conta) ? j.conta : undefined;
    return { clientSecret: j.clientSecret, chavePublica: j.chavePublica, conta };
  } catch {
    return { erro: "Sem conexão. Tente de novo." };
  }
}

/** Status da consulta para as telas de retorno (só leitura). */
export async function lerStatusPagamento(consultaId: string): Promise<{ status: string; pago: boolean } | null> {
  try {
    const r = await fetch(`/api/pagamentos/stripe/checkout?consultaId=${encodeURIComponent(consultaId)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { status?: string; pago?: boolean };
    return typeof j.status === "string" ? { status: j.status, pago: j.pago === true } : null;
  } catch {
    return null;
  }
}

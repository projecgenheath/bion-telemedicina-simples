/* Chamadas do navegador para o checkout Stripe (sem chave, sem valor: o servidor decide). */

/*
 * Cache da flag "checkout Stripe ligado": só guarda RESPOSTA do servidor
 * (por TTL_ATIVO_MS). Falha de rede/HTTP NÃO é cacheada — antes, um único
 * GET falho fixava `false` na sessão inteira e TODOS os botões de pagar
 * sumiam até recarregar o app. Com falha, devolve `false` só para aquela
 * chamada e a próxima montagem de botão tenta de novo.
 */
const TTL_ATIVO_MS = 30_000;
let ativoCache: { valor: boolean; ate: number } | null = null;
let ativoEmVoo: Promise<boolean> | null = null;

/** O checkout Stripe está ligado neste ambiente? (flag do servidor) */
export function checkoutStripeAtivo(): Promise<boolean> {
  if (ativoCache && Date.now() < ativoCache.ate) return Promise.resolve(ativoCache.valor);
  if (ativoEmVoo) return ativoEmVoo;
  ativoEmVoo = (async () => {
    try {
      const r = await fetch("/api/pagamentos/stripe/checkout", { cache: "no-store" });
      if (!r.ok) return false; // 5xx/rede: transitório — não cacheia
      const j = (await r.json()) as { ativo?: boolean };
      const valor = j.ativo === true;
      ativoCache = { valor, ate: Date.now() + TTL_ATIVO_MS };
      return valor;
    } catch {
      return false; // sem conexão: transitório — não cacheia
    } finally {
      ativoEmVoo = null;
    }
  })();
  return ativoEmVoo;
}

/**
 * O que pagar: a consulta, uma cobrança avulsa (renovação de receita ou
 * diferença da espera do médico, pelo pagamentoId) ou a multa da remarcação.
 */
export type AlvoCheckout = { consultaId: string } | { pagamentoId: string } | { remarcacaoId: string };

/** Abre (ou reaproveita) a sessão e devolve a URL do Stripe. Só cartão. */
export async function abrirCheckoutStripe(alvo: string | AlvoCheckout): Promise<{ url?: string; erro?: string }> {
  try {
    const corpo: AlvoCheckout = typeof alvo === "string" ? { consultaId: alvo } : alvo;
    const r = await fetch("/api/pagamentos/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = (await r.json().catch(() => ({}))) as { url?: string; erro?: string };
    if (!r.ok || !j.url) return { erro: j.erro ?? "Não foi possível abrir o pagamento." };
    return { url: j.url };
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

/* Chamadas do navegador para o checkout Stripe (sem chave, sem valor: o servidor decide). */

let ativoCache: Promise<boolean> | null = null;

/** O checkout Stripe está ligado neste ambiente? (flag do servidor) */
export function checkoutStripeAtivo(): Promise<boolean> {
  if (!ativoCache) {
    ativoCache = fetch("/api/pagamentos/stripe/checkout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { ativo: false }))
      .then((j: { ativo?: boolean }) => j.ativo === true)
      .catch(() => false);
  }
  return ativoCache;
}

/** Abre (ou reaproveita) a sessão e devolve a URL do Stripe. */
export async function abrirCheckoutStripe(consultaId: string): Promise<{ url?: string; erro?: string }> {
  try {
    const r = await fetch("/api/pagamentos/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultaId }),
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

"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { abrirCheckoutStripe, checkoutStripeAtivo, type AlvoCheckout } from "./pagamento-stripe-cliente";

/**
 * Botão "Pagar" (cartão, checkout Stripe). Só aparece com a flag ligada.
 * Paga a consulta (consultaId), a renovação de receita ou a diferença da
 * espera do médico (pagamentoId), ou a multa da remarcação (remarcacaoId).
 */
export function BotaoPagarStripe({
  consultaId,
  pagamentoId,
  remarcacaoId,
  rotulo = "Pagar",
  className = "",
}: {
  consultaId?: string;
  pagamentoId?: string;
  remarcacaoId?: string;
  rotulo?: string;
  className?: string;
}) {
  const [ativo, setAtivo] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  useEffect(() => {
    let vivo = true;
    checkoutStripeAtivo().then((a) => vivo && setAtivo(a));
    return () => {
      vivo = false;
    };
  }, []);
  const alvo: AlvoCheckout | null = remarcacaoId
    ? { remarcacaoId }
    : pagamentoId
      ? { pagamentoId }
      : consultaId
        ? { consultaId }
        : null;
  if (!ativo || !alvo) return null;

  const pagar = async () => {
    setAbrindo(true);
    const r = await abrirCheckoutStripe(alvo);
    if (r.url) {
      window.location.assign(r.url);
      return;
    }
    toast.error(r.erro ?? "Não foi possível abrir o pagamento.");
    setAbrindo(false);
  };

  return (
    <button
      type="button"
      onClick={pagar}
      disabled={abrindo}
      className={`bp-acao bpp-toque inline-flex items-center justify-center gap-2 min-h-11 px-4 text-sm disabled:opacity-60 ${className}`}
    >
      <CreditCard className="w-4 h-4" aria-hidden /> {abrindo ? "Abrindo pagamento…" : rotulo}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { abrirCheckoutStripe, checkoutStripeAtivo } from "./pagamento-stripe-cliente";

/** Botão "Pagar" da consulta aguardando pagamento. Só aparece com a flag ligada. */
export function BotaoPagarStripe({ consultaId, className = "" }: { consultaId: string; className?: string }) {
  const [ativo, setAtivo] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  useEffect(() => {
    let vivo = true;
    checkoutStripeAtivo().then((a) => vivo && setAtivo(a));
    return () => {
      vivo = false;
    };
  }, []);
  if (!ativo) return null;

  const pagar = async () => {
    setAbrindo(true);
    const r = await abrirCheckoutStripe(consultaId);
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
      <CreditCard className="w-4 h-4" aria-hidden /> {abrindo ? "Abrindo pagamento…" : "Pagar"}
    </button>
  );
}

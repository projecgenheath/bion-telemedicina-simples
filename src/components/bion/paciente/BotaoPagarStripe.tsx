"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { abrirCheckoutStripe, situacaoCheckoutStripe, type AlvoCheckout, type SituacaoCheckout } from "./pagamento-stripe-cliente";

/** Aviso único: o cartão deste ambiente não cobra. Não substitui o botão quando o Stripe está ligado. */
export function AvisoCartaoIndisponivel({ className = "" }: { className?: string }) {
  return (
    <p role="note" className={`text-sm leading-relaxed text-amber-950 dark:text-amber-100 ${className}`}>
      O cartão não está disponível neste ambiente de teste. Nenhum valor é cobrado.
    </p>
  );
}

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
  const [situacao, setSituacao] = useState<SituacaoCheckout | "carregando">("carregando");
  const [abrindo, setAbrindo] = useState(false);
  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const aplicar = (s: SituacaoCheckout) => {
      if (!vivo) return;
      setSituacao(s);
      if (s === "incerto") {
        // Falha de rede não cacheia: tenta de novo uma vez antes de desistir.
        timer = setTimeout(() => {
          situacaoCheckoutStripe().then((b) => vivo && setSituacao(b));
        }, 4000);
      }
    };
    situacaoCheckoutStripe().then(aplicar);
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
  const alvo: AlvoCheckout | null = remarcacaoId
    ? { remarcacaoId }
    : pagamentoId
      ? { pagamentoId }
      : consultaId
        ? { consultaId }
        : null;
  if (!alvo || situacao === "carregando" || situacao === "incerto") return null;
  if (situacao === "desligado") return <AvisoCartaoIndisponivel className="mt-2" />;

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
      className={`bp-acao bion-toque inline-flex items-center justify-center gap-2 min-h-11 px-4 text-sm disabled:opacity-60 ${className}`}
    >
      <CreditCard className="w-4 h-4" aria-hidden /> {abrindo ? "Abrindo pagamento…" : rotulo}
    </button>
  );
}

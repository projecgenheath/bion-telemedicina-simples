"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { PagamentoNoApp } from "./PagamentoNoApp";
import { situacaoCheckoutStripe, type AlvoCheckout, type SituacaoCheckout } from "./pagamento-stripe-cliente";

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
  const [aberto, setAberto] = useState(false);
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
  if (aberto) {
    return (
      <div className="space-y-3">
        <PagamentoNoApp
          alvo={alvo}
          consultaIdVolta={consultaId ?? null}
          tipoVolta={remarcacaoId ? "multa" : "renovacao"}
        />
        <button type="button" onClick={() => setAberto(false)} className="text-sm font-bold underline">
          Agora não
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAberto(true)}
      className={`bp-acao bion-toque inline-flex items-center justify-center gap-2 min-h-11 px-4 text-sm ${className}`}
    >
      <CreditCard className="w-4 h-4" aria-hidden /> {rotulo}
    </button>
  );
}

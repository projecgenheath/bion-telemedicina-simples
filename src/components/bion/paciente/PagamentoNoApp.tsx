"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { abrirCheckoutStripe, type AlvoCheckout } from "./pagamento-stripe-cliente";

type CheckoutEmbutido = { destroy: () => void; mount: (alvo: HTMLElement) => void };

type StripeJs = (chave: string, opcoes?: { stripeAccount?: string }) => {
  initEmbeddedCheckout: (o: { clientSecret: string; onComplete?: () => void }) => Promise<CheckoutEmbutido>;
};

declare global {
  interface Window {
    Stripe?: StripeJs;
  }
}

const SCRIPT = "https://js.stripe.com/v3/";
let carga: Promise<void> | null = null;

function carregarStripeJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem janela"));
  if (window.Stripe) return Promise.resolve();
  if (!carga) {
    carga = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => (window.Stripe ? resolve() : reject(new Error("sem Stripe")));
      s.onerror = () => {
        carga = null;
        reject(new Error("script"));
      };
      document.head.appendChild(s);
    });
  }
  return carga;
}

/**
 * Cartão na própria tela da BION. O número vai direto para o Stripe, no
 * quadro deles. Esta tela não guarda o cartão e não abre outra página.
 */
export function PagamentoNoApp({
  alvo,
  consultaIdVolta,
  tipoVolta,
  onConcluido,
}: {
  alvo: AlvoCheckout;
  consultaIdVolta?: string | null;
  tipoVolta?: string | null;
  onConcluido?: () => void;
}) {
  const router = useRouter();
  const caixa = useRef<HTMLDivElement>(null);
  const aoConcluir = useRef(onConcluido);
  aoConcluir.current = onConcluido;
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(true);
  const chaveAlvo = JSON.stringify(alvo);

  useEffect(() => {
    let vivo = true;
    let checkout: CheckoutEmbutido | null = null;
    const alvoAtual = JSON.parse(chaveAlvo) as AlvoCheckout;
    setErro(null);
    setAbrindo(true);
    void (async () => {
      const r = await abrirCheckoutStripe(alvoAtual);
      if (!vivo) return;
      if (!r.clientSecret || !r.chavePublica) {
        setAbrindo(false);
        setErro(r.erro ?? "Não foi possível abrir o pagamento. Nada foi cobrado.");
        return;
      }
      try {
        await carregarStripeJs();
        if (!vivo || !window.Stripe || !caixa.current) return;
        const stripe = window.Stripe(r.chavePublica, r.conta ? { stripeAccount: r.conta } : undefined);
        const criado = await stripe.initEmbeddedCheckout({
          clientSecret: r.clientSecret,
          onComplete: () => {
            if (!vivo) return;
            if (aoConcluir.current) {
              aoConcluir.current();
              return;
            }
            const q = consultaIdVolta
              ? `consulta=${encodeURIComponent(consultaIdVolta)}`
              : `tipo=${encodeURIComponent(tipoVolta || "consulta")}`;
            router.push(`/pagamento/sucesso?${q}`);
          },
        });
        if (!vivo) {
          criado.destroy();
          return;
        }
        checkout = criado;
        criado.mount(caixa.current);
        setAbrindo(false);
      } catch {
        if (vivo) {
          setAbrindo(false);
          setErro("Não foi possível abrir o pagamento aqui. Nada foi cobrado.");
        }
      }
    })();
    return () => {
      vivo = false;
      checkout?.destroy();
    };
  }, [chaveAlvo, consultaIdVolta, tipoVolta, router]);

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">O cartão fica nesta tela. A BION não vê o número.</p>
      {abrindo && !erro ? <p className="text-sm">Abrindo o pagamento…</p> : null}
      {erro ? (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {erro}
        </p>
      ) : null}
      <div ref={caixa} aria-label="Pagamento com cartão" />
    </div>
  );
}

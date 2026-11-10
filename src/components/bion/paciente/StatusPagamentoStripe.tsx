"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BotaoPagarStripe } from "./BotaoPagarStripe";
import { lerStatusPagamento } from "./pagamento-stripe-cliente";
import { textoRetornoStripe } from "./retorno-stripe";

/**
 * Tela de volta do Stripe. SÓ mostra o status: quem confirma é o webhook.
 * Consulta o servidor a cada 3 s por até 2 min.
 */
export function StatusPagamentoStripe({ volta }: { volta: "sucesso" | "cancelado" }) {
  const params = useSearchParams();
  const consultaId = params.get("consulta") ?? "";
  // Renovação de receita e multa de remarcação não têm consulta para acompanhar.
  const tipo = params.get("tipo");
  const [estado, setEstado] = useState<{ status: string; pago: boolean } | null>(null);
  const [esgotou, setEsgotou] = useState(false);

  useEffect(() => {
    if (!consultaId) return;
    let vivo = true;
    let tentativas = 0;
    const ler = async () => {
      const s = await lerStatusPagamento(consultaId);
      if (!vivo) return;
      if (s) setEstado(s);
      tentativas++;
      if (s?.pago || tentativas >= 40) {
        clearInterval(t);
        if (!s?.pago) setEsgotou(true);
      }
    };
    const t = setInterval(ler, 3000);
    ler();
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [consultaId]);

  const { titulo, texto } = textoRetornoStripe({
    consultaId,
    tipo,
    volta,
    pago: estado?.pago === true,
    esgotou,
  });

  return (
    <div className="bp-glass p-6 max-w-md mx-auto mt-8 text-center" role="status" aria-live="polite">
      <h1 className="text-xl font-bold mb-2">{titulo}</h1>
      <p className="text-sm opacity-80 leading-relaxed">{texto}</p>
      <div className="mt-5 flex flex-col gap-2 items-center">
        {!estado?.pago && volta === "cancelado" && consultaId ? <BotaoPagarStripe consultaId={consultaId} /> : null}
        <Link href="/consultas" className="bion-toque min-h-11 inline-flex items-center text-sm font-bold underline">
          Ver minhas consultas
        </Link>
      </div>
    </div>
  );
}

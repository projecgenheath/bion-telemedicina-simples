"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BotaoPagarStripe } from "./BotaoPagarStripe";
import { lerStatusPagamento } from "./pagamento-stripe-cliente";
import { textoRetornoStripe } from "./retorno-stripe";
import { OfertaInstalarApp } from "./OfertaInstalarApp";
import { DESTINO_VER_CONSULTAS_PAGAMENTO } from "./destino-status-pagamento";
import { useBion } from "@/lib/bion-store";
import { poppinsPaciente } from "./inicio/fonte-paciente";
import "./paciente.css";
import "./paciente-v2.css";

type EstadoVisual = "ok" | "pendente" | "falha";

/** Anel de status (mesmo desenho do "Pagamento da consulta" das consultas). */
function AnelStatus({ estado, girando }: { estado: EstadoVisual; girando: boolean }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className={`bp2-anel bp2-pagto-anel ${girando ? "bp2-pagto-girando" : ""}`} aria-hidden>
      <svg viewBox="0 0 57 57" width="57" height="57">
        <circle cx="28.5" cy="28.5" r={r} className="bp2-anel-trilho" />
        {estado === "ok" ? (
          <circle cx="28.5" cy="28.5" r={r} fill="none" stroke="var(--bp2-anel-verde)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c} ${c}`} transform="rotate(-90 28.5 28.5)" />
        ) : estado === "pendente" ? (
          <circle className="bp2-pagto-arco" cx="28.5" cy="28.5" r={r} fill="none" stroke="var(--bp2-anel-azul)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * 0.25} ${c}`} transform="rotate(-90 28.5 28.5)" />
        ) : (
          <circle cx="28.5" cy="28.5" r={r} fill="none" stroke="var(--bp2-pagto-falha)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c} ${c}`} transform="rotate(-90 28.5 28.5)" />
        )}
      </svg>
      <span className={`bp2-anel-centro ${estado === "ok" ? "bp2-anel-centro-ok" : ""}`}>
        {estado === "ok" ? "✓" : estado === "pendente" ? "R$" : "✕"}
      </span>
    </div>
  );
}

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

  const pago = estado?.pago === true;
  const { titulo, texto } = textoRetornoStripe({
    consultaId,
    tipo,
    volta,
    pago,
    esgotou,
  });
  const aguardando = Boolean(consultaId) && volta === "sucesso" && !pago && !esgotou;
  // Visual (etapa 6): confirmado, aguardando ou não concluído. Mesmos textos e regras de antes.
  const visual: EstadoVisual = pago ? "ok" : volta === "cancelado" || (!consultaId && !tipo) ? "falha" : "pendente";
  const chip = visual === "ok" ? "Pago" : visual === "pendente" ? "Aguardando confirmação" : "Não concluído";
  // Resumo da consulta só com o que o app já carregou (dados reais do paciente).
  const { consultas } = useBion();
  const consulta = consultaId ? consultas.find((c) => c.id === consultaId) : undefined;

  return (
    <div className={`bp-app-paciente bp2-app bp2-pagto-pagina ${poppinsPaciente.variable}`} data-estado={visual}>
      <main className="bp2-pagto bp2-v2">
        <section className="bp2-cartao bp2-pagto-cartao" role="status" aria-live="polite" aria-labelledby="bp2-pagto-titulo">
          <div className="bp2-pagto-cab">
            <span className={`bp2-pagto-chip bp2-pagto-chip-${visual}`}>{chip}</span>
            <AnelStatus estado={visual} girando={aguardando} />
          </div>
          <h1 id="bp2-pagto-titulo" className="bp2-pagto-titulo">{titulo}</h1>
          <p className="bp2-pagto-texto">{texto}</p>
          {consulta ? (
            <div className="bp2-pagto-resumo">
              <div className="bp2-pagto-resumo-nome">
                {consulta.especialidade}
                {consulta.valor ? <span> · {consulta.valor}</span> : null}
              </div>
              <div className="bp2-pagto-resumo-info">
                Com {consulta.medico}
                <br />
                Consulta – {consulta.data} às {consulta.hora}
              </div>
            </div>
          ) : null}
          <div className="bp2-pagto-acoes">
            {!estado?.pago && volta === "cancelado" && consultaId ? <BotaoPagarStripe consultaId={consultaId} className="bp2-pagto-pagar" /> : null}
            <Link href={DESTINO_VER_CONSULTAS_PAGAMENTO} className="bion-toque bp2-botao-contorno bp2-pagto-link">
              Ver minhas consultas
            </Link>
          </div>
          {aguardando ? null : (
            <div className="bp2-pagto-oferta">
              <OfertaInstalarApp />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

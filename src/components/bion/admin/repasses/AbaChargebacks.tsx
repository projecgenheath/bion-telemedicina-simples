"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { EstadoErro, EstadoVazio, Esqueleto } from "../ui/Estados";
import { brl } from "../tempo";
import { chamarApi, useRecurso } from "./recurso";

const MOTIVO_MIN = 10;

export type ChargebackLista = {
  id: string;
  stripeDisputeId: string;
  consultaId: string | null;
  medico: string | null;
  valorCentavos: number;
  taxaCartaoCentavos: number | null;
  taxaDisputaCentavos: number | null;
  descontoCentavos: number;
  statusStripe: string;
  motivoStripe: string | null;
  falhaBion: boolean;
  falhaBionMotivo: string | null;
  falhaBionPor: string | null;
  falhaBionEm: string | null;
  liquidado: boolean;
  criadoEm: string;
};

/**
 * Chargebacks (modo plataforma): o médico arca com a taxa do cartão e a
 * dispute fee, salvo "falha da BION" (cláusula 10.13). Marcar exige motivo
 * e fica na auditoria; não dá para mudar depois que o desconto entrou num repasse.
 */
export function AbaChargebacks() {
  const r = useRecurso<{ chargebacks: ChargebackLista[] }>("/api/admin/chargebacks");
  if (!r.dados && r.carregando) return <Esqueleto variante="cards" quantidade={2} rotulo="Carregando chargebacks…" />;
  if (!r.dados) return <EstadoErro mensagem={r.erro} onTentar={r.recarregar} />;
  const lista = r.dados.chargebacks;
  if (lista.length === 0) return <EstadoVazio icone={ShieldAlert} tom="ok" titulo="Nenhum chargeback" texto="As disputas abertas no Stripe aparecem aqui." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {lista.map((c) => (
        <CardChargeback key={c.id} c={c} onMudou={r.recarregar} />
      ))}
    </div>
  );
}

function CardChargeback({ c, onMudou }: { c: ChargebackLista; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const marcar = !c.falhaBion;

  async function enviar() {
    setEnviando(true);
    setErro(null);
    const resp = await chamarApi(`/api/admin/chargebacks/${encodeURIComponent(c.id)}/falha-bion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ falhaBion: marcar, motivo }),
    });
    setEnviando(false);
    if (resp.erro) return setErro(resp.erro);
    setAberto(false);
    setMotivo("");
    onMudou();
  }

  return (
    <article className="ba-card space-y-2" data-tom={c.falhaBion ? "ok" : "alerta"} aria-label={`Chargeback ${c.stripeDisputeId}`}>
      <p className="ba-rotulo">{c.medico ?? "Médico não identificado"}</p>
      <p className="ba-numero text-2xl">{brl(c.valorCentavos)}</p>
      <p className="text-xs ba-texto-2">
        Stripe: {c.statusStripe}
        {c.motivoStripe ? ` · ${c.motivoStripe}` : ""}
      </p>
      <p className="text-sm">
        {c.falhaBion ? (
          <>
            <b>Falha da BION</b>: nada é descontado do médico.
            {c.falhaBionPor ? ` Marcado por ${c.falhaBionPor}.` : ""}
            {c.falhaBionMotivo ? ` Motivo: ${c.falhaBionMotivo}` : ""}
          </>
        ) : (
          <>
            Desconto no repasse: <b>{brl(c.descontoCentavos)}</b> (taxa do cartão {brl(c.taxaCartaoCentavos ?? 0)} + dispute fee {brl(c.taxaDisputaCentavos ?? 0)}).
          </>
        )}
      </p>
      {c.liquidado ? (
        <p className="text-xs ba-texto-2">O desconto já entrou num repasse: a marcação não pode mais mudar.</p>
      ) : aberto ? (
        <div className="space-y-2">
          <label className="block text-sm" htmlFor={`motivo-${c.id}`}>
            Motivo {marcar ? "da falha da BION" : "para desmarcar"} (mínimo {MOTIVO_MIN} caracteres)
          </label>
          <textarea
            id={`motivo-${c.id}`}
            className="ba-entrada w-full"
            rows={3}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {erro ? (
            <p className="text-sm" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className="ba-botao" disabled={enviando || motivo.trim().length < MOTIVO_MIN} onClick={() => void enviar()}>
              {marcar ? "Confirmar falha da BION" : "Confirmar desmarcar"}
            </button>
            <button type="button" className="ba-botao ba-botao-secundario" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ba-botao ba-botao-secundario" onClick={() => setAberto(true)}>
          {marcar ? "Marcar falha da BION" : "Desmarcar falha da BION"}
        </button>
      )}
    </article>
  );
}

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
  semMedico: boolean;
  creditoPendente: boolean;
  creditoDevolvidoEm: string | null;
  creditoDevolvidoMotivo: string | null;
  taxaDisputaCentavos: number | null;
  descontoCentavos: number;
  statusStripe: string;
  motivoStripe: string | null;
  falhaBion: boolean;
  falhaBionMotivo: string | null;
  falhaBionPor: string | null;
  falhaBionEm: string | null;
  liquidado: boolean;
  taxasPlataforma: {
    status: string | null;
    valorCentavos: number | null;
    reversaoCentavos: number;
    descontadoCentavos: number;
    erro: string | null;
  } | null;
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
  const credito = c.creditoPendente;
  const tp = c.taxasPlataforma;
  const recuperado = tp ? tp.reversaoCentavos + tp.descontadoCentavos : 0;
  const podeCobrar = !!tp && !c.falhaBion && !credito && c.statusStripe === "lost" && (tp.status === null || tp.status === "falhou");

  async function cobrarTaxas() {
    setEnviando(true);
    setErro(null);
    const resp = await chamarApi(`/api/admin/chargebacks/${encodeURIComponent(c.id)}/cobrar-taxas`, { method: "POST" });
    setEnviando(false);
    if (resp.erro) return setErro(resp.erro);
    onMudou();
  }

  async function enviar() {
    setEnviando(true);
    setErro(null);
    const rota = credito ? "credito-devolvido" : "falha-bion";
    const resp = await chamarApi(`/api/admin/chargebacks/${encodeURIComponent(c.id)}/${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credito ? { motivo } : { falhaBion: marcar, motivo }),
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
        {c.semMedico ? (
          <>Sem médico vinculado (ex.: multa só da BION): nada é descontado.</>
        ) : c.statusStripe === "won" ? (
          <>
            Disputa ganha: nada é descontado.
            {c.creditoPendente ? " O desconto já tinha entrado num repasse: falta devolver ao médico (crédito manual)." : ""}
            {c.creditoDevolvidoEm ? ` Crédito devolvido. Motivo: ${c.creditoDevolvidoMotivo ?? ""}` : ""}
          </>
        ) : c.falhaBion ? (
          <>
            <b>Falha da BION</b>: nada é descontado do médico.
            {c.falhaBionPor ? ` Marcado por ${c.falhaBionPor}.` : ""}
            {c.falhaBionMotivo ? ` Motivo: ${c.falhaBionMotivo}` : ""}
          </>
        ) : tp ? (
          <>
            Taxas do chargeback: <b>{brl(tp.valorCentavos ?? c.taxaDisputaCentavos ?? 0)}</b> (a taxa do cartão já saiu na transferência; decisão de 27/11, alternativa B).{" "}
            {tp.status === "quitado"
              ? "Cobradas do médico."
              : tp.status === "aguardando_desconto"
                ? "Aguardando desconto nos próximos recebimentos do médico."
                : tp.status === "falhou"
                  ? `A cobrança falhou: ${tp.erro ?? "erro no Stripe"}.`
                  : tp.status === "cancelado"
                    ? "Cobrança cancelada (disputa ganha ou falha da BION)."
                    : tp.status === "sem_taxa"
                      ? "Sem taxa de contestação a cobrar."
                      : tp.status === "pendente"
                        ? "Cobrança em andamento."
                        : "Cobrança ainda não tentada."}
          </>
        ) : (
          <>
            Desconto no repasse: <b>{brl(c.descontoCentavos)}</b> (dispute fee do Stripe; a taxa do cartão já saiu no repasse).
          </>
        )}
      </p>
      {tp && recuperado > 0 ? (
        <p className="text-xs ba-texto-2">
          Já recuperado do médico: {brl(recuperado)}
          {tp.reversaoCentavos > 0 ? ` (reversão: ${brl(tp.reversaoCentavos)})` : ""}
          {tp.descontadoCentavos > 0 ? ` (desconto em recebimentos: ${brl(tp.descontadoCentavos)})` : ""}
          {credito ? " — falta devolver ao médico (crédito manual)." : ""}
        </p>
      ) : null}
      {erro && !aberto ? (
        <p className="text-sm" role="alert">
          {erro}
        </p>
      ) : null}
      {podeCobrar ? (
        <button type="button" className="ba-botao" disabled={enviando} onClick={() => void cobrarTaxas()}>
          {tp?.status === "falhou" ? "Tentar cobrar taxas de novo" : "Cobrar taxas do médico"}
        </button>
      ) : null}
      {c.semMedico ? null : (c.liquidado || recuperado > 0) && !credito ? (
        <p className="text-xs ba-texto-2">
          {recuperado > 0
            ? "As taxas já foram cobradas do médico: a marcação não pode mais mudar (ajuste manual)."
            : "O desconto já entrou num repasse: a marcação não pode mais mudar."}
        </p>
      ) : aberto ? (
        <div className="space-y-2">
          <label className="block text-sm" htmlFor={`motivo-${c.id}`}>
            Motivo {credito ? "(como o crédito foi devolvido)" : marcar ? "da falha da BION" : "para desmarcar"} (mínimo {MOTIVO_MIN} caracteres)
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
              {credito ? "Confirmar crédito devolvido" : marcar ? "Confirmar falha da BION" : "Confirmar desmarcar"}
            </button>
            <button type="button" className="ba-botao ba-botao-secundario" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ba-botao ba-botao-secundario" onClick={() => setAberto(true)}>
          {credito ? "Registrar crédito devolvido" : marcar ? "Marcar falha da BION" : "Desmarcar falha da BION"}
        </button>
      )}
    </article>
  );
}

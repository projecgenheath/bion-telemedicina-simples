"use client";

import { useState } from "react";
import { CalendarX2, ShieldAlert } from "lucide-react";
import type { Consulta } from "@/lib/bion-store";
import { brl, hora as horaDe, rotuloDia } from "../tempo";
import { useAcoesConsulta } from "./acoes";
import { reembolsoAoCancelar } from "./agenda";

/**
 * Cancelar pelo admin (PATCH { acao: "cancelar", motivo }): sem multa e, se a
 * consulta foi paga, reembolso INTEGRAL automático (regra do servidor).
 * Irreversível: pede motivo e confirmação explícita; nunca por gesto.
 */
export function CancelarConsulta({
  consulta: c,
  agora,
  onVoltar,
  onCancelada,
  onSujo,
}: {
  consulta: Consulta;
  agora: number;
  onVoltar: () => void;
  onCancelada: () => void;
  onSujo: (sujo: boolean) => void;
}) {
  const { cancelar } = useAcoesConsulta();
  const [motivo, setMotivo] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const reembolso = reembolsoAoCancelar(c);

  const confirmar = async () => {
    if (!entendi) return;
    setEnviando(true);
    setErro(null);
    const r = await cancelar(c, motivo);
    setEnviando(false);
    if (r.ok) {
      onSujo(false);
      onCancelada();
    } else setErro(r.erro);
  };

  return (
    <div className="space-y-4">
      <div className="ba-card" data-tom="critico" data-denso="true">
        <p className="font-bold break-words">{c.paciente}</p>
        <p className="text-sm ba-texto-2">
          {rotuloDia(c.ts, agora)} às {horaDe(c.ts)} · {c.medico} · {c.especialidade}
        </p>
      </div>
      <label className="block">
        <span className="ba-rotulo">Motivo (vai para o paciente e o médico)</span>
        <textarea
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            onSujo(true);
          }}
          maxLength={500}
          rows={3}
          placeholder="Cancelado pela administração"
          className="ba-entrada mt-1 w-full !rounded-2xl py-2"
        />
      </label>
      <div className="ba-aviso" data-tom={reembolso ? "dinheiro" : "atencao"}>
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-1">
          {reembolso ? (
            <p>
              <b>Reembolso integral de {brl(reembolso)}.</b> A consulta foi paga: o cancelamento pela administração não cobra multa e registra o
              reembolso do valor todo ao paciente.
            </p>
          ) : (
            <p>
              <b>Sem cobrança.</b> A consulta não foi paga, então não há reembolso.
            </p>
          )}
          <p>O horário fica livre na agenda do médico. Isso não pode ser desfeito.</p>
        </div>
      </div>
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 w-5 h-5 accent-[var(--ba-sinal)]"
          checked={entendi}
          onChange={(e) => {
            setEntendi(e.target.checked);
            onSujo(true);
          }}
        />
        <span>{reembolso ? `Entendi: cancelar e devolver ${brl(reembolso)} ao paciente.` : "Entendi: cancelar esta consulta não pode ser desfeito."}</span>
      </label>
      {erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{erro}</p>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={onVoltar} disabled={enviando} className="ba-botao ba-botao-secundario">
          Voltar
        </button>
        <button type="button" onClick={() => void confirmar()} disabled={!entendi || enviando} className="ba-botao ba-botao-perigo flex-1">
          <CalendarX2 className="w-4 h-4" aria-hidden />
          {enviando ? "Cancelando…" : "Cancelar consulta"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { chamarApi } from "../repasses/recurso";

export type CampoRevelavel = "cpf" | "telefone" | "dataNascimento";

const ROTULO: Record<CampoRevelavel, string> = { cpf: "CPF", telefone: "telefone", dataNascimento: "data de nascimento" };
const MOTIVO_MIN = 10;

/**
 * Valor mascarado (vindo assim do servidor) + ação explícita "Revelar", que
 * pede um motivo e chama POST /api/admin/pacientes/[id]/revelar. O servidor
 * registra a revelação na auditoria antes de devolver o valor; o valor fica só
 * em memória neste componente (some ao fechar a ficha).
 */
export function RevelarDado({
  pacienteId,
  campo,
  mascarado,
  formatar = (v) => v,
}: {
  pacienteId: string;
  campo: CampoRevelavel;
  mascarado: string;
  formatar?: (v: string) => string;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (valor !== null) return <span className="tabular-nums">{valor ? formatar(valor) : "—"}</span>;

  const revelar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await chamarApi<{ valor: string }>(`/api/admin/pacientes/${encodeURIComponent(pacienteId)}/revelar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campo, motivo }),
    });
    setEnviando(false);
    if (!r.dados) return setErro(r.erro);
    setValor(r.dados.valor);
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-2">
        <span className="tabular-nums">{mascarado || "—"}</span>
        {mascarado && !aberto ? (
          <button type="button" className="ba-botao ba-botao-secundario text-xs" onClick={() => setAberto(true)} aria-label={`Revelar ${ROTULO[campo]}`}>
            <Eye className="w-3.5 h-3.5" aria-hidden /> Revelar
          </button>
        ) : null}
      </span>
      {aberto ? (
        <span className="flex flex-col gap-1">
          <label className="text-xs ba-texto-2" htmlFor={`revelar-${campo}`}>
            Por que você precisa do {ROTULO[campo]} completo? (fica registrado na auditoria)
          </label>
          <input
            id={`revelar-${campo}`}
            className="ba-entrada text-sm"
            value={motivo}
            maxLength={300}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: confirmar identidade no chamado de suporte"
          />
          <span className="flex gap-2">
            <button type="button" className="ba-botao ba-botao-secundario text-xs" disabled={enviando || motivo.trim().length < MOTIVO_MIN} onClick={() => void revelar()}>
              {enviando ? "Revelando…" : "Confirmar"}
            </button>
            <button type="button" className="ba-botao ba-botao-secundario text-xs" onClick={() => { setAberto(false); setErro(null); }}>
              Cancelar
            </button>
          </span>
          {erro ? <span className="text-xs" role="alert">{erro}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

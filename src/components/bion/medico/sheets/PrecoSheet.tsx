"use client";

import { useState } from "react";
import { useBion, type Medico } from "@/lib/bion-store";
import { fmtBRL } from "../metricas";
import { Campo, EmBreve, SheetMedico } from "./SheetMedico";
import type { Confirmar } from "./useConfirmarSalvamento";

const VALOR_MIN = 1;
const VALOR_MAX = 5000; // mesmos limites do PATCH /api/medicos/[id]

/** Preço da consulta — grava em PerfilMedico.valor pela autoedição do médico. */
export function PrecoSheet({
  aberto,
  onFechar,
  medico,
  confirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  medico: Medico;
  confirmar: Confirmar<number>;
}) {
  const { atualizarMedico } = useBion();
  const [texto, setTexto] = useState(() => String(medico.valor).replace(".", ","));
  const [erro, setErro] = useState<string>();

  const salvar = () => {
    const v = Number.parseFloat(texto.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(v) || v < VALOR_MIN || v > VALOR_MAX) {
      setErro(`Informe um valor entre ${fmtBRL(VALOR_MIN)} e ${fmtBRL(VALOR_MAX)}.`);
      return;
    }
    const valor = Math.round(v * 100) / 100;
    setErro(undefined);
    atualizarMedico(medico.id, { valor });
    confirmar(valor, "Salvando preço…", `Preço atualizado para ${fmtBRL(valor)}`);
    onFechar();
  };

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Preço da consulta"
      subtitulo={`Atual: ${fmtBRL(medico.valor)}. Vale para os próximos agendamentos.`}
    >
      <div className="space-y-4">
        <Campo rotulo="Novo valor (R$)" erro={erro} ajuda="Consultas já agendadas mantêm o valor pago.">
          <input
            inputMode="decimal"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="bp-entrada w-full px-4 py-3 text-base font-bold"
            aria-label="Novo valor da consulta em reais"
          />
        </Campo>
        <button type="button" onClick={salvar} className="bp-acao w-full py-3 text-sm">
          Salvar preço
        </button>
        <div className="rounded-2xl border border-bion-ink/10 dark:border-white/10 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Promoções</div>
            <div className="text-xs text-bion-ink/70 dark:text-bion-paper/70">Descontos e primeira consulta</div>
          </div>
          <EmBreve />
        </div>
      </div>
    </SheetMedico>
  );
}

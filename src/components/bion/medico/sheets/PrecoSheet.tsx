"use client";

import { useState } from "react";
import { useBion, type Medico } from "@/lib/bion-store";
import { fmtBRL } from "../metricas";
import { Campo, SheetMedico } from "./SheetMedico";
import type { Confirmar } from "./useConfirmarSalvamento";

const VALOR_MIN = 1;
const VALOR_MAX = 5000;

/**
 * B-10: leitura de preço sem ambiguidade. Com VÍRGULA, o ponto é separador
 * de milhar ("1.234,56" → 1234.56). Sem vírgula, o ponto é decimal
 * ("1234.56" → 1234.56; "12.50" → 12.5, não 1250). Antes, todo ponto era
 * descartado como milhar, e "12.50" virava R$ 1.250.
 */
export function lerValorReais(texto: string): number {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return Number.NaN;
  const temVirgula = t.includes(",");
  const limpo = temVirgula
    ? t.replace(/\./g, "").replace(",", ".") // 1.234,56 → 1234.56
    : t.replace(/,/g, ""); // 1234.56 → 1234.56
  return Number.parseFloat(limpo);
}

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

  // Prévia do valor que será salvo (o médico vê como o texto é interpretado).
  const previa = lerValorReais(texto);
  const previaValida = Number.isFinite(previa) && texto.trim() !== "";

  const salvar = () => {
    const v = lerValorReais(texto);
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
        <Campo
          rotulo="Novo valor (R$)"
          erro={erro}
          ajuda={
            previaValida
              ? `Será salvo: ${fmtBRL(Math.round(previa * 100) / 100)}. Consultas já agendadas mantêm o valor pago.`
              : "Consultas já agendadas mantêm o valor pago."
          }
        >
          <input
            inputMode="decimal"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setErro(undefined);
            }}
            className="bp-entrada w-full px-4 py-3 text-base font-bold"
            aria-label="Novo valor da consulta em reais"
          />
        </Campo>
        <button type="button" onClick={salvar} className="bp-acao w-full py-3 text-sm">
          Salvar preço
        </button>
      </div>
    </SheetMedico>
  );
}

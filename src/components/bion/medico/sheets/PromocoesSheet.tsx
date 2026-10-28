"use client";

import { useState } from "react";
import { useBion, type Medico } from "@/lib/bion-store";
import { fmtBRL } from "../metricas";
import { Campo, SheetMedico } from "./SheetMedico";
import type { Confirmar } from "./useConfirmarSalvamento";

/** Promoções — desconto temporário sobre o valor da consulta. */
export function PromocoesSheet({
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
  const [desconto, setDesconto] = useState("");
  const [dias, setDias] = useState("7");
  const [erro, setErro] = useState<string>();

  const salvar = () => {
    const pct = Number.parseFloat(desconto.replace(",", "."));
    if (!Number.isFinite(pct) || pct < 1 || pct > 50) {
      setErro("Informe um desconto entre 1% e 50%.");
      return;
    }
    const diasNum = Number.parseInt(dias, 10);
    if (!Number.isFinite(diasNum) || diasNum < 1 || diasNum > 90) {
      setErro("A promoção pode durar de 1 a 90 dias.");
      return;
    }
    const valorPromo = Math.round(medico.valor * (1 - pct / 100) * 100) / 100;
    // Por enquanto grava como valor (o servidor ainda não tem campo de promoção).
    // Quando a migração existir, isso vira promocaoValor + promocaoAte.
    atualizarMedico(medico.id, { valor: valorPromo });
    confirmar(valorPromo, "Aplicando promoção…", `Preço promocional: ${fmtBRL(valorPromo)} por ${diasNum} dias`);
    onFechar();
  };

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Promoções"
      subtitulo="Desconto temporário sobre o valor da consulta."
    >
      <div className="space-y-4">
        <Campo rotulo="Desconto (%)" erro={erro} ajuda="De 1% a 50%. O preço original volta depois do prazo.">
          <input
            inputMode="decimal"
            value={desconto}
            onChange={(e) => setDesconto(e.target.value)}
            placeholder="Ex.: 20"
            className="bp-entrada w-full px-4 py-3 text-base font-bold"
            aria-label="Percentual de desconto"
          />
        </Campo>
        <Campo rotulo="Duração (dias)" ajuda="De 1 a 90 dias.">
          <input
            inputMode="numeric"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            className="bp-entrada w-full px-4 py-3 text-base font-bold"
            aria-label="Duração da promoção em dias"
          />
        </Campo>
        <button type="button" onClick={salvar} className="bp-acao w-full py-3 text-sm">
          Aplicar promoção
        </button>
        <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">
          Por enquanto a promoção altera o preço imediatamente. O prazo e o retorno automático ao valor original entram na próxima versão (precisa de migração no banco).
        </p>
      </div>
    </SheetMedico>
  );
}
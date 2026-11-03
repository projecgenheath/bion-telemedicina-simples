"use client";

import { useState } from "react";
import { useBion, type Medico } from "@/lib/bion-store";
import { fmtBRL } from "../metricas";
import { Campo, SheetMedico } from "./SheetMedico";
import type { Confirmar } from "./useConfirmarSalvamento";

/**
 * Promoções — desconto sobre o valor da consulta.
 *
 * Correção honesta (sem migration neste lote): o servidor NÃO tem campo de
 * promoção nem prazo, então não existe retorno automático ao preço original.
 * O campo de duração (1–90 dias) foi removido em vez de validado e descartado:
 * validar um prazo que nunca seria cumprido era a própria promessa falsa.
 * O que esta tela faz é alterar o preço vigente — permanente até o médico
 * alterar de novo manualmente. A promoção com prazo e reversão automática
 * exige migration (promocaoValor + promocaoAte) em lote separado.
 */
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
  const [erro, setErro] = useState<string>();

  const pct = Number.parseFloat(desconto.replace(",", "."));
  const descontoValido = Number.isFinite(pct) && pct >= 1 && pct <= 50;
  const valorNovo = descontoValido
    ? Math.round(medico.valor * (1 - pct / 100) * 100) / 100
    : null;

  const salvar = () => {
    if (!descontoValido) {
      setErro("Informe um desconto entre 1% e 50%.");
      return;
    }
    const valorPromo = valorNovo as number;
    // Grava como valor vigente: não há campo de promoção no servidor.
    atualizarMedico(medico.id, { valor: valorPromo });
    confirmar(
      valorPromo,
      "Aplicando novo preço…",
      `Novo preço aplicado: ${fmtBRL(valorPromo)}. Vale até você alterar de novo — o valor anterior era ${fmtBRL(medico.valor)}.`,
    );
    onFechar();
  };

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Promoções"
      subtitulo="Desconto sobre o valor da consulta — sem prazo e sem retorno automático."
    >
      <div className="space-y-4">
        <p className="text-sm text-bion-ink dark:text-bion-paper">
          Valor atual: <strong>{fmtBRL(medico.valor)}</strong>
        </p>
        <Campo rotulo="Desconto (%)" erro={erro} ajuda="De 1% a 50%.">
          <input
            inputMode="decimal"
            value={desconto}
            onChange={(e) => setDesconto(e.target.value)}
            placeholder="Ex.: 20"
            className="bp-entrada w-full px-4 py-3 text-base font-bold"
            aria-label="Percentual de desconto"
          />
        </Campo>
        {valorNovo !== null && (
          <p className="text-sm text-bion-ink dark:text-bion-paper">
            Novo valor: <strong>{fmtBRL(valorNovo)}</strong>
          </p>
        )}
        <button type="button" onClick={salvar} className="bp-acao w-full py-3 text-sm">
          Aplicar novo preço
        </button>
        <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">
          Atenção: esta alteração é permanente até você mudar o preço manualmente. Não há prazo
          nem retorno automático ao valor original — anote o valor atual acima se quiser voltar
          a ele depois. O retorno automático depende de uma migração no banco, ainda pendente.
        </p>
      </div>
    </SheetMedico>
  );
}

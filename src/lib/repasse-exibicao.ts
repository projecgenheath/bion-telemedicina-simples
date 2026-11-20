/**
 * Divisão mostrada ao médico. Espelha a conta de financeiro.ts
 * (reais → centavos com Math.round, comissão com Math.round(centavos * pct / 100)).
 * Não cobra e não muda o repasse. A cobrança real continua travada no servidor.
 */
export const COMISSAO_EXIBICAO_PADRAO = 10;

export function partesDaConsulta(valorReais: number, comissaoPct = COMISSAO_EXIBICAO_PADRAO) {
  const pct = Number.isFinite(comissaoPct) ? Math.min(100, Math.max(0, Math.round(comissaoPct))) : COMISSAO_EXIBICAO_PADRAO;
  const brutoCentavos = Math.round((Number.isFinite(valorReais) ? valorReais : 0) * 100);
  const bionCentavos = Math.round((brutoCentavos * pct) / 100);
  const medicoCentavos = brutoCentavos - bionCentavos;
  return { brutoCentavos, bionCentavos, medicoCentavos, comissaoPct: pct, parteMedicoPct: 100 - pct };
}

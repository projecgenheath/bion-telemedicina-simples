/**
 * Modelo NOVO de recebimento do médico — decisão do Alisson de 21/11/2026.
 * Fonte única das regras: C:\Users\Alisson\OpenBot\Shared\regras-pagamento-bion-2026-11.md
 * (regras 1 a 8) e o contrato rascunho do Jurídico (cláusulas 9.2, 9.3, 10.3,
 * 10.7, 10.8 e 10.9).
 *
 * Este arquivo é só TEXTO e cálculo de exibição para a área do médico.
 * Quem cobra, retém e transfere de verdade é o servidor (parte do Admin,
 * financeiro.ts). A cobrança real continua travada (bloqueioChaveLive).
 *
 * Cláusula 10.6 (opção de o médico não receber a parte das multas):
 * [A DEFINIR] no contrato — NÃO implementar sem o ok do Alisson.
 */

/** Regra 1: cobrança na marcação, dinheiro na plataforma até a consulta terminar. */
export const TEXTO_COBRANCA_RETIDA =
  "O cartão do paciente é cobrado na marcação e o valor fica na conta da plataforma até a consulta terminar.";

/** Regra 2: transferência só depois da consulta realizada (90% menos a taxa). */
export const TEXTO_TRANSFERENCIA =
  "Depois da consulta realizada, o repasse vai para a sua conta Stripe: 90% do valor menos a taxa do cartão. A BION fica com 10%.";

/** Regra 3: falta/atraso do médico e remarcação com outro médico. */
export const TEXTO_FALTA_MEDICO =
  "Se você faltar ou não entrar em até 10 minutos, não recebe essa consulta. Se o paciente remarcar com outro médico, o primeiro não recebe; o novo recebe ao fim da consulta dele, sem nova cobrança e sem diferença de preço.";

/** Regras 4, 5 e 6: reembolsos automáticos e taxa sempre com o médico. */
export const TEXTO_REEMBOLSOS =
  "Falta do médico sem remarcação, ou falta do paciente sem remarcação em 7 dias corridos: reembolso integral ao paciente e cancelamento da compra. Nenhum médico recebe. A BION não devolve a taxa do cartão em nenhuma hipótese de reembolso: ela sai da parte do médico.";

/** Regra 7: multa ≤ 24 h dividida meio a meio, taxa na metade do médico. */
export const TEXTO_MULTAS =
  "Multa de cancelamento ou remarcação com 24 horas ou menos: a sua metade (50%) é transferida quando a multa é aplicada, menos a taxa do cartão.";

/** Regra 8: depósito no banco segue o calendário da Stripe, sem fechamento 23:30. */
export const TEXTO_PRAZO_BANCO =
  "Depois do crédito na sua conta Stripe, o depósito no banco segue o calendário da Stripe (cartão brasileiro: 30 dias corridos). No modelo novo não há fechamento diário às 23:30 nem repasse manual dessa parte.";

/** Aviso do bloco "Retido na plataforma" (GET /api/medico/repasses). */
export const AVISO_RETIDO_PLATAFORMA =
  "Valor pago pelo paciente que fica na conta da plataforma até a consulta terminar. Depois da consulta realizada, 90% menos a taxa do cartão vai para a sua conta Stripe; o depósito no banco segue o calendário da Stripe.";

/**
 * Contrato de dados PROPOSTO ao Admin para o valor retido na plataforma.
 * Hoje a rota /api/medico/repasses já devolve este formato com o que dá para
 * ler do banco (consultas pagas na plataforma, ainda sem desfecho). Quando a
 * transferência pós-consulta entrar (parte do Admin), o mesmo campo passa a
 * refletir também o que aguarda transferência após o desfecho "realizada".
 */
export type ItemRetidoPlataforma = {
  consultaId: string;
  /** ISO do início da consulta. */
  dataInicio: string;
  /** Valor ainda retido: bruto − reembolsos efetivos. */
  valorCentavos: number;
  situacao: "aguardando_consulta";
};

export type RetidoPlataformaWire = {
  aviso: string;
  totalCentavos: number;
  itens: ItemRetidoPlataforma[];
};

/**
 * Transferência PREVISTA ao médico após a consulta realizada (exibição).
 * Espelha `liquidoDaConsulta` de financeiro.ts: comissão com Math.round,
 * taxa real do gateway limitada aos 90% do médico, líquido nunca negativo.
 * Não cobra nem transfere nada.
 */
export function transferenciaAposConsulta(
  valorCentavos: number,
  taxaGatewayCentavos: number | null = 0,
  comissaoPct = 10,
) {
  const brutoCentavos = Math.max(0, Math.round(Number.isFinite(valorCentavos) ? valorCentavos : 0));
  const pct = Number.isFinite(comissaoPct) ? Math.min(100, Math.max(0, Math.round(comissaoPct))) : 10;
  const comissaoCentavos = Math.round((brutoCentavos * pct) / 100);
  const taxaBruta =
    typeof taxaGatewayCentavos === "number" && Number.isFinite(taxaGatewayCentavos) && taxaGatewayCentavos > 0
      ? Math.min(Math.round(taxaGatewayCentavos), brutoCentavos)
      : 0;
  const taxaCentavos = Math.min(taxaBruta, brutoCentavos - comissaoCentavos);
  return {
    brutoCentavos,
    comissaoCentavos,
    taxaCentavos,
    medicoCentavos: brutoCentavos - comissaoCentavos - taxaCentavos,
    bionCentavos: comissaoCentavos,
    comissaoPct: pct,
    parteMedicoPct: 100 - pct,
  };
}

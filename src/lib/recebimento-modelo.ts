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

/** Aviso geral da resposta do modelo novo (contrato, seção 2). */
export const AVISO_GERAL_RECEBIMENTO =
  "A BION fica com 10%. A taxa do cartão sai do médico, inclusive no reembolso. O depósito no banco segue o calendário da Stripe.";

/**
 * Falta do paciente no modelo plataforma: o médico NÃO recebe (regra 5 de
 * 21/11; contrato, seção 3). Sem remarcação em 7 dias corridos, reembolso
 * integral automático. No legado, cada tela mantém o texto de hoje.
 */
export const TEXTO_FALTA_PACIENTE_PLATAFORMA =
  "O paciente é avisado e tem 7 dias para remarcar sem custo; sem remarcação, o valor é reembolsado e você não recebe por esta consulta.";

/**
 * Efeito da falta do paciente conforme o `modelo` que o servidor devolve no
 * desfecho (emenda de 27/11 no contrato). Sem o campo (servidor antigo),
 * vale o texto legado da própria tela — nada muda antes da hora.
 */
export function efeitoFaltaPaciente(modelo: ModeloPagamentoWire | null | undefined, textoLegado: string): string {
  return modelo === "plataforma" ? TEXTO_FALTA_PACIENTE_PLATAFORMA : textoLegado;
}

/*
 * Contrato de dados do modelo novo — o fechado com o Presidente/Admin em
 * C:\Users\Alisson\OpenBot\Shared\contrato-api-pagamento-2111.md (seção 2).
 * O cliente lê `modelo` e não depende mais dos campos antigos (saldo PIX,
 * prévia, repasses), que continuam na resposta só enquanto o Admin não liga
 * o modelo novo. Nada aqui cobra, transfere ou grava.
 */

/** `legado` = main de hoje (cobrança direta/PIX). `plataforma` = modelo novo. */
export type ModeloPagamentoWire = "plataforma" | "legado";

export type DesfechoWire = "sem_desfecho" | "realizada" | "falta_paciente" | "falha_tecnica" | "falta_medico" | "encerrada";

export type ItemRetidoWire = {
  consultaId: string;
  /** ISO do início da consulta. */
  dataInicio: string;
  /** Valor ainda retido: bruto − reembolsos efetivos. */
  valorCentavos: number;
  /** 10% da BION (Math.round, como financeiro.ts). */
  comissaoCentavos: number;
  /** Taxa real do Stripe; `null` até o webhook informar. */
  taxaCentavos: number | null;
  /** bruto − comissão − taxa (taxa `null` conta como 0). */
  previstoCentavos: number;
  desfecho: DesfechoWire;
};

export type RetidoWire = {
  aviso: string;
  totalCentavos: number;
  itens: ItemRetidoWire[];
};

export type TipoTransferenciaWire = "consulta" | "multa_cancelamento" | "multa_remarcacao";
/** 'descontada' (20261127c): líquido todo consumido por taxas de chargeback; nada foi transferido. */
export type StatusTransferenciaWire = "pendente" | "enviada" | "falhou" | "descontada";

export type TransferenciaWire = {
  id: string;
  tipo: TipoTransferenciaWire;
  consultaId: string | null;
  remarcacaoId: string | null;
  status: StatusTransferenciaWire;
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  multasCentavos: number;
  liquidoCentavos: number;
  /** Taxas de chargeback abatidas antes do envio (alternativa B de 27/11). Valor enviado = liquido − desconto. */
  descontoChargebackCentavos: number;
  criadaEm: string;
  /** `null` se pendente ou falhou. */
  enviadaEm: string | null;
  /** Calendário da Stripe; `null` se ainda não enviada. */
  previsaoBanco: string | null;
};

export type ReembolsoWire = {
  consultaId: string;
  valorCentavos: number;
  taxaNaoDevolvidaCentavos: number;
  /** > 0 quando a taxa foi descontada de recebimento futuro. */
  descontadoDoMedicoCentavos: number;
  motivo: string;
  processadoEm: string;
};

export type TotaisWire = {
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  multasCentavos: number;
  reembolsosCentavos: number;
  liquidoCentavos: number;
};

/** Bloco do modelo novo em GET /api/medico/repasses (contrato, seção 2). */
export type RespostaModeloNovoWire = {
  modelo: ModeloPagamentoWire;
  retido: RetidoWire;
  transferencias: TransferenciaWire[];
  reembolsos: ReembolsoWire[];
  totais: TotaisWire;
  aviso: string;
};

export const TOTAIS_ZERO: TotaisWire = {
  brutoCentavos: 0,
  comissaoCentavos: 0,
  taxasCentavos: 0,
  multasCentavos: 0,
  reembolsosCentavos: 0,
  liquidoCentavos: 0,
};

/**
 * Monta um item de `retido` a partir do que o banco já tem (PURA).
 * `taxaCentavos` fica `null` enquanto o webhook do Stripe não informar.
 * `desfecho` vem de `desfechoDaConsulta` (server); aqui não se inventa.
 */
export function itemRetidoDaConsulta(
  consultaId: string,
  dataInicio: Date,
  valorCentavos: number,
  taxaCentavos: number | null,
  desfecho: DesfechoWire,
  comissaoPct = 10,
): ItemRetidoWire {
  const previsto = transferenciaAposConsulta(valorCentavos, taxaCentavos, comissaoPct);
  return {
    consultaId,
    dataInicio: dataInicio.toISOString(),
    valorCentavos: previsto.brutoCentavos,
    comissaoCentavos: previsto.comissaoCentavos,
    taxaCentavos: taxaCentavos === null ? null : previsto.taxaCentavos,
    previstoCentavos: previsto.medicoCentavos,
    desfecho,
  };
}

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

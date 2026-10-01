import "server-only";
import type { Prisma } from "@prisma/client";
import { partesNoFuso, quandoClinica } from "@/lib/server/fuso";

/* ------------------------------------------------------------------ */
/* Fase financeira: regras ÚNICAS de multa, reembolso e repasse.       */
/*                                                                     */
/* Tudo que o paciente vê como prévia (GET /api/consultas/[id]/        */
/* cancelamento) e tudo que o servidor grava (PATCH /api/consultas/    */
/* [id]) passa por estas funções, então a prévia nunca diverge do que  */
/* é cobrado. Valores novos em CENTAVOS (Int).                         */
/* ------------------------------------------------------------------ */

/* ---------- Regras decididas pelo Alisson (01/10/2026) ------------- */

/** Multa quando o PACIENTE cancela ou remarca perto da consulta. */
export const MULTA_PCT = 50;
/** Janela da multa: faltando esta quantidade de horas ou menos. */
export const MULTA_JANELA_HORAS = 24;
/** A janela conta pela data ORIGINAL (não pela data remarcada). */
export const MULTA_CONTA_DATA_ORIGINAL = true;
/** Comissão do app sobre o valor da consulta (líquido do médico = valor − comissão). */
export const COMISSAO_APP_PCT = 10;
/** Parte da multa que fica com o médico; o resto fica com o app. Sem comissão sobre a multa. */
export const MULTA_PARTE_MEDICO_PCT = 50;
/** Reembolso automático: nasce aprovado e segue para o gateway, sem o admin aprovar. */
export const REEMBOLSO_AUTOMATICO = true;

/** A taxa do gateway sai do lado do médico (líquido = valor − comissão − taxa). */
export const TAXA_GATEWAY_NO_LIQUIDO = true;

/**
 * A "data original" recomeça depois de qualquer evento que NÃO é do paciente
 * (médico cancelou o dia, falha técnica do sistema, remarcação pelo admin)?
 * true: vale a data marcada na 1ª mudança do paciente depois do último evento
 * de médico/sistema/admin. false: vale a data marcada no 1º evento da consulta.
 */
export const MULTA_RECOMECA_APOS_EVENTO_NAO_PACIENTE = true;

/* ---------- Status ------------------------------------------------- */

/** Status que liberam o horário do médico (não contam como ocupados). */
export const STATUS_LIBERAM_HORARIO = ["cancelada", "concluida", "aguardando_reagendamento"];
/** Status que ficam fora do faturamento líquido. */
export const STATUS_FORA_DO_FATURAMENTO = ["cancelada", "aguardando_reagendamento"];
/** Status de reembolso que bloqueiam um novo pedido para o mesmo pagamento. */
export const REEMBOLSO_STATUS_ATIVOS = ["solicitado", "aprovado", "processado"];

export type PorEvento = "paciente" | "medico" | "sistema" | "admin";
export type TipoEvento = "cancelada" | "remarcada" | "falha_tecnica";
export type MotivoEvento = "pedido_paciente" | "agenda_cancelada" | "falha_tecnica" | "admin";

/* ---------- Dinheiro ----------------------------------------------- */

/** `valor Float` (reais) antigo → centavos. */
export function reaisParaCentavos(reais: number): number {
  return Math.round((Number.isFinite(reais) ? reais : 0) * 100);
}

function pct(centavos: number, percentual: number): number {
  return Math.round((centavos * percentual) / 100);
}

/** Divide a multa entre médico e app (sem comissão sobre a multa). */
export function divisaoDaMulta(multaCentavos: number) {
  const medico = pct(multaCentavos, MULTA_PARTE_MEDICO_PCT);
  return { medicoCentavos: medico, appCentavos: multaCentavos - medico };
}

/** Líquido do médico numa consulta realizada. */
export function liquidoDaConsulta(valorCentavos: number, taxaGatewayCentavos = 0) {
  const comissao = pct(valorCentavos, COMISSAO_APP_PCT);
  const taxa = TAXA_GATEWAY_NO_LIQUIDO ? taxaGatewayCentavos : 0;
  return {
    brutoCentavos: valorCentavos,
    comissaoCentavos: comissao,
    taxaCentavos: taxa,
    liquidoCentavos: valorCentavos - comissao - taxa,
  };
}

/** Competência "AAAA-MM" do mês de Brasília (não o mês em UTC). */
export function competenciaDe(instante: Date): string {
  const p = partesNoFuso(instante);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}`;
}

/* ---------- Multa -------------------------------------------------- */

type EventoParaMulta = { por: string; em: Date; dataAnterior: Date };

/**
 * Data que vale para a janela da multa.
 * Com MULTA_RECOMECA_APOS_EVENTO_NAO_PACIENTE: a data que estava marcada na
 * 1ª mudança do paciente depois do último evento que não foi do paciente.
 * Sem evento que se aplique: a data atual da consulta.
 */
export function dataOriginalParaMulta(eventos: EventoParaMulta[], dataAtual: Date): Date {
  if (!MULTA_CONTA_DATA_ORIGINAL) return dataAtual;
  const ordenados = [...eventos].sort((a, b) => a.em.getTime() - b.em.getTime());
  if (!MULTA_RECOMECA_APOS_EVENTO_NAO_PACIENTE) return ordenados[0]?.dataAnterior ?? dataAtual;
  let inicio = 0;
  ordenados.forEach((e, i) => {
    if (e.por !== "paciente") inicio = i + 1;
  });
  const primeiroDoPaciente = ordenados.slice(inicio).find((e) => e.por === "paciente");
  return primeiroDoPaciente?.dataAnterior ?? dataAtual;
}

export type PreviaMulta = {
  /** Multa que será registrada (0 se isento ou fora da janela). */
  multaCentavos: number;
  /** Quanto volta ao paciente se ele cancelar (0 se não pagou). */
  reembolsoCentavos: number;
  valorCentavos: number;
  pago: boolean;
  /** Data que vale para a janela (ISO). */
  dataOriginal: string;
  /** Até quando dá para cancelar/remarcar sem multa (ISO e texto em Brasília). */
  semMultaAte: string;
  semMultaAteTexto: string;
  /** Motivo da isenção, se houver. */
  isencao: null | "nao_e_paciente" | "aguardando_reagendamento" | "fora_da_janela";
};

/**
 * Prévia (e valor oficial) da multa para uma ação do paciente.
 * A janela de 24 h compara INSTANTES reais (o banco guarda UTC), então uma
 * consulta às 21h de Brasília não "pula" de dia; os textos saem em Brasília.
 */
export function calcularMulta(params: {
  consulta: { status: string; dataInicio: Date; valor: number; pago: boolean };
  eventos: EventoParaMulta[];
  por: PorEvento;
  agora?: Date;
}): PreviaMulta {
  const { consulta, eventos, por } = params;
  const agora = params.agora ?? new Date();
  const valorCentavos = reaisParaCentavos(consulta.valor);
  const dataOriginal = dataOriginalParaMulta(eventos, consulta.dataInicio);
  const semMultaAte = new Date(dataOriginal.getTime() - MULTA_JANELA_HORAS * 3_600_000);

  let isencao: PreviaMulta["isencao"] = null;
  if (por !== "paciente") isencao = "nao_e_paciente";
  else if (consulta.status === "aguardando_reagendamento") isencao = "aguardando_reagendamento";
  else if (agora.getTime() < semMultaAte.getTime()) isencao = "fora_da_janela";

  // Só há o que cobrar se o paciente pagou: a multa sai do valor devolvido.
  const multaCentavos = isencao || !consulta.pago ? 0 : pct(valorCentavos, MULTA_PCT);
  return {
    multaCentavos,
    reembolsoCentavos: consulta.pago ? valorCentavos - multaCentavos : 0,
    valorCentavos,
    pago: consulta.pago,
    dataOriginal: dataOriginal.toISOString(),
    semMultaAte: semMultaAte.toISOString(),
    semMultaAteTexto: quandoClinica(semMultaAte),
    isencao,
  };
}

/* ---------- Gravação (sempre dentro da transação da Consulta) ------ */

export async function registrarEvento(
  tx: Prisma.TransactionClient,
  evento: {
    consultaId: string;
    tipo: TipoEvento;
    por: PorEvento;
    atorId?: string | null;
    dataAnterior: Date;
    dataNova?: Date | null;
    motivo: MotivoEvento;
    multaCentavos?: number | null;
  },
) {
  return tx.eventoConsulta.create({ data: { ...evento, atorId: evento.atorId ?? null, dataNova: evento.dataNova ?? null } });
}

/**
 * Cria o reembolso do pagamento confirmado da consulta, se houver.
 * Idempotente: se já existe um reembolso ATIVO para o pagamento, devolve o
 * existente (o índice único parcial na migração garante o mesmo no banco).
 * O envio ao gateway fica com o módulo de pagamentos (status → processado).
 */
export async function criarReembolsoSeDevido(
  tx: Prisma.TransactionClient,
  params: { consultaId: string; valorCentavos: number; multaCentavos: number; motivo: MotivoEvento; solicitadoPor: string },
) {
  if (params.valorCentavos <= 0) return null;
  const pagamento = await tx.pagamento.findUnique({ where: { consultaId: params.consultaId } });
  if (!pagamento || pagamento.status !== "confirmado") return null;
  const ativo = await tx.reembolso.findFirst({
    where: { pagamentoId: pagamento.id, status: { in: REEMBOLSO_STATUS_ATIVOS } },
  });
  if (ativo) return ativo;
  return tx.reembolso.create({
    data: {
      pagamentoId: pagamento.id,
      valorCentavos: params.valorCentavos,
      multaCentavos: params.multaCentavos,
      motivo: params.motivo,
      status: REEMBOLSO_AUTOMATICO ? "aprovado" : "solicitado",
      solicitadoPor: params.solicitadoPor,
    },
  });
}

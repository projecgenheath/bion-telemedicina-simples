import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { partesNoFuso, quandoClinica } from "@/lib/server/fuso";
import {
  chaveTravaDia,
  consultaEmHorarioVedado,
  diaBloqueado,
  diaIsoSaoPaulo,
  ERRO_DIA_BLOQUEADO,
  ERRO_HORARIO_VEDADO,
  OPCOES_TX_TRAVA,
  travarDiaIso,
  type ClienteBanco,
} from "@/lib/server/bloqueio-agenda";
import { REEMBOLSO_MANUAL_PRAZO_DIAS, parseDataHora, prazoReembolsoManual } from "@/lib/server/dados";

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
/**
 * Remarcação com multa: o paciente paga a multa pelo app e a nova data só vale
 * depois do pagamento aprovado. Enquanto isso o novo horário fica reservado
 * por este tempo; depois expira e o horário volta a ficar livre.
 */
export const RESERVA_REMARCACAO_MIN = 15;

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
export const REEMBOLSO_STATUS_ATIVOS = ["em_analise", "solicitado", "aprovado", "processado"];
/** Prazo (dias corridos depois da consulta) para pedir reembolso de uma falta (definido em dados.ts). */
export { REEMBOLSO_MANUAL_PRAZO_DIAS };
/** Tamanho aceito da justificativa do pedido manual. */
export const JUSTIFICATIVA_MIN = 10;
export const JUSTIFICATIVA_MAX = 1000;

export type PorEvento = "paciente" | "medico" | "sistema" | "admin";
export type TipoEvento = "cancelada" | "remarcada" | "falha_tecnica" | "falta_paciente";
/** reagendamento: paciente escolheu nova data para consulta em aguardando_reagendamento (sem multa; recomeça a contagem). */
export type MotivoEvento =
  | "pedido_paciente"
  | "agenda_cancelada"
  | "falha_tecnica"
  | "admin"
  | "reagendamento"
  | "falta_paciente"
  | "falta_medico";

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

type EventoParaMulta = { por: string; em: Date; dataAnterior: Date; motivo?: string };

/**
 * Data que vale para a janela da multa.
 * Com MULTA_RECOMECA_APOS_EVENTO_NAO_PACIENTE: a data que estava marcada na
 * 1ª mudança do paciente depois do último evento que não foi do paciente.
 * O reagendamento (paciente escolhe data depois de o médico/sistema cancelar)
 * também recomeça a contagem: a referência passa a ser a data escolhida nele.
 * Sem evento que se aplique: a data atual da consulta.
 */
export function dataOriginalParaMulta(eventos: EventoParaMulta[], dataAtual: Date): Date {
  if (!MULTA_CONTA_DATA_ORIGINAL) return dataAtual;
  const ordenados = [...eventos].sort((a, b) => a.em.getTime() - b.em.getTime());
  if (!MULTA_RECOMECA_APOS_EVENTO_NAO_PACIENTE) return ordenados[0]?.dataAnterior ?? dataAtual;
  let inicio = 0;
  ordenados.forEach((e, i) => {
    if (e.por !== "paciente" || e.motivo === "reagendamento") inicio = i + 1;
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
  params: {
    consultaId: string;
    valorCentavos: number;
    multaCentavos: number;
    motivo: MotivoEvento | "multa_remarcacao_nao_aplicada";
    solicitadoPor: string;
  },
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

/* ---------- Falha técnica (detectada pelo sistema) ---------------- */
// Regra do Alisson: falha técnica não tem multa e segue o mesmo caminho do
// cancelamento pelo médico. Consulta paga vai para "aguardando_reagendamento"
// (o paciente escolhe reembolso integral ou remarcar sem multa); sem
// pagamento confirmado, vai para "cancelada". Nenhum reembolso é criado aqui:
// ele nasce quando o paciente escolhe "Reembolso integral" no cartão.

/* ---------- Desfecho da consulta (a consulta aconteceu?) ----------- */
// "Desfecho" é o que a sala/agenda do médico (feat/medico-falta-falha-sala),
// a verificação de presença e o admin gravam para dizer o que aconteceu:
//  - realizada: status "concluida" (o médico concluiu);
//  - falta_paciente: EventoConsulta tipo "falta_paciente" (status não muda);
//  - falha_tecnica / falta_medico: EventoConsulta tipo "falha_tecnica"
//    (motivo "falha_tecnica" | "falta_medico"); paga → aguardando_reagendamento,
//    não paga → cancelada.
// O evento só vale se NÃO foi corrigido pelo admin (corrigidoEm nulo) e se é
// da data ATUAL da consulta (dataAnterior = dataInicio): depois de uma falha
// técnica o paciente pode remarcar, e o evento antigo é da data antiga.
// "Sem desfecho": status ainda "ia acontecer" (STATUS_ABERTOS) e nenhum
// evento vigente da data atual. O fechamento do repasse deixa essas de fora
// (entram no fechamento seguinte ao desfecho) e a Fila do admin mostra as que
// estão assim há mais de 24 h.

/** Status em que a consulta ainda "ia acontecer" (mesma lista de STATUS_AVALIAVEIS da presença). */
export const STATUS_ABERTOS = ["confirmada", "em_espera", "pendente_anamnese"];
/** Tipos de EventoConsulta que são desfecho. */
export const TIPOS_EVENTO_DESFECHO = ["falta_paciente", "falha_tecnica"];
/** Filtro Prisma: evento ainda vale (não foi corrigido pelo admin). */
export const EVENTO_VIGENTE = { corrigidoEm: null } as const;
/** Sem desfecho há mais que isto: aparece na Fila do admin. */
export const SEM_DESFECHO_FILA_HORAS = 24;

export type Desfecho = "realizada" | "falta_paciente" | "falha_tecnica" | "falta_medico";
export type DesfechoAtual = Desfecho | "sem_desfecho" | "encerrada";

export const ROTULO_DESFECHO: Record<DesfechoAtual, string> = {
  realizada: "Realizada",
  falta_paciente: "Falta do paciente",
  falha_tecnica: "Falha técnica",
  falta_medico: "Falta do médico",
  sem_desfecho: "Sem desfecho",
  encerrada: "Cancelada/remarcada (sem desfecho de sala)",
};

export type EventoDesfechoMin = {
  id?: string;
  tipo: string;
  motivo: string;
  em?: Date;
  dataAnterior: Date;
  corrigidoEm?: Date | null;
};

/** Evento de desfecho que vale para a data atual (o mais recente), ou null. */
export function eventoDesfechoVigente<E extends EventoDesfechoMin>(dataInicio: Date, eventos: E[] | null | undefined): E | null {
  const validos = (eventos ?? []).filter(
    (e) => TIPOS_EVENTO_DESFECHO.includes(e.tipo) && !e.corrigidoEm && e.dataAnterior.getTime() === dataInicio.getTime(),
  );
  validos.sort((a, b) => (b.em?.getTime() ?? 0) - (a.em?.getTime() ?? 0));
  return validos[0] ?? null;
}

/** Desfecho da consulta (PURA): ver o bloco acima. */
export function desfechoDaConsulta(c: { status: string; dataInicio: Date; eventos?: EventoDesfechoMin[] | null }): DesfechoAtual {
  const ev = eventoDesfechoVigente(c.dataInicio, c.eventos);
  if (ev) return ev.tipo === "falta_paciente" ? "falta_paciente" : ev.motivo === "falta_medico" ? "falta_medico" : "falha_tecnica";
  if (c.status === "concluida") return "realizada";
  if (STATUS_ABERTOS.includes(c.status)) return "sem_desfecho";
  return "encerrada";
}

/** O médico recebe por este desfecho (consulta paga)? Realizada e falta do paciente: sim. */
export const medicoRecebe = (d: DesfechoAtual) => d === "realizada" || d === "falta_paciente";

/**
 * Falha técnica (ou falta do médico, com `motivo: "falta_medico"`): paga vai
 * para aguardando_reagendamento, não paga é cancelada. Idempotente: não faz
 * nada se a consulta já tiver falta_paciente ou falha_tecnica VIGENTE (os
 * corrigidos pelo admin não contam), ou se já estiver encerrada.
 * Quem grava: `por` = "sistema" (padrão, atorId nulo), "medico" (rota do
 * desfecho do médico: `{ motivo, por: "medico", atorId }`) ou "admin"
 * (correção de desfecho).
 */
export async function aplicarFalhaTecnica(
  tx: Prisma.TransactionClient,
  consultaId: string,
  opcoes: { motivo?: "falha_tecnica" | "falta_medico"; por?: "sistema" | "medico" | "admin"; atorId?: string | null } = {},
) {
  const motivo = opcoes.motivo ?? "falha_tecnica";
  const por = opcoes.por ?? "sistema";
  const atorId = por === "sistema" ? null : (opcoes.atorId ?? null);
  const consulta = await tx.consulta.findUnique({
    where: { id: consultaId },
    select: { id: true, status: true, pago: true, dataInicio: true },
  });
  if (!consulta) return null;
  const jaTem = await tx.eventoConsulta.findFirst({
    where: { consultaId, tipo: { in: TIPOS_EVENTO_DESFECHO }, ...EVENTO_VIGENTE },
    select: { id: true },
  });
  if (jaTem) return null;
  const novoStatus = consulta.pago ? "aguardando_reagendamento" : "cancelada";
  const motivoTexto =
    motivo === "falta_medico" ? "O médico não compareceu à consulta" : "Falha técnica: a consulta não aconteceu";
  // Atômico: se outra requisição encerrou a consulta no meio, não faz nada.
  const { count } = await tx.consulta.updateMany({
    where: { id: consultaId, status: { notIn: ["cancelada", "concluida", "aguardando_reagendamento"] } },
    data: novoStatus === "cancelada" ? { status: novoStatus, motivoCancelamento: motivoTexto } : { status: novoStatus },
  });
  if (count === 0) return null;
  const evento = await registrarEvento(tx, {
    consultaId,
    tipo: "falha_tecnica",
    por,
    atorId,
    dataAnterior: consulta.dataInicio,
    motivo,
    multaCentavos: 0,
  });
  await cancelarReservasPendentes(tx, consultaId);
  return { status: novoStatus, evento };
}

/* ---------- Reembolso manual (falta do paciente) ------------------- */
// Regras do Alisson (01/10): na falta não há reembolso automático e o médico
// recebe; o paciente pode pedir em até REEMBOLSO_MANUAL_PRAZO_DIAS com
// justificativa, e o admin aprova ou nega (negado é definitivo). Aprovado:
// a consulta sai do repasse — o médico devolve a parte dele e o app os 10%.

/** Até quando o paciente pode pedir reembolso de uma falta. */
export { prazoReembolsoManual };

type ReembolsoManualRow = {
  id: string;
  status: string;
  valorCentavos: number;
  justificativa: string | null;
  respostaAdmin: string | null;
  criadoEm: Date;
  decididoEm: Date | null;
};

export function reembolsoManualWire(r: ReembolsoManualRow) {
  return {
    id: r.id,
    status: r.status,
    valorCentavos: r.valorCentavos,
    justificativa: r.justificativa ?? "",
    respostaAdmin: r.respostaAdmin,
    criadoEm: r.criadoEm.toISOString(),
    decididoEm: r.decididoEm ? r.decididoEm.toISOString() : null,
  };
}

type Falha = { ok: false; erro: string; status: number };

/** Paciente pede reembolso de uma consulta marcada como falta. */
export async function pedirReembolsoManual(params: {
  consultaId: string;
  pacienteId: string;
  justificativa: string;
  agora?: Date;
}): Promise<{ ok: true; reembolso: ReembolsoManualRow } | Falha> {
  const agora = params.agora ?? new Date();
  const justificativa = params.justificativa.trim();
  if (justificativa.length < JUSTIFICATIVA_MIN || justificativa.length > JUSTIFICATIVA_MAX) {
    return {
      ok: false,
      erro: `Escreva uma justificativa entre ${JUSTIFICATIVA_MIN} e ${JUSTIFICATIVA_MAX} caracteres.`,
      status: 400,
    };
  }
  const consulta = await db.consulta.findUnique({
    where: { id: params.consultaId },
    include: {
      pagamento: true,
      eventos: { where: { tipo: { in: TIPOS_EVENTO_DESFECHO }, ...EVENTO_VIGENTE }, select: { tipo: true, motivo: true, em: true, dataAnterior: true } },
    },
  });
  if (!consulta) return { ok: false, erro: "Consulta não encontrada.", status: 404 };
  if (consulta.pacienteId !== params.pacienteId) return { ok: false, erro: "Acesso negado.", status: 403 };
  // Só a falta VIGENTE da data atual (a corrigida pelo admin não vale).
  if (desfechoDaConsulta(consulta) !== "falta_paciente") {
    return { ok: false, erro: "O reembolso pelo app é só para consultas marcadas como falta.", status: 409 };
  }
  const pagamento = consulta.pagamento;
  if (!consulta.pago || !pagamento || pagamento.status !== "confirmado") {
    return { ok: false, erro: "Esta consulta não tem pagamento confirmado.", status: 409 };
  }
  if (agora.getTime() > prazoReembolsoManual(consulta.dataInicio).getTime()) {
    return {
      ok: false,
      erro: `O prazo de ${REEMBOLSO_MANUAL_PRAZO_DIAS} dias para pedir reembolso já terminou.`,
      status: 409,
    };
  }
  const existente = await db.reembolso.findFirst({
    where: {
      pagamentoId: pagamento.id,
      OR: [{ origem: "manual" }, { status: { in: REEMBOLSO_STATUS_ATIVOS } }],
    },
  });
  if (existente) {
    return { ok: false, erro: "Já existe um pedido de reembolso para esta consulta.", status: 409 };
  }
  const criado = await db.reembolso
    .create({
      data: {
        pagamentoId: pagamento.id,
        valorCentavos: reaisParaCentavos(pagamento.valor),
        multaCentavos: 0,
        motivo: "falta_paciente",
        status: "em_analise",
        origem: "manual",
        justificativa,
        solicitadoPor: params.pacienteId,
      },
    })
    .catch((e: unknown) => {
      // Clique duplo: os índices únicos parciais barram o 2º pedido.
      if ((e as { code?: string }).code === "P2002") return null;
      throw e;
    });
  if (!criado) return { ok: false, erro: "Já existe um pedido de reembolso para esta consulta.", status: 409 };
  return { ok: true, reembolso: criado };
}

/** Admin aprova ou nega um pedido manual em análise. */
export async function decidirReembolsoManual(params: {
  reembolsoId: string;
  adminId: string;
  decisao: "aprovar" | "negar";
  resposta?: string;
}): Promise<{ ok: true; reembolso: ReembolsoManualRow & { pagamentoId: string | null } } | Falha> {
  const resposta = (params.resposta ?? "").trim().slice(0, JUSTIFICATIVA_MAX);
  if (params.decisao === "negar" && resposta.length < JUSTIFICATIVA_MIN) {
    return { ok: false, erro: "Para negar, explique o motivo ao paciente (mínimo de 10 caracteres).", status: 400 };
  }
  // updateMany com status no where: duas decisões ao mesmo tempo não passam.
  const res = await db.reembolso.updateMany({
    where: { id: params.reembolsoId, origem: "manual", status: "em_analise" },
    data: {
      status: params.decisao === "aprovar" ? "aprovado" : "negado",
      respostaAdmin: resposta || null,
      decididoPor: params.adminId,
      decididoEm: new Date(),
    },
  });
  const r = await db.reembolso.findUnique({ where: { id: params.reembolsoId } });
  if (!r || r.origem !== "manual") return { ok: false, erro: "Pedido de reembolso não encontrado.", status: 404 };
  if (res.count === 0) return { ok: false, erro: "Este pedido já foi decidido.", status: 409 };
  return { ok: true, reembolso: r };
}

/* ---------- Remarcação com multa (reserva + cobrança) -------------- */

type ReservaMin = { status: string; expiraEm: Date };

/** Reserva que ainda segura o horário (pendente e dentro do prazo). */
export function reservaVigente(r: ReservaMin, agora: Date = new Date()): boolean {
  return r.status === "pendente" && r.expiraEm.getTime() > agora.getTime();
}

/** Filtro Prisma das reservas vigentes. */
export function filtroReservaVigente(agora: Date = new Date()) {
  return { status: "pendente", expiraEm: { gt: agora } } as const;
}

/**
 * Há uma reserva vigente de OUTRA consulta do mesmo médico neste horário?
 * Usado na checagem de conflito ao agendar e ao remarcar.
 */
export async function horarioReservado(
  medicoId: string,
  dataInicio: Date,
  excetoConsultaId?: string,
  client: ClienteBanco = db,
) {
  const r = await client.remarcacaoPendente.findFirst({
    where: {
      ...filtroReservaVigente(),
      novaData: dataInicio,
      consulta: { medicoId, ...(excetoConsultaId ? { id: { not: excetoConsultaId } } : {}) },
    },
    select: { id: true },
  });
  return !!r;
}

/**
 * Cancela, na transação da Consulta, a reserva pendente dela (cancelamento
 * por qualquer pessoa ou remarcação pelo admin). O polling do paciente vê
 * "cancelada" e o horário reservado é liberado na hora.
 */
export async function cancelarReservasPendentes(tx: Prisma.TransactionClient, consultaId: string) {
  return tx.remarcacaoPendente.updateMany({ where: { consultaId, status: "pendente" }, data: { status: "cancelada" } });
}

/** Início e fim (exclusivo) do dia civil em São Paulo (UTC-3, sem horário de verão) que contém `d`. */
export function diaSaoPaulo(d: Date): { inicio: Date; fim: Date } {
  const OFFSET = 3 * 3600_000;
  const local = new Date(d.getTime() - OFFSET);
  const inicio = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + OFFSET);
  return { inicio, fim: new Date(inicio.getTime() + 24 * 3600_000) };
}

/**
 * Médico cancelou a agenda do dia: reservas pendentes de OUTRAS consultas dele
 * cuja novaData cai nesse dia também caem (senão o pagamento aprovado depois
 * moveria a consulta para um dia que o médico cancelou).
 */
export async function cancelarReservasDoDia(tx: Prisma.TransactionClient, medicoId: string, dia: Date) {
  const { inicio, fim } = diaSaoPaulo(dia);
  return tx.remarcacaoPendente.updateMany({
    where: { status: "pendente", novaData: { gte: inicio, lt: fim }, consulta: { medicoId } },
    data: { status: "cancelada" },
  });
}

export function remarcacaoWire(r: {
  id: string;
  novaData: Date;
  multaCentavos: number;
  status: string;
  metodo: string;
  via: string | null;
  expiraEm: Date;
  criadoEm: Date;
  aprovadoEm: Date | null;
}) {
  const agora = new Date();
  // Expiração verificada na leitura: passou do prazo = expirada.
  const status = r.status === "pendente" && !reservaVigente(r, agora) ? "expirada" : r.status;
  return {
    id: r.id,
    novaData: r.novaData.toISOString(),
    novaDataTexto: quandoClinica(r.novaData),
    multaCentavos: r.multaCentavos,
    status,
    metodo: r.metodo,
    via: r.via,
    expiraEm: r.expiraEm.toISOString(),
    criadoEm: r.criadoEm.toISOString(),
    aprovadoEm: r.aprovadoEm?.toISOString() ?? null,
  };
}

/**
 * Multa da remarcação APROVADA pelo gateway (webhook) ou pelo modo simulado.
 * Idempotente. Numa transação só:
 * - reserva vigente → consulta muda para novaData, EventoConsulta "remarcada"
 *   por paciente com a multa, reserva "aprovada";
 * - reserva já cancelada/expirada ou consulta encerrada → a consulta NÃO se
 *   move e a multa paga volta automaticamente como Reembolso.
 * Também recusa (e devolve a multa) se o horário foi ocupado no meio tempo.
 */
export async function aprovarMultaRemarcacao(remarcacaoId: string, via: "webhook" | "simulado", gatewayRef?: string) {
  return db.$transaction(async (tx) => {
    // Trava o dia novo e o dia atual do médico ANTES de ler o estado: um
    // bloqueio do dia (ou outro agendamento) não intercala com a aplicação.
    const alvo = await tx.remarcacaoPendente.findUnique({
      where: { id: remarcacaoId },
      select: { novaData: true, consulta: { select: { medicoId: true, dataInicio: true } } },
    });
    if (!alvo) return null;
    await travarDias(tx, [
      { medicoId: alvo.consulta.medicoId, instante: alvo.novaData },
      { medicoId: alvo.consulta.medicoId, instante: alvo.consulta.dataInicio },
    ]);
    const r = await tx.remarcacaoPendente.findUnique({ where: { id: remarcacaoId }, include: { consulta: true } });
    if (!r) return null;
    if (r.status === "aprovada") return { remarcacao: r, aplicada: true, jaProcessada: true };
    const agora = new Date();
    const c = r.consulta;
    const encerrada = c.status === "cancelada" || c.status === "concluida" || c.status === "aguardando_reagendamento";
    let aplicavel = (r.status === "pendente" || r.status === "expirada") && reservaVigente({ ...r, status: "pendente" }, agora) && !encerrada;
    if (aplicavel) {
      const ocupado = await tx.consulta.findFirst({
        where: { id: { not: c.id }, medicoId: c.medicoId, dataInicio: r.novaData, status: { notIn: STATUS_LIBERAM_HORARIO } },
        select: { id: true },
      });
      if (ocupado) aplicavel = false;
    }
    // Dia bloqueado pelo médico depois da reserva: não move; a multa volta (caminho abaixo).
    if (aplicavel && (await diaBloqueado(tx, c.medicoId, r.novaData))) aplicavel = false;
    // Horário novo em 23:00–00:00 (São Paulo): mesmo caminho — não move, a multa volta.
    if (aplicavel && consultaEmHorarioVedado(r.novaData)) aplicavel = false;

    if (aplicavel) {
      await tx.consulta.update({ where: { id: c.id }, data: { dataInicio: r.novaData, remarcada: true } });
      await registrarEvento(tx, {
        consultaId: c.id,
        tipo: "remarcada",
        por: "paciente",
        atorId: r.solicitadoPor,
        dataAnterior: c.dataInicio,
        dataNova: r.novaData,
        motivo: "pedido_paciente",
        multaCentavos: r.multaCentavos,
      });
      const atual = await tx.remarcacaoPendente.update({
        where: { id: r.id },
        data: { status: "aprovada", aprovadoEm: agora, via, gatewayRef: gatewayRef ?? r.gatewayRef },
      });
      return { remarcacao: atual, aplicada: true, jaProcessada: false };
    }

    // Pago, mas não dá mais para aplicar: devolve a multa.
    const atual = await tx.remarcacaoPendente.update({
      where: { id: r.id },
      data: {
        status: r.status === "pendente" ? "expirada" : r.status,
        via,
        gatewayRef: gatewayRef ?? r.gatewayRef,
      },
    });
    const existente = await tx.reembolso.findUnique({ where: { remarcacaoId: r.id } });
    if (!existente) {
      await tx.reembolso.create({
        data: {
          remarcacaoId: r.id,
          valorCentavos: r.multaCentavos,
          multaCentavos: 0,
          motivo: "multa_remarcacao_nao_aplicada",
          status: REEMBOLSO_AUTOMATICO ? "aprovado" : "solicitado",
          solicitadoPor: "sistema",
        },
      });
    }
    return { remarcacao: atual, aplicada: false, jaProcessada: false };
  }, OPCOES_TX_TRAVA);
}

/** Gateway reportou falha na multa: a consulta fica na data original. */
export async function falharMultaRemarcacao(remarcacaoId: string, via: "webhook" | "simulado") {
  const r = await db.remarcacaoPendente.findUnique({ where: { id: remarcacaoId } });
  if (!r || r.status !== "pendente") return r;
  return db.remarcacaoPendente.update({ where: { id: r.id }, data: { status: "falhou", via } });
}

/**
 * Valida a nova data/hora de uma remarcação (mesma regra para o PATCH
 * "remarcar" e para a remarcação com multa): antecedência de 20 min, grade do
 * médico, dia bloqueado pelo médico, janela vedada 23:00–00:00 (São Paulo),
 * consulta que ocupa o horário e reserva vigente de outra consulta.
 */
export async function validarNovoHorario(
  consulta: { id: string; medicoId: string },
  data: string | undefined,
  hora: string | undefined,
): Promise<{ ok: true; dataInicio: Date } | { ok: false; erro: string; status: number }> {
  if (!data || !hora) return { ok: false, erro: "Informe a nova data e horário.", status: 400 };
  const dataInicio = parseDataHora(data, hora);
  if (dataInicio.getTime() < Date.now() + 20 * 60_000) {
    return { ok: false, erro: "Escolha um horário com pelo menos 20 minutos de antecedência.", status: 400 };
  }
  const perfilMedico = await db.perfilMedico.findUnique({ where: { userId: consulta.medicoId } });
  let grade: string[] = [];
  try {
    grade = JSON.parse(perfilMedico?.horariosDisponiveis || "[]") as string[];
  } catch {
    grade = [];
  }
  if (grade.length && !grade.includes(hora)) {
    return { ok: false, erro: "Esse horário não faz parte da agenda do médico.", status: 400 };
  }
  // Dia inteiro bloqueado pelo médico (folga/férias) — antes da checagem de conflito.
  if (await diaBloqueado(db, consulta.medicoId, dataInicio)) {
    return { ok: false, erro: ERRO_DIA_BLOQUEADO, status: 409 };
  }
  // Sem teleconsulta entre 23:00 e 00:00 (São Paulo).
  if (consultaEmHorarioVedado(dataInicio)) {
    return { ok: false, erro: ERRO_HORARIO_VEDADO, status: 409 };
  }
  const conflito = await db.consulta.findFirst({
    where: {
      id: { not: consulta.id },
      medicoId: consulta.medicoId,
      status: { notIn: STATUS_LIBERAM_HORARIO },
      dataInicio,
    },
    select: { id: true },
  });
  if (conflito || (await horarioReservado(consulta.medicoId, dataInicio, consulta.id))) {
    return { ok: false, erro: ERRO_HORARIO_OCUPADO, status: 409 };
  }
  return { ok: true, dataInicio };
}

/* ------------------------------------------------------------------ */
/* Trava (médico, dia) nos caminhos que mudam a data de uma consulta    */
/* ------------------------------------------------------------------ */

export const ERRO_HORARIO_OCUPADO = "Esse horário já está ocupado na agenda do médico.";
export const ERRO_PACIENTE_OCUPADO = "O paciente já tem outra consulta nesse horário.";
export const ERRO_CONSULTA_MUDOU =
  "A consulta foi alterada por outra pessoa enquanto você salvava. Atualize a tela e tente de novo.";

/** Horário indisponível visto DENTRO da transação travada: desfaz tudo e vira resposta HTTP. */
export class HorarioIndisponivel extends Error {
  constructor(
    message: string,
    readonly status: number = 409,
  ) {
    super(message);
    this.name = "HorarioIndisponivel";
  }
}

/**
 * Toma a trava (médico, dia de São Paulo) de cada alvo — a mesma do
 * agendamento e do bloqueio do dia (bloqueio-agenda.ts) —, sem repetir e em
 * ordem fixa da chave. Quem pega mais de um dia sempre pega na mesma ordem e
 * as outras rotas pegam um dia só, então não há espera em ciclo (deadlock).
 * Chame no começo da transação, antes de ler o estado que será conferido.
 */
export async function travarDias(tx: Prisma.TransactionClient, alvos: { medicoId: string; instante: Date }[]) {
  const porChave = new Map<string, { medicoId: string; dia: string }>();
  for (const a of alvos) {
    const dia = diaIsoSaoPaulo(a.instante);
    porChave.set(chaveTravaDia(a.medicoId, dia), { medicoId: a.medicoId, dia });
  }
  for (const chave of [...porChave.keys()].sort()) {
    const { medicoId, dia } = porChave.get(chave)!;
    await travarDiaIso(tx, medicoId, dia);
  }
}

/**
 * Confere o horário DENTRO da transação, depois de `travarDias`: dia
 * bloqueado, janela vedada 23:00–00:00 (São Paulo), outra consulta do
 * médico, reserva vigente de outra consulta e,
 * com `pacienteId`, outra consulta do paciente. Devolve a mensagem de erro
 * (409) ou null quando o horário está livre.
 */
export async function conferirHorarioNaTransacao(
  tx: Prisma.TransactionClient,
  p: { consultaId: string; medicoId: string; dataInicio: Date; pacienteId?: string },
): Promise<string | null> {
  if (await diaBloqueado(tx, p.medicoId, p.dataInicio)) return ERRO_DIA_BLOQUEADO;
  if (consultaEmHorarioVedado(p.dataInicio)) return ERRO_HORARIO_VEDADO;
  const choqueMedico = await tx.consulta.findFirst({
    where: { id: { not: p.consultaId }, medicoId: p.medicoId, dataInicio: p.dataInicio, status: { notIn: STATUS_LIBERAM_HORARIO } },
    select: { id: true },
  });
  if (choqueMedico || (await horarioReservado(p.medicoId, p.dataInicio, p.consultaId, tx))) return ERRO_HORARIO_OCUPADO;
  if (p.pacienteId) {
    const choquePaciente = await tx.consulta.findFirst({
      where: { id: { not: p.consultaId }, pacienteId: p.pacienteId, dataInicio: p.dataInicio, status: { notIn: STATUS_LIBERAM_HORARIO } },
      select: { id: true },
    });
    if (choquePaciente) return ERRO_PACIENTE_OCUPADO;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Correção de desfecho pelo ADMIN (regras do Alisson, 06/10/2026)      */
/*                                                                      */
/* Só o admin corrige o desfecho que o sistema ou o médico marcou, e    */
/* também dá desfecho a uma consulta que ficou sem (Fila > 24 h).       */
/*  - o evento antigo NÃO é apagado: fica marcado como corrigido         */
/*    (corrigidoEm, corrigidoPorId, motivoCorrecao) e deixa de valer;    */
/*  - o desfecho novo é gravado com por = "admin";                       */
/*  - repasse fechado/pago NÃO reabre: o que o médico recebeu a mais vira */
/*    desconto no próximo repasse pelo mecanismo de sempre (reembolso    */
/*    efetivo depois do item → RepasseAjuste); o que ele passa a receber */
/*    entra no próximo fechamento (a consulta ainda não tem item);       */
/*  - reembolso pendente (em_analise/solicitado) é encerrado (status     */
/*    "negado" com a explicação — a trava do banco não tem "cancelado"); */
/*    reembolso aprovado/processado → recusa (o dinheiro já voltou);     */
/*  - notifica o paciente (e o médico quando muda o que ele recebe);     */
/*  - AuditLog com antes/depois; tudo numa transação, idempotente.       */
/* ------------------------------------------------------------------ */

export const DESFECHOS_ALVO: Desfecho[] = ["realizada", "falta_paciente", "falha_tecnica", "falta_medico"];
export const MOTIVO_CORRECAO_MIN = 10;
export const MOTIVO_CORRECAO_MAX = 1000;
const REEMBOLSO_PENDENTE = ["em_analise", "solicitado"];
const REEMBOLSO_JA_EFETIVO = ["aprovado", "processado"];

export type EstadoCorrecao = {
  consulta: {
    id: string;
    pacienteId: string;
    medicoId: string;
    especialidade: string;
    dataInicio: Date;
    status: string;
    pago: boolean;
    valor: number;
    motivoCancelamento: string | null;
  };
  /** Todos os eventos da consulta (para saber se algo aconteceu depois do desfecho). */
  eventos: { id: string; tipo: string; motivo: string; por: string; em: Date; dataAnterior: Date; corrigidoEm: Date | null }[];
  pagamento: { id: string; status: string } | null;
  reembolsos: { id: string; status: string; origem: string; valorCentavos: number }[];
  /** Repasse em que a consulta já entrou (item "consulta"), se houver. */
  repasse: { id: string; competencia: string; status: string } | null;
};

export type EfeitoDinheiro = "sem_pagamento" | "nenhum" | "entra_no_proximo_repasse" | "sai_do_repasse" | "desconto_se_reembolso";

export type PlanoCorrecao = {
  atual: DesfechoAtual;
  novo: Desfecho;
  statusAntes: string;
  statusDepois: string;
  eventoCorrigidoId: string | null;
  reembolsosEncerrados: { id: string; status: string; valorCentavos: number }[];
  dinheiro: {
    efeito: EfeitoDinheiro;
    pagoConfirmado: boolean;
    valorCentavos: number;
    /** Parte do médico (valor − 10%), o que entra ou sai do repasse. */
    liquidoMedicoCentavos: number;
    medicoRecebiaAntes: boolean;
    medicoRecebeDepois: boolean;
    repasse: { id: string; competencia: string; status: string } | null;
  };
  /** Frases da prévia (o que vai acontecer), em ordem. */
  efeitos: string[];
  notificarMedico: boolean;
};

type FalhaCorrecao = { ok: false; erro: string; status: number };

const brlCentavos = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diaBr = (iso: string) => iso.split("-").reverse().join("/");

/** Status depois da correção (a falha passa por aplicarFalhaTecnica, que decide pelo `pago`). */
function statusDepoisDe(novo: Desfecho, c: EstadoCorrecao["consulta"]): string {
  if (novo === "realizada") return "concluida";
  if (novo === "falta_paciente") return STATUS_ABERTOS.includes(c.status) ? c.status : "confirmada";
  return c.pago ? "aguardando_reagendamento" : "cancelada";
}

/**
 * Plano da correção (PURA, testada): o que muda, o efeito no dinheiro e as
 * recusas. A prévia da tela e a gravação usam o MESMO plano.
 */
export function planejarCorrecaoDesfecho(e: EstadoCorrecao, novo: Desfecho, agora: Date = new Date()): { ok: true; plano: PlanoCorrecao } | FalhaCorrecao {
  const c = e.consulta;
  if (!DESFECHOS_ALVO.includes(novo)) return { ok: false, erro: "Desfecho inválido.", status: 400 };
  if (c.dataInicio.getTime() > agora.getTime()) {
    return { ok: false, erro: "A consulta ainda não começou: não há desfecho para corrigir.", status: 409 };
  }
  const atual = desfechoDaConsulta({ status: c.status, dataInicio: c.dataInicio, eventos: e.eventos });
  if (atual === "encerrada") {
    return {
      ok: false,
      erro: "Esta consulta foi cancelada ou aguarda reagendamento por outro motivo (não por falta ou falha técnica): não há desfecho para corrigir.",
      status: 409,
    };
  }
  if (atual === novo) return { ok: false, erro: `A consulta já está como "${ROTULO_DESFECHO[novo]}".`, status: 409 };

  const evento = eventoDesfechoVigente(c.dataInicio, e.eventos);
  // Algo aconteceu DEPOIS do desfecho (o paciente cancelou pela escolha de
  // reembolso, o admin cancelou/remarcou): corrigir exigiria desfazer isso.
  if (evento?.em) {
    const depois = e.eventos.find(
      (x) => x.id !== evento.id && !TIPOS_EVENTO_DESFECHO.includes(x.tipo) && x.em.getTime() > evento.em.getTime(),
    );
    if (depois) {
      const quem = depois.por === "paciente" ? "pelo paciente" : depois.por === "admin" ? "pela administração" : depois.por === "medico" ? "pelo médico" : "pelo sistema";
      return {
        ok: false,
        erro: `Depois do desfecho, a consulta foi ${depois.tipo === "remarcada" ? "remarcada" : "cancelada"} ${quem}. Corrigir agora exigiria desfazer isso: não é feito pelo app.`,
        status: 409,
      };
    }
  }
  const efetivo = e.reembolsos.find((r) => REEMBOLSO_JA_EFETIVO.includes(r.status));
  if (efetivo) {
    return {
      ok: false,
      erro: `Esta consulta já tem reembolso ${efetivo.status === "processado" ? "processado" : "aprovado"} (${brlCentavos(efetivo.valorCentavos)}): o dinheiro já voltou ao paciente e a consulta já saiu do repasse. A correção não é feita pelo app.`,
      status: 409,
    };
  }
  const pendentes = e.reembolsos.filter((r) => REEMBOLSO_PENDENTE.includes(r.status));

  const pagoConfirmado = c.pago && e.pagamento?.status === "confirmado";
  const valorCentavos = reaisParaCentavos(c.valor);
  const liquido = liquidoDaConsulta(valorCentavos, 0).liquidoCentavos;
  const antes = medicoRecebe(atual);
  const depois = medicoRecebe(novo);
  const rep = e.repasse;
  const repTexto = rep ? `o repasse de ${diaBr(rep.competencia)} (${rep.status === "pago" ? "já pago" : "fechado"})` : "";

  let efeito: EfeitoDinheiro;
  const efeitos: string[] = [];
  if (!pagoConfirmado) {
    efeito = "sem_pagamento";
    efeitos.push("Consulta sem pagamento confirmado: nada muda no dinheiro nem no repasse.");
  } else if (depois && rep) {
    efeito = "nenhum";
    efeitos.push(`A consulta já está n${repTexto}: o médico continua com ${brlCentavos(liquido)} e nada muda no repasse.`);
  } else if (depois) {
    efeito = antes ? "nenhum" : "entra_no_proximo_repasse";
    efeitos.push(
      antes
        ? `O médico continua recebendo ${brlCentavos(liquido)} no próximo fechamento (23:30).`
        : `O médico passa a receber ${brlCentavos(liquido)}: a consulta entra no próximo fechamento (23:30).`,
    );
  } else if (rep) {
    efeito = "desconto_se_reembolso";
    efeitos.push(
      `${repTexto.charAt(0).toUpperCase()}${repTexto.slice(1)} não reabre. Se o paciente escolher o reembolso integral, ${brlCentavos(liquido)} viram desconto no próximo repasse do médico; se remarcar, o médico não recebe de novo por esta consulta.`,
    );
  } else {
    efeito = antes ? "sai_do_repasse" : "nenhum";
    efeitos.push(antes ? `Sai do próximo fechamento: o médico deixa de receber ${brlCentavos(liquido)}.` : "O médico não recebe por esta consulta.");
  }

  if (novo === "falha_tecnica" || novo === "falta_medico") {
    efeitos.push(
      c.pago
        ? `Status: aguardando reagendamento. O paciente escolhe no app: remarcar sem custo ou reembolso integral de ${brlCentavos(valorCentavos)}.`
        : "Status: cancelada, sem custo para o paciente.",
    );
  } else if (novo === "falta_paciente") {
    const prazo = prazoReembolsoManual(c.dataInicio);
    if (pagoConfirmado) {
      efeitos.push(
        agora.getTime() <= prazo.getTime()
          ? `O paciente pode pedir reembolso pelo app até ${quandoClinica(prazo)}.`
          : `O prazo de ${REEMBOLSO_MANUAL_PRAZO_DIAS} dias para o paciente pedir reembolso já terminou.`,
      );
    }
  } else {
    efeitos.push("Status: concluída.");
  }
  for (const r of pendentes) {
    efeitos.push(`O pedido de reembolso ${r.status === "em_analise" ? "em análise" : "solicitado"} (${brlCentavos(r.valorCentavos)}) é encerrado: o paciente vê como negado, com a explicação.`);
  }
  if (evento) efeitos.push(`O registro "${ROTULO_DESFECHO[atual]}" fica no histórico, marcado como corrigido.`);

  return {
    ok: true,
    plano: {
      atual,
      novo,
      statusAntes: c.status,
      statusDepois: statusDepoisDe(novo, c),
      eventoCorrigidoId: evento?.id ?? null,
      reembolsosEncerrados: pendentes.map((r) => ({ id: r.id, status: r.status, valorCentavos: r.valorCentavos })),
      dinheiro: {
        efeito,
        pagoConfirmado,
        valorCentavos,
        liquidoMedicoCentavos: liquido,
        medicoRecebiaAntes: antes,
        medicoRecebeDepois: depois,
        repasse: rep,
      },
      efeitos,
      notificarMedico: pagoConfirmado && antes !== depois,
    },
  };
}

type ClienteLeitura = Prisma.TransactionClient | typeof db;

/** Lê tudo o que o plano precisa (null = consulta não existe). */
export async function carregarEstadoCorrecao(c: ClienteLeitura, consultaId: string): Promise<EstadoCorrecao | null> {
  const linha = await c.consulta.findUnique({
    where: { id: consultaId },
    select: {
      id: true,
      pacienteId: true,
      medicoId: true,
      especialidade: true,
      dataInicio: true,
      status: true,
      pago: true,
      valor: true,
      motivoCancelamento: true,
      eventos: {
        select: { id: true, tipo: true, motivo: true, por: true, em: true, dataAnterior: true, corrigidoEm: true },
        orderBy: { em: "asc" },
      },
      pagamento: {
        select: { id: true, status: true, reembolsos: { select: { id: true, status: true, origem: true, valorCentavos: true } } },
      },
      repasseItens: {
        where: { tipo: "consulta" },
        select: { repasse: { select: { id: true, competencia: true, status: true } } },
        take: 1,
      },
    },
  });
  if (!linha) return null;
  const { eventos, pagamento, repasseItens, ...consulta } = linha;
  return {
    consulta,
    eventos,
    pagamento: pagamento ? { id: pagamento.id, status: pagamento.status } : null,
    reembolsos: pagamento?.reembolsos ?? [],
    repasse: repasseItens[0]?.repasse ?? null,
  };
}

/** Textos da notificação ao paciente e ao médico (formato do PATCH /api/admin/reembolsos/[id]). */
export function textosNotificacaoCorrecao(e: EstadoCorrecao, plano: PlanoCorrecao, agora: Date = new Date()) {
  const c = e.consulta;
  const quando = quandoClinica(c.dataInicio);
  const troca = `${ROTULO_DESFECHO[plano.atual]} → ${ROTULO_DESFECHO[plano.novo]}`;
  let efeitoPaciente: string;
  if (plano.novo === "falha_tecnica" || plano.novo === "falta_medico") {
    efeitoPaciente = c.pago ? "Escolha no app: remarcar sem custo ou reembolso integral." : "A consulta foi cancelada, sem custo.";
  } else if (plano.novo === "falta_paciente") {
    const prazo = prazoReembolsoManual(c.dataInicio);
    efeitoPaciente = !plano.dinheiro.pagoConfirmado
      ? "A consulta fica registrada como falta."
      : agora.getTime() <= prazo.getTime()
        ? `Se teve um imprevisto, peça o reembolso pelo app até ${quandoClinica(prazo)}.`
        : `O prazo de ${REEMBOLSO_MANUAL_PRAZO_DIAS} dias para pedir reembolso desta consulta já terminou.`;
  } else {
    efeitoPaciente = "A consulta fica registrada como realizada.";
  }
  if (plano.reembolsosEncerrados.length) efeitoPaciente += " Seu pedido de reembolso desta consulta foi encerrado por causa desta correção.";
  const paciente = {
    usuarioId: c.pacienteId,
    tipo: "agenda",
    titulo: "Registro da consulta corrigido",
    texto: `A administração corrigiu o registro da consulta de ${c.especialidade} (${quando}): ${troca}. ${efeitoPaciente}`,
  };
  if (!plano.notificarMedico) return { paciente, medico: null };
  const d = plano.dinheiro;
  const efeitoMedico = d.medicoRecebeDepois
    ? `O valor desta consulta (${brlCentavos(d.liquidoMedicoCentavos)}) entra no próximo repasse.`
    : d.repasse
      ? `O repasse de ${diaBr(d.repasse.competencia)} não muda. Se o paciente escolher o reembolso integral, ${brlCentavos(d.liquidoMedicoCentavos)} serão descontados do próximo repasse.`
      : `Esta consulta sai do seu repasse (${brlCentavos(d.liquidoMedicoCentavos)}).`;
  const medico = {
    usuarioId: c.medicoId,
    tipo: "agenda",
    titulo: "Desfecho corrigido pela administração",
    texto: `Consulta de ${c.especialidade} (${quando}): ${troca}. ${efeitoMedico}`,
  };
  return { paciente, medico };
}

/** Prévia para a tela do admin: desfecho atual e o plano de cada desfecho possível. Só lê. */
export async function previaCorrecaoDesfecho(consultaId: string, agora: Date = new Date()) {
  const e = await carregarEstadoCorrecao(db, consultaId);
  if (!e) return null;
  const atual = desfechoDaConsulta({ status: e.consulta.status, dataInicio: e.consulta.dataInicio, eventos: e.eventos });
  return {
    atual,
    opcoes: DESFECHOS_ALVO.filter((d) => d !== atual).map((novo) => {
      const p = planejarCorrecaoDesfecho(e, novo, agora);
      return p.ok ? { novo, ok: true as const, plano: p.plano } : { novo, ok: false as const, erro: p.erro };
    }),
  };
}

/** Conflito dentro da transação: desfaz tudo e vira 409. */
class ConflitoCorrecao extends Error {}

/**
 * Grava a correção (só ADMIN; a rota confere o papel). Numa transação:
 * trava o médico (mesma trava do fechamento do repasse) e a consulta,
 * relê o estado, recalcula o plano e só então grava. Idempotente: pedir de
 * novo o desfecho que já vale devolve `jaAplicado` sem gravar nada.
 * `esperado` = desfecho que o admin viu na prévia; se mudou, 409.
 */
export async function corrigirDesfecho(params: {
  consultaId: string;
  novo: Desfecho;
  motivo: string;
  admin: { id: string; nome: string };
  esperado?: DesfechoAtual;
  agora?: Date;
}): Promise<{ ok: true; jaAplicado: boolean; plano: PlanoCorrecao | null; status: string } | FalhaCorrecao> {
  const agora = params.agora ?? new Date();
  const motivo = params.motivo.trim();
  if (motivo.length < MOTIVO_CORRECAO_MIN || motivo.length > MOTIVO_CORRECAO_MAX) {
    return { ok: false, erro: `Explique o motivo da correção (${MOTIVO_CORRECAO_MIN} a ${MOTIVO_CORRECAO_MAX} caracteres).`, status: 400 };
  }
  if (!DESFECHOS_ALVO.includes(params.novo)) return { ok: false, erro: "Desfecho inválido.", status: 400 };
  const dono = await db.consulta.findUnique({ where: { id: params.consultaId }, select: { medicoId: true } });
  if (!dono) return { ok: false, erro: "Consulta não encontrada.", status: 404 };

  try {
    return await db.$transaction(
      async (tx) => {
        // Mesma trava do fechamento (repasse.ts): a correção e o fechamento
        // do mesmo médico não se intercalam. Depois, a linha da consulta.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"repasse:" + dono.medicoId}))`;
        await tx.$queryRaw`SELECT id FROM "Consulta" WHERE id = ${params.consultaId} FOR UPDATE`;
        const e = await carregarEstadoCorrecao(tx, params.consultaId);
        if (!e) return { ok: false as const, erro: "Consulta não encontrada.", status: 404 };
        if (e.consulta.medicoId !== dono.medicoId) throw new ConflitoCorrecao();
        const atual = desfechoDaConsulta({ status: e.consulta.status, dataInicio: e.consulta.dataInicio, eventos: e.eventos });
        if (atual === params.novo) return { ok: true as const, jaAplicado: true, plano: null, status: e.consulta.status };
        if (params.esperado && params.esperado !== atual) {
          return {
            ok: false as const,
            erro: `O desfecho mudou para "${ROTULO_DESFECHO[atual]}" enquanto você revisava. Confira a prévia de novo.`,
            status: 409,
          };
        }
        const p = planejarCorrecaoDesfecho(e, params.novo, agora);
        if (!p.ok) return p;
        const plano = p.plano;
        const c = e.consulta;

        if (plano.eventoCorrigidoId) {
          const r = await tx.eventoConsulta.updateMany({
            where: { id: plano.eventoCorrigidoId, corrigidoEm: null },
            data: { corrigidoEm: agora, corrigidoPorId: params.admin.id, motivoCorrecao: motivo },
          });
          if (r.count !== 1) throw new ConflitoCorrecao();
        }
        for (const r of plano.reembolsosEncerrados) {
          const u = await tx.reembolso.updateMany({
            where: { id: r.id, status: { in: REEMBOLSO_PENDENTE } },
            data: {
              status: "negado",
              respostaAdmin: `Pedido encerrado: a administração corrigiu o registro da consulta para "${ROTULO_DESFECHO[plano.novo]}".`,
              decididoPor: params.admin.id,
              decididoEm: agora,
            },
          });
          if (u.count !== 1) throw new ConflitoCorrecao();
        }

        let statusFinal = plano.statusDepois;
        const deFalha = plano.atual === "falha_tecnica" || plano.atual === "falta_medico";
        if (plano.novo === "realizada" || plano.novo === "falta_paciente") {
          await tx.consulta.update({
            where: { id: c.id },
            data: { status: plano.statusDepois, ...(deFalha ? { motivoCancelamento: null } : {}) },
          });
          if (plano.novo === "falta_paciente") {
            await registrarEvento(tx, {
              consultaId: c.id,
              tipo: "falta_paciente",
              por: "admin",
              atorId: params.admin.id,
              dataAnterior: c.dataInicio,
              motivo: "falta_paciente",
              multaCentavos: 0,
            });
          }
          await cancelarReservasPendentes(tx, c.id);
        } else {
          // aplicarFalhaTecnica só age em consulta "aberta": abre de novo, na mesma transação.
          if (!STATUS_ABERTOS.includes(c.status)) {
            await tx.consulta.update({ where: { id: c.id }, data: { status: "confirmada", motivoCancelamento: null } });
          }
          const r = await aplicarFalhaTecnica(tx, c.id, {
            motivo: plano.novo === "falta_medico" ? "falta_medico" : "falha_tecnica",
            por: "admin",
            atorId: params.admin.id,
          });
          if (!r) throw new ConflitoCorrecao();
          statusFinal = r.status;
        }

        const notif = textosNotificacaoCorrecao(e, plano, agora);
        await tx.notificacao.create({ data: notif.paciente });
        if (notif.medico) await tx.notificacao.create({ data: notif.medico });

        await tx.auditLog.create({
          data: {
            acao: "CONSULTA_DESFECHO_CORRIGIDO",
            categoria: "consulta",
            severidade: "warning",
            usuarioId: params.admin.id,
            usuarioNome: params.admin.nome,
            role: "ADMIN",
            entidade: "consulta",
            entidadeId: c.id,
            detalhes: JSON.stringify({
              motivo,
              antes: {
                desfecho: plano.atual,
                status: plano.statusAntes,
                eventoId: plano.eventoCorrigidoId,
                reembolsos: plano.reembolsosEncerrados.map((r) => ({ id: r.id, status: r.status })),
                repasseId: plano.dinheiro.repasse?.id ?? null,
              },
              depois: {
                desfecho: plano.novo,
                status: statusFinal,
                reembolsos: plano.reembolsosEncerrados.map((r) => ({ id: r.id, status: "negado" })),
                efeitoDinheiro: plano.dinheiro.efeito,
                liquidoMedicoCentavos: plano.dinheiro.liquidoMedicoCentavos,
              },
              notificados: [notif.paciente.usuarioId, notif.medico?.usuarioId].filter(Boolean),
            }),
          },
        });
        return { ok: true as const, jaAplicado: false, plano: { ...plano, statusDepois: statusFinal }, status: statusFinal };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof ConflitoCorrecao) {
      return { ok: false, erro: "A consulta mudou enquanto a correção era gravada. Atualize e confira a prévia de novo.", status: 409 };
    }
    throw e;
  }
}

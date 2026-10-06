import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizarCnpj } from "@/components/bion/medico/dados-pessoais";
import {
  COMISSAO_APP_PCT,
  desfechoDaConsulta,
  divisaoDaMulta,
  EVENTO_VIGENTE,
  liquidoDaConsulta,
  reaisParaCentavos,
  STATUS_ABERTOS,
  STATUS_FORA_DO_FATURAMENTO,
  TIPOS_EVENTO_DESFECHO,
  type EventoDesfechoMin,
} from "@/lib/server/financeiro";
import { dataIsoClinica, partesNoFuso } from "@/lib/server/fuso";
import {
  consultaEntraNaReceita,
  inicioDoDiaSP,
  multaCancelamentoDevolvida,
  multaRemarcacaoDevolvida,
  REEMBOLSO_STATUS_EFETIVOS,
  reembolsoEfetivo,
  totalReembolsadoCentavos,
  type ConsultaReceita,
} from "@/components/bion/medico/receita-servidor";

/* ------------------------------------------------------------------ */
/* Repasse DIÁRIO ao médico (fase 2, parte 3).                          */
/*                                                                      */
/* Regras aprovadas pelo Alisson (03/10/2026):                          */
/*  - fechamento diário às 23:30 de São Paulo, PIX feito pelo admin;    */
/*  - consulta entra pelas regras da receita (consultaEntraNaReceita);  */
/*  - a parte do médico (50%) na multa entra no dia em que foi paga;    */
/*  - reembolso depois do fechamento vira desconto (RepasseAjuste) no   */
/*    repasse seguinte; o que não couber passa adiante (saldo_anterior);*/
/*  - taxa do gateway = 0 até o pagamento informá-la.                   */
/*                                                                      */
/* "Até o corte": o fechamento pega TUDO o que ficou elegível até a     */
/* hora do corte e ainda não entrou em nenhum item. Nada se perde se o  */
/* cron atrasar ou falhar: o fechamento seguinte leva junto.            */
/*                                                                      */
/* Desfecho (regras do Alisson, 06/10/2026): consulta SEM DESFECHO      */
/* (status ainda "confirmada"/"em_espera"/"pendente_anamnese" e nenhum  */
/* evento falta_paciente/falha_tecnica vigente da data atual — ver      */
/* desfechoDaConsulta em financeiro.ts) fica FORA do fechamento: entra  */
/* no primeiro fechamento depois de ganhar desfecho (médico conclui,    */
/* marca falta/falha até 23:30 ou o admin corrige). O fechamento não    */
/* muda status nem roda a verificação de presença.                      */
/*                                                                      */
/* Fórmula (o banco confere com CHECK):                                 */
/*   liquido = bruto − comissao − taxas − reembolsos + multas − ajustes */
/* ------------------------------------------------------------------ */

export const HORA_FECHAMENTO = 23; // o dia de hoje só fecha a partir das 23:00 (SP)
export const PARTE_MEDICO_CONSULTA_PCT = 100 - COMISSAO_APP_PCT;

export const ERRO_CONSULTA_REPASSADA = "A consulta já entrou num repasse; não dá para trocar o médico.";
export const ERRO_SEM_CHAVE_PIX = "O médico ainda não cadastrou a chave PIX.";
export const ERRO_CHAVE_MUDOU = "A chave PIX do médico mudou desde que a tela foi aberta. Confira a chave nova antes de pagar.";
export const ERRO_REPASSE_NAO_ABERTO = "Esse repasse não existe ou já foi marcado como pago.";
export const ERRO_REPASSE_ZERADO = "Esse repasse não tem valor a pagar.";
export const ERRO_CNPJ_DIVERGENTE =
  "A conta PIX é de pessoa jurídica, mas o CNPJ dela não é mais o CNPJ do perfil do médico. Peça para o médico atualizar o recebimento antes de pagar.";

/**
 * Titular PJ: o documento salvo no recebimento precisa continuar sendo o
 * CNPJ atual do PerfilMedico (o médico pode trocar o CNPJ depois de salvar
 * a chave). Titular PF não depende do perfil.
 */
export function cnpjDivergente(pix: { titularTipo: string; titularDocumento: string } | null, cnpjPerfil: string | null | undefined): boolean {
  if (!pix || pix.titularTipo !== "pj") return false;
  return normalizarCnpj(cnpjPerfil ?? "") !== pix.titularDocumento;
}

export type TipoItem = "consulta" | "multa_cancelamento" | "multa_remarcacao";

const pct = (centavos: number, p: number) => Math.round((centavos * p) / 100);
const erroHttp = (msg: string, status: number) => Object.assign(new Error(msg), { status });

/* ---------- Competência (dia em São Paulo) -------------------------- */

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM-DD" do dia de `instante` em São Paulo (competência do repasse). */
export function diaCompetenciaDe(instante: Date = new Date()): string {
  return dataIsoClinica(instante);
}

/** [inicio, fim) do dia `dia` em São Paulo, ou null se a data não existe. */
export function limitesDaCompetencia(dia: string): { inicio: Date; fim: Date } | null {
  if (!RE_DIA.test(dia)) return null;
  const inicio = inicioDoDiaSP(dia);
  if (!inicio) return null;
  const fim = inicioDoDiaSP(dataIsoClinica(new Date(inicio.getTime() + 36 * 3_600_000)))!;
  return { inicio, fim };
}

/** Corte do fechamento: o fim do dia, ou agora se o dia ainda não acabou. */
export function corteDaCompetencia(dia: string, agora: Date = new Date()): Date | null {
  const lim = limitesDaCompetencia(dia);
  if (!lim) return null;
  return new Date(Math.min(agora.getTime(), lim.fim.getTime()));
}

/** Dia que o fechamento pega por padrão: hoje a partir das 23:00 (SP), senão ontem. */
export function competenciaPadraoParaFechar(agora: Date = new Date()): string {
  if (partesNoFuso(agora).hora >= HORA_FECHAMENTO) return dataIsoClinica(agora);
  return dataIsoClinica(new Date(agora.getTime() - 24 * 3_600_000));
}

/** Pode fechar esse dia agora? Dia futuro não; hoje só a partir das 23:00 (SP). */
export function validarCompetenciaParaFechar(dia: string, agora: Date = new Date()): string | null {
  if (!limitesDaCompetencia(dia)) return "Use uma data real no formato AAAA-MM-DD.";
  const hoje = dataIsoClinica(agora);
  if (dia > hoje) return "Não dá para fechar um dia que ainda não chegou.";
  if (dia === hoje && partesNoFuso(agora).hora < HORA_FECHAMENTO) {
    return `O dia de hoje só pode ser fechado a partir das ${HORA_FECHAMENTO}:00.`;
  }
  return null;
}

/* ---------- Cálculo puro (sem banco) -------------------------------- */

type ReembolsoMin = {
  status: string;
  valorCentavos: number;
  origem?: string | null;
  /** Quando passou a devolver dinheiro (decididoEm ?? criadoEm). Sem data = já efetivo. */
  efetivoEm?: Date | null;
};

/**
 * Só os reembolsos que já valiam no corte. Os posteriores não mexem no item:
 * viram ajuste no próximo fechamento (sem isso, um reembolso entre o corte e
 * a gravação sairia em dobro, no item e no ajuste).
 */
export function reembolsosAteOCorte<T extends ReembolsoMin>(lista: T[] | null | undefined, corte: Date): T[] {
  return (lista ?? []).filter((r) => !r.efetivoEm || r.efetivoEm.getTime() <= corte.getTime());
}

/** Consulta candidata: `eventos` = falta/falha (vigentes ou não) para saber o desfecho. */
export type CandidatoConsulta = ConsultaReceita & { eventos?: EventoDesfechoMin[] | null };

/**
 * A consulta ainda não tem desfecho (PURA)? Status "ia acontecer" e sem
 * evento de falta/falha vigente da data atual. Fica fora do fechamento.
 */
export function consultaSemDesfecho(c: { status: string; dataInicio: Date; eventos?: EventoDesfechoMin[] | null }): boolean {
  return desfechoDaConsulta(c) === "sem_desfecho";
}
export type CandidatoMultaCancelamento = {
  consultaId: string;
  em: Date;
  multaCentavos: number;
  valorConsulta: number;
  reembolsos: ReembolsoMin[];
};
export type CandidatoMultaRemarcacao = {
  remarcacaoId: string;
  consultaId: string;
  quando: Date;
  multaCentavos: number;
  reembolso: ReembolsoMin | null;
};

export type ItemCalculado = {
  tipo: TipoItem;
  chave: string;
  consultaId: string;
  remarcacaoId: string | null;
  quando: string; // ISO: início da consulta ou momento em que a multa foi paga
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  liquidoCentavos: number;
};

export const chaveDoItem = (tipo: TipoItem, id: string) => `${tipo}:${id}`;

/** Item da consulta realizada. Reembolso parcial efetivo: sai a parte do médico (90%). */
export function itemDaConsulta(c: CandidatoConsulta): ItemCalculado {
  const l = liquidoDaConsulta(reaisParaCentavos(c.valor), 0);
  const antes = l.brutoCentavos - l.comissaoCentavos - l.taxaCentavos;
  const reembolsos = Math.min(antes, pct(totalReembolsadoCentavos(c.pagamento?.reembolsos), PARTE_MEDICO_CONSULTA_PCT));
  return {
    tipo: "consulta",
    chave: chaveDoItem("consulta", c.id),
    consultaId: c.id,
    remarcacaoId: null,
    quando: c.dataInicio.toISOString(),
    brutoCentavos: l.brutoCentavos,
    comissaoCentavos: l.comissaoCentavos,
    taxasCentavos: l.taxaCentavos,
    reembolsosCentavos: reembolsos,
    multasCentavos: 0,
    liquidoCentavos: antes - reembolsos,
  };
}

function itemDeMulta(tipo: Exclude<TipoItem, "consulta">, consultaId: string, remarcacaoId: string | null, quando: Date, multaCentavos: number): ItemCalculado {
  const parte = divisaoDaMulta(multaCentavos).medicoCentavos;
  return {
    tipo,
    chave: chaveDoItem(tipo, tipo === "multa_remarcacao" ? remarcacaoId! : consultaId),
    consultaId,
    remarcacaoId,
    quando: quando.toISOString(),
    brutoCentavos: 0,
    comissaoCentavos: 0,
    taxasCentavos: 0,
    reembolsosCentavos: 0,
    multasCentavos: parte,
    liquidoCentavos: parte,
  };
}

/**
 * Itens que entram no próximo fechamento: tudo o que está elegível até o
 * `corte` e ainda não tem item (`jaIncluidas` = chaves já gravadas).
 */
export function itensElegiveis(params: {
  corte: Date;
  consultas: CandidatoConsulta[];
  multasCancelamento: CandidatoMultaCancelamento[];
  multasRemarcacao: CandidatoMultaRemarcacao[];
  jaIncluidas?: Set<string>;
}): ItemCalculado[] {
  const { corte } = params;
  const vistas = new Set(params.jaIncluidas ?? []);
  const itens: ItemCalculado[] = [];
  const add = (i: ItemCalculado) => {
    if (vistas.has(i.chave) || i.liquidoCentavos < 0) return;
    vistas.add(i.chave);
    itens.push(i);
  };
  for (const c0 of params.consultas) {
    if (c0.dataInicio.getTime() >= corte.getTime()) continue;
    // Repasse só de consulta com Pagamento confirmado: as 6 consultas de teste
    // (pago=true sem Pagamento) ficam fora, por decisão do Alisson.
    if (c0.pagamento?.status !== "confirmado") continue;
    // Sem desfecho (ninguém concluiu nem marcou falta/falha): fica para o
    // fechamento seguinte ao desfecho. Falha técnica/falta do médico vigente
    // também fica fora (o status já sai do faturamento; aqui é a garantia).
    const desfecho = desfechoDaConsulta(c0);
    if (desfecho === "sem_desfecho" || desfecho === "falha_tecnica" || desfecho === "falta_medico") continue;
    const c = { ...c0, pagamento: { ...c0.pagamento, reembolsos: reembolsosAteOCorte(c0.pagamento.reembolsos, corte) } };
    if (!consultaEntraNaReceita(c, corte)) continue;
    add(itemDaConsulta(c));
  }
  for (const m0 of params.multasCancelamento) {
    if (m0.multaCentavos <= 0 || m0.em.getTime() >= corte.getTime()) continue;
    const m = { ...m0, reembolsos: reembolsosAteOCorte(m0.reembolsos, corte) };
    if (multaCancelamentoDevolvida(m)) continue;
    add(itemDeMulta("multa_cancelamento", m.consultaId, null, m.em, m.multaCentavos));
  }
  for (const m0 of params.multasRemarcacao) {
    if (m0.multaCentavos <= 0 || m0.quando.getTime() >= corte.getTime()) continue;
    const m = { ...m0, reembolso: reembolsosAteOCorte(m0.reembolso ? [m0.reembolso] : [], corte)[0] ?? null };
    if (multaRemarcacaoDevolvida(m)) continue;
    add(itemDeMulta("multa_remarcacao", m.consultaId, m.remarcacaoId, m.quando, m.multaCentavos));
  }
  return itens.sort((a, b) => a.quando.localeCompare(b.quando) || a.chave.localeCompare(b.chave));
}

/* ---------- Ajustes: reembolso depois do fechamento ----------------- */

export type ReembolsoParaAjuste = {
  id: string;
  valorCentavos: number;
  /** Quando passou a devolver dinheiro: decisão do admin (manual) ou criação (automático). */
  efetivoEm: Date;
  consultaId: string;
  remarcacaoId: string | null;
};

export type ItemGravado = {
  chave: string;
  criadoEm: Date;
  liquidoCentavos: number;
  /** Só no item de multa de cancelamento: para saber quanto da multa voltou. */
  multaCentavos?: number;
  valorConsultaCentavos?: number;
};

export type AjusteNovo = { reembolsoId: string; consultaId: string; chaveItem: string; valorCentavos: number };

/**
 * Reembolsos efetivados DEPOIS de o item correspondente ter sido gravado
 * num repasse viram desconto (parte do médico), limitado ao que o médico
 * recebeu naquele item menos os descontos já feitos.
 * - consulta: 90% do reembolso (o app devolve os 10% dele);
 * - multa de remarcação: 50% do valor devolvido;
 * - multa de cancelamento: 50% do que o reembolso devolveu ALÉM de
 *   (valor − multa), que é o reembolso automático do cancelamento.
 * Reembolso efetivado ANTES do item já foi considerado no próprio item.
 */
export function ajustesNovos(params: {
  reembolsos: ReembolsoParaAjuste[];
  itens: Map<string, ItemGravado>;
  jaAjustado: Map<string, number>;
  /** Todos os reembolsos efetivos do pagamento da consulta (para a multa de cancelamento). */
  reembolsosDoPagamento?: Map<string, { id: string; valorCentavos: number; efetivoEm: Date }[]>;
}): AjusteNovo[] {
  const ajustado = new Map(params.jaAjustado);
  const novos: AjusteNovo[] = [];
  const ordenados = [...params.reembolsos].sort((a, b) => a.efetivoEm.getTime() - b.efetivoEm.getTime());
  for (const r of ordenados) {
    let chave: string;
    let parte: number;
    if (r.remarcacaoId) {
      chave = chaveDoItem("multa_remarcacao", r.remarcacaoId);
      parte = divisaoDaMulta(r.valorCentavos).medicoCentavos;
    } else if (params.itens.has(chaveDoItem("consulta", r.consultaId))) {
      chave = chaveDoItem("consulta", r.consultaId);
      parte = pct(r.valorCentavos, PARTE_MEDICO_CONSULTA_PCT);
    } else {
      chave = chaveDoItem("multa_cancelamento", r.consultaId);
      const item = params.itens.get(chave);
      if (!item) continue;
      const naoMulta = (item.valorConsultaCentavos ?? 0) - (item.multaCentavos ?? 0);
      const outros = (params.reembolsosDoPagamento?.get(r.consultaId) ?? []).filter(
        (o) => o.id !== r.id && o.efetivoEm.getTime() <= r.efetivoEm.getTime(),
      );
      const antes = outros.reduce((s, o) => s + o.valorCentavos, 0);
      const multa = item.multaCentavos ?? 0;
      const devolvidoAntes = Math.min(multa, Math.max(0, antes - naoMulta));
      const devolvidoDepois = Math.min(multa, Math.max(0, antes + r.valorCentavos - naoMulta));
      parte = divisaoDaMulta(devolvidoDepois - devolvidoAntes).medicoCentavos;
    }
    const item = params.itens.get(chave);
    if (!item || item.criadoEm.getTime() >= r.efetivoEm.getTime()) continue;
    const resta = item.liquidoCentavos - (ajustado.get(chave) ?? 0);
    const valor = Math.min(parte, resta);
    if (valor <= 0) continue;
    ajustado.set(chave, (ajustado.get(chave) ?? 0) + valor);
    novos.push({ reembolsoId: r.id, consultaId: r.consultaId, chaveItem: chave, valorCentavos: valor });
  }
  return novos;
}

export type AplicacaoAjuste = { id: string; aplicadoCentavos: number; sobraCentavos: number };

/** Desconta os ajustes pendentes (mais antigos primeiro) até o disponível; o resto passa adiante. */
export function aplicarAjustes(disponivelCentavos: number, pendentes: { id: string; valorCentavos: number }[]) {
  let disponivel = Math.max(0, disponivelCentavos);
  const aplicacoes: AplicacaoAjuste[] = [];
  for (const a of pendentes) {
    if (disponivel <= 0) break;
    const aplicado = Math.min(disponivel, a.valorCentavos);
    disponivel -= aplicado;
    aplicacoes.push({ id: a.id, aplicadoCentavos: aplicado, sobraCentavos: a.valorCentavos - aplicado });
  }
  return { aplicacoes, totalCentavos: aplicacoes.reduce((s, a) => s + a.aplicadoCentavos, 0) };
}

export type TotaisRepasse = {
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  ajustesCentavos: number;
  liquidoCentavos: number;
};

export function somarTotais(itens: ItemCalculado[], ajustesCentavos: number): TotaisRepasse {
  const t = itens.reduce(
    (s, i) => ({
      brutoCentavos: s.brutoCentavos + i.brutoCentavos,
      comissaoCentavos: s.comissaoCentavos + i.comissaoCentavos,
      taxasCentavos: s.taxasCentavos + i.taxasCentavos,
      reembolsosCentavos: s.reembolsosCentavos + i.reembolsosCentavos,
      multasCentavos: s.multasCentavos + i.multasCentavos,
    }),
    { brutoCentavos: 0, comissaoCentavos: 0, taxasCentavos: 0, reembolsosCentavos: 0, multasCentavos: 0 },
  );
  const antes = t.brutoCentavos - t.comissaoCentavos - t.taxasCentavos - t.reembolsosCentavos + t.multasCentavos;
  return { ...t, ajustesCentavos, liquidoCentavos: antes - ajustesCentavos };
}

/* ---------- Leitura do banco ---------------------------------------- */

type Cliente = Prisma.TransactionClient | typeof db;

const selReembolso = { status: true, valorCentavos: true, origem: true, criadoEm: true, decididoEm: true } as const;
const selEventoDesfecho = { id: true, tipo: true, motivo: true, em: true, dataAnterior: true, corrigidoEm: true } as const;
const comEfetivo = <T extends { criadoEm: Date; decididoEm: Date | null }>(r: T) => ({ ...r, efetivoEm: r.decididoEm ?? r.criadoEm });

/** Candidatos do médico ainda sem item, até o corte. */
async function carregarCandidatos(c: Cliente, medicoId: string, corte: Date) {
  const [consultas, eventos, remarcacoes] = await Promise.all([
    c.consulta.findMany({
      where: {
        medicoId,
        pago: true,
        pagamento: { status: "confirmado" },
        dataInicio: { lt: corte },
        status: { notIn: STATUS_FORA_DO_FATURAMENTO },
        repasseItens: { none: { tipo: "consulta" } },
      },
      select: {
        id: true,
        dataInicio: true,
        status: true,
        valor: true,
        pago: true,
        pagamento: { select: { status: true, reembolsos: { select: selReembolso } } },
        eventos: { where: { tipo: { in: TIPOS_EVENTO_DESFECHO } }, select: selEventoDesfecho },
      },
    }),
    c.eventoConsulta.findMany({
      where: {
        consulta: { medicoId, pagamento: { status: "confirmado" }, repasseItens: { none: { tipo: "multa_cancelamento" } } },
        tipo: "cancelada",
        por: "paciente",
        multaCentavos: { gt: 0 },
        em: { lt: corte },
      },
      orderBy: { em: "asc" },
      select: {
        consultaId: true,
        em: true,
        multaCentavos: true,
        consulta: { select: { valor: true, pagamento: { select: { reembolsos: { select: selReembolso } } } } },
      },
    }),
    c.remarcacaoPendente.findMany({
      where: {
        consulta: { medicoId },
        status: "aprovada",
        multaCentavos: { gt: 0 },
        repasseItens: { none: {} },
        OR: [{ aprovadoEm: { lt: corte } }, { aprovadoEm: null, criadoEm: { lt: corte } }],
      },
      select: {
        id: true,
        consultaId: true,
        aprovadoEm: true,
        criadoEm: true,
        multaCentavos: true,
        reembolso: { select: selReembolso },
      },
    }),
  ]);
  return {
    consultas: consultas.map((c) => ({
      ...c,
      pagamento: c.pagamento ? { ...c.pagamento, reembolsos: c.pagamento.reembolsos.map(comEfetivo) } : null,
    })),
    multasCancelamento: eventos.map((e) => ({
      consultaId: e.consultaId,
      em: e.em,
      multaCentavos: e.multaCentavos ?? 0,
      valorConsulta: e.consulta.valor,
      reembolsos: (e.consulta.pagamento?.reembolsos ?? []).map(comEfetivo),
    })),
    multasRemarcacao: remarcacoes.map((r) => ({
      remarcacaoId: r.id,
      consultaId: r.consultaId,
      quando: r.aprovadoEm ?? r.criadoEm,
      multaCentavos: r.multaCentavos,
      reembolso: r.reembolso ? comEfetivo(r.reembolso) : null,
    })),
  };
}

const efetivoEm = (r: { decididoEm: Date | null; criadoEm: Date }) => r.decididoEm ?? r.criadoEm;

/** Reembolsos efetivos do médico, até o corte, que ainda não viraram ajuste. */
async function calcularAjustesNovos(c: Cliente, medicoId: string, corte: Date): Promise<AjusteNovo[]> {
  const reembolsos = await c.reembolso.findMany({
    where: {
      status: { in: REEMBOLSO_STATUS_EFETIVOS },
      repasseAjuste: null,
      OR: [
        { pagamento: { consulta: { medicoId, repasseItens: { some: {} } } } },
        { remarcacao: { consulta: { medicoId }, repasseItens: { some: {} } } },
      ],
    },
    select: {
      id: true,
      valorCentavos: true,
      criadoEm: true,
      decididoEm: true,
      remarcacaoId: true,
      remarcacao: { select: { consultaId: true } },
      pagamento: { select: { consultaId: true } },
    },
  });
  const lista: ReembolsoParaAjuste[] = reembolsos
    .map((r) => ({
      id: r.id,
      valorCentavos: r.valorCentavos,
      efetivoEm: efetivoEm(r),
      consultaId: r.remarcacao?.consultaId ?? r.pagamento?.consultaId ?? "",
      remarcacaoId: r.remarcacaoId,
    }))
    .filter((r) => r.consultaId && r.efetivoEm.getTime() <= corte.getTime());
  if (lista.length === 0) return [];

  const consultaIds = [...new Set(lista.map((r) => r.consultaId))];
  const [itens, ajustes, doPagamento] = await Promise.all([
    c.repasseItem.findMany({
      where: { consultaId: { in: consultaIds }, medicoId },
      select: {
        chave: true,
        criadoEm: true,
        liquidoCentavos: true,
        multasCentavos: true,
        consulta: { select: { valor: true } },
        tipo: true,
      },
    }),
    c.repasseAjuste.findMany({
      where: { motivo: "reembolso", consultaId: { in: consultaIds }, medicoId },
      select: { valorCentavos: true, consultaId: true, reembolso: { select: { remarcacaoId: true } } },
    }),
    c.reembolso.findMany({
      where: { status: { in: REEMBOLSO_STATUS_EFETIVOS }, pagamento: { consultaId: { in: consultaIds } } },
      select: { id: true, valorCentavos: true, criadoEm: true, decididoEm: true, pagamento: { select: { consultaId: true } } },
    }),
  ]);
  const mapaItens = new Map<string, ItemGravado>();
  for (const i of itens) {
    const multaCheia = i.tipo === "multa_cancelamento" ? i.multasCentavos * 2 : undefined; // parte do médico = 50%
    mapaItens.set(i.chave, {
      chave: i.chave,
      criadoEm: i.criadoEm,
      liquidoCentavos: i.liquidoCentavos,
      multaCentavos: multaCheia,
      valorConsultaCentavos: reaisParaCentavos(i.consulta.valor),
    });
  }
  const jaAjustado = new Map<string, number>();
  for (const a of ajustes) {
    if (!a.consultaId) continue;
    const chave = a.reembolso?.remarcacaoId
      ? chaveDoItem("multa_remarcacao", a.reembolso.remarcacaoId)
      : mapaItens.has(chaveDoItem("consulta", a.consultaId))
        ? chaveDoItem("consulta", a.consultaId)
        : chaveDoItem("multa_cancelamento", a.consultaId);
    jaAjustado.set(chave, (jaAjustado.get(chave) ?? 0) + a.valorCentavos);
  }
  const porPagamento = new Map<string, { id: string; valorCentavos: number; efetivoEm: Date }[]>();
  for (const r of doPagamento) {
    const k = r.pagamento?.consultaId;
    if (!k) continue;
    porPagamento.set(k, [...(porPagamento.get(k) ?? []), { id: r.id, valorCentavos: r.valorCentavos, efetivoEm: efetivoEm(r) }]);
  }
  return ajustesNovos({ reembolsos: lista, itens: mapaItens, jaAjustado, reembolsosDoPagamento: porPagamento });
}

/* ---------- Sem desfecho (fora do fechamento) ------------------------ */

export type ConsultaSemDesfecho = {
  id: string;
  medicoId: string;
  medico: string;
  paciente: string;
  especialidade: string;
  dataInicio: Date;
  status: string;
  pago: boolean;
  valor: number;
};

/**
 * Consultas sem desfecho que começaram antes de `ate` (mais antigas
 * primeiro). Usado pela Fila do admin (> 24 h) e pela contagem do cron.
 * O Prisma não compara colunas (evento.dataAnterior = consulta.dataInicio),
 * então o filtro fino é o mesmo consultaSemDesfecho do fechamento.
 */
export async function listarConsultasSemDesfecho(
  params: { ate: Date; medicoId?: string; limite?: number },
  c: Cliente = db,
): Promise<ConsultaSemDesfecho[]> {
  const linhas = await c.consulta.findMany({
    where: {
      status: { in: STATUS_ABERTOS },
      dataInicio: { lt: params.ate },
      ...(params.medicoId ? { medicoId: params.medicoId } : {}),
    },
    orderBy: { dataInicio: "asc" },
    // As abertas que já têm falta vigente saem no filtro fino; lê folgado.
    take: 1000,
    select: {
      id: true,
      medicoId: true,
      especialidade: true,
      dataInicio: true,
      status: true,
      pago: true,
      valor: true,
      medico: { select: { nome: true } },
      paciente: { select: { nome: true } },
      eventos: { where: { tipo: { in: TIPOS_EVENTO_DESFECHO }, ...EVENTO_VIGENTE }, select: selEventoDesfecho },
    },
  });
  const limite = Math.min(Math.max(params.limite ?? 200, 1), 500);
  return linhas
    .filter(consultaSemDesfecho)
    .slice(0, limite)
    .map((l) => ({
    id: l.id,
    medicoId: l.medicoId,
    medico: l.medico.nome,
    paciente: l.paciente.nome,
    especialidade: l.especialidade,
    dataInicio: l.dataInicio,
    status: l.status,
    pago: l.pago,
    valor: l.valor,
  }));
}

/* ---------- Prévia (nada é gravado) ---------------------------------- */

export type PreviaRepasse = {
  medicoId: string;
  competencia: string;
  corte: string;
  itens: ItemCalculado[];
  /** Descontos que entrariam (pendentes + novos), na ordem em que seriam aplicados. */
  ajustes: { id: string | null; reembolsoId: string | null; consultaId: string | null; valorCentavos: number; aplicadoCentavos: number }[];
  totais: TotaisRepasse;
  /** Desconto que fica para depois por não caber neste repasse. */
  ajustesPendentesRestantesCentavos: number;
};

/**
 * Quanto o médico recebe no próximo fechamento se ele acontecesse agora:
 * tudo o que está elegível e ainda não entrou num repasse, menos os
 * descontos pendentes. Só lê o banco.
 */
export async function previaDoDia(medicoId: string, agora: Date = new Date()): Promise<PreviaRepasse> {
  const candidatos = await carregarCandidatos(db, medicoId, agora);
  const itens = itensElegiveis({ corte: agora, ...candidatos });
  const [pendentes, novos] = await Promise.all([
    db.repasseAjuste.findMany({
      where: { medicoId, repasseId: null },
      orderBy: { criadoEm: "asc" },
      select: { id: true, reembolsoId: true, consultaId: true, valorCentavos: true },
    }),
    calcularAjustesNovos(db, medicoId, agora),
  ]);
  const fila = [
    ...pendentes.map((p) => ({ ...p, chave: p.id })),
    ...novos.map((n) => ({ id: null, chave: `novo:${n.reembolsoId}`, reembolsoId: n.reembolsoId, consultaId: n.consultaId, valorCentavos: n.valorCentavos })),
  ];
  const parcial = somarTotais(itens, 0);
  const { aplicacoes, totalCentavos } = aplicarAjustes(
    parcial.liquidoCentavos,
    fila.map((f) => ({ id: f.chave, valorCentavos: f.valorCentavos })),
  );
  const aplicado = new Map(aplicacoes.map((a) => [a.id, a.aplicadoCentavos]));
  const totalFila = fila.reduce((s, f) => s + f.valorCentavos, 0);
  return {
    medicoId,
    competencia: diaCompetenciaDe(agora),
    corte: agora.toISOString(),
    itens,
    ajustes: fila.map((f) => ({
      id: f.id,
      reembolsoId: f.reembolsoId,
      consultaId: f.consultaId,
      valorCentavos: f.valorCentavos,
      aplicadoCentavos: aplicado.get(f.chave) ?? 0,
    })),
    totais: somarTotais(itens, totalCentavos),
    ajustesPendentesRestantesCentavos: totalFila - totalCentavos,
  };
}

/** Alias usado pela rota do admin: prévia de um médico até `corte`. */
export const calcularRepasse = previaDoDia;

/* ---------- Fechamento (grava) --------------------------------------- */

export type ResultadoFechamento = {
  medicoId: string;
  situacao: "fechado" | "ja_fechado" | "sem_itens";
  repasseId?: string;
  liquidoCentavos?: number;
  itens?: number;
  ajustesCriados?: number;
};

/**
 * Fecha o repasse de UM médico na competência `dia`. Transacional e
 * idempotente: trava o médico (advisory lock), não faz nada se o repasse
 * do dia já existe, e as chaves únicas impedem que um item entre duas vezes.
 * Reembolsos novos viram ajustes pendentes mesmo quando não há repasse.
 */
export async function fecharRepasseDoMedico(medicoId: string, dia: string, agora: Date = new Date()): Promise<ResultadoFechamento> {
  const corte = corteDaCompetencia(dia, agora);
  if (!corte) throw erroHttp("Use uma data real no formato AAAA-MM-DD.", 400);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"repasse:" + medicoId}))`;
      const existente = await tx.repasse.findUnique({
        where: { medicoId_competencia: { medicoId, competencia: dia } },
        select: { id: true },
      });
      if (existente) return { medicoId, situacao: "ja_fechado", repasseId: existente.id };

      const novos = await calcularAjustesNovos(tx, medicoId, corte);
      for (const n of novos) {
        await tx.repasseAjuste.create({
          data: { medicoId, consultaId: n.consultaId, motivo: "reembolso", reembolsoId: n.reembolsoId, valorCentavos: n.valorCentavos, criadoEm: corte },
        });
      }

      const itens = itensElegiveis({ corte, ...(await carregarCandidatos(tx, medicoId, corte)) });
      const pendentes = await tx.repasseAjuste.findMany({
        where: { medicoId, repasseId: null },
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
        select: { id: true, valorCentavos: true, consultaId: true },
      });
      const parcial = somarTotais(itens, 0);
      const { aplicacoes, totalCentavos } = aplicarAjustes(parcial.liquidoCentavos, pendentes);
      if (itens.length === 0 && totalCentavos === 0) {
        return { medicoId, situacao: "sem_itens", ajustesCriados: novos.length };
      }

      const totais = somarTotais(itens, totalCentavos);
      const repasse = await tx.repasse.create({
        data: { medicoId, competencia: dia, status: "fechado", fechadoEm: agora, ...totais },
        select: { id: true },
      });
      if (itens.length) {
        await tx.repasseItem.createMany({
          data: itens.map((i) => ({
            repasseId: repasse.id,
            medicoId,
            tipo: i.tipo,
            chave: i.chave,
            consultaId: i.consultaId,
            remarcacaoId: i.remarcacaoId,
            brutoCentavos: i.brutoCentavos,
            comissaoCentavos: i.comissaoCentavos,
            taxasCentavos: i.taxasCentavos,
            reembolsosCentavos: i.reembolsosCentavos,
            multasCentavos: i.multasCentavos,
            liquidoCentavos: i.liquidoCentavos,
            // = corte: os reembolsos até o corte já estão no item; os depois viram ajuste
            criadoEm: corte,
          })),
        });
      }
      const porId = new Map(pendentes.map((p) => [p.id, p]));
      for (const a of aplicacoes) {
        await tx.repasseAjuste.update({
          where: { id: a.id },
          data: { repasseId: repasse.id, aplicadoEm: agora, valorAplicadoCentavos: a.aplicadoCentavos },
        });
        if (a.sobraCentavos > 0) {
          await tx.repasseAjuste.create({
            data: {
              medicoId,
              consultaId: porId.get(a.id)?.consultaId ?? null,
              motivo: "saldo_anterior",
              origemAjusteId: a.id,
              valorCentavos: a.sobraCentavos,
              criadoEm: agora,
            },
          });
        }
      }
      return {
        medicoId,
        situacao: "fechado",
        repasseId: repasse.id,
        liquidoCentavos: totais.liquidoCentavos,
        itens: itens.length,
        ajustesCriados: novos.length,
      };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * Fecha a competência `dia` para todos os médicos (ou só os informados).
 * Cada médico na própria transação: a falha de um não desfaz os outros.
 */
export async function fecharRepasse(dia: string, opcoes: { agora?: Date; medicoIds?: string[] } = {}) {
  const agora = opcoes.agora ?? new Date();
  const erro = validarCompetenciaParaFechar(dia, agora);
  if (erro) throw erroHttp(erro, 409);
  const medicos = opcoes.medicoIds?.length
    ? opcoes.medicoIds
    : (await db.user.findMany({ where: { role: "MEDICO" }, select: { id: true }, orderBy: { id: "asc" } })).map((m) => m.id);
  const resultados: (ResultadoFechamento | { medicoId: string; situacao: "erro"; erro: string })[] = [];
  for (const medicoId of medicos) {
    try {
      resultados.push(await fecharRepasseDoMedico(medicoId, dia, agora));
    } catch (e) {
      console.error("[repasse] falha ao fechar", medicoId, dia, e);
      resultados.push({ medicoId, situacao: "erro", erro: "Falha ao fechar o repasse deste médico." });
    }
  }
  return { competencia: dia, corte: corteDaCompetencia(dia, agora)!.toISOString(), resultados };
}

/* ---------- Pagamento (admin) --------------------------------------- */

/**
 * Mesmas checagens do marcarRepassePago, só lendo: a rota chama antes de
 * subir o comprovante, para não deixar arquivo no bucket num 409 previsível.
 */
export async function conferirAntesDePagar(repasseId: string, pixChaveConferida: string, c: Cliente = db) {
  const repasse = await c.repasse.findUnique({
    where: { id: repasseId },
    select: { id: true, medicoId: true, status: true, liquidoCentavos: true, competencia: true },
  });
  if (!repasse || repasse.status !== "fechado") throw erroHttp(ERRO_REPASSE_NAO_ABERTO, 409);
  if (repasse.liquidoCentavos <= 0) throw erroHttp(ERRO_REPASSE_ZERADO, 409);
  const pix = await c.dadosRecebimentoMedico.findUnique({ where: { medicoId: repasse.medicoId } });
  if (!pix) throw erroHttp(ERRO_SEM_CHAVE_PIX, 409);
  if (pix.pixChave !== pixChaveConferida) throw erroHttp(ERRO_CHAVE_MUDOU, 409);
  if (pix.titularTipo === "pj") {
    const perfil = await c.perfilMedico.findUnique({ where: { userId: repasse.medicoId }, select: { cnpj: true } });
    if (cnpjDivergente(pix, perfil?.cnpj)) throw erroHttp(ERRO_CNPJ_DIVERGENTE, 409);
  }
  return { repasse, pix };
}

/**
 * Marca o repasse como pago: guarda a cópia da chave PIX usada (a atual do
 * médico), quem pagou e o comprovante. `pixChaveConferida` é a chave que o
 * admin viu na tela; se mudou nesse meio-tempo, recusa (409).
 */
export async function marcarRepassePago(params: {
  repasseId: string;
  adminId: string;
  comprovantePath: string;
  pixChaveConferida: string;
  agora?: Date;
}) {
  const agora = params.agora ?? new Date();
  return db.$transaction(async (tx) => {
    const { repasse, pix } = await conferirAntesDePagar(params.repasseId, params.pixChaveConferida, tx);
    const r = await tx.repasse.updateMany({
      where: { id: repasse.id, status: "fechado" },
      data: {
        status: "pago",
        pagoEm: agora,
        pagoPorId: params.adminId,
        comprovantePath: params.comprovantePath,
        pixTipo: pix.pixTipo,
        pixChave: pix.pixChave,
        pixTitularNome: pix.titularNome,
        pixTitularDocumento: pix.titularDocumento,
      },
    });
    if (r.count !== 1) throw erroHttp(ERRO_REPASSE_NAO_ABERTO, 409);
    return { ...repasse, status: "pago" as const, pagoEm: agora };
  });
}

/* ---------- Leitura para as telas ----------------------------------- */

/** A chave PIX foi trocada nas últimas 24 h? (aviso na tela do admin antes de pagar) */
export function chaveTrocadaRecente(pix: { criadoEm: Date; atualizadoEm: Date } | null, agora: Date = new Date()): boolean {
  if (!pix) return false;
  const trocou = pix.atualizadoEm.getTime() > pix.criadoEm.getTime() + 1000;
  return trocou && agora.getTime() - pix.atualizadoEm.getTime() < 24 * 3_600_000;
}

/** Consulta já está num repasse? (o "atualizar" do admin não troca o médico dela) */
export async function consultaJaRepassada(consultaId: string, c: Cliente = db): Promise<boolean> {
  return (await c.repasseItem.count({ where: { consultaId } })) > 0;
}

export { reembolsoEfetivo };

import { db } from "@/lib/db";
import { registrarAudit } from "@/lib/server/auth";

/**
 * Chargeback (disputa do Stripe) no modo plataforma. Dono: Admin. Migração 20261103e.
 *
 * Regra (decisão do Alisson, 03/11): o médico arca com as TAXAS do chargeback,
 * descontadas do repasse PIX por um RepasseAjuste (motivo 'chargeback'),
 * SALVO se a falha for da BION (cláusula 10.13 dos termos do médico).
 *
 * Decisão do Alisson de 27/11 (alternativa B da 10.13): o médico arca só com
 * a taxa do cartão e a taxa de contestação; o valor contestado devolvido ao
 * paciente fica com a plataforma (valorDisputadoCentavos = 0, definitivo).
 * No modo plataforma o RepasseAjuste não alcança o modelo novo (repasse.ts):
 * a taxa de contestação é cobrada por `cobrarTaxasChargebackPlataforma`
 * (reversão da TransferenciaMedico enviada, ou desconto em recebimentos
 * futuros — migração 20261127c). A taxa do cartão já sai no líquido da
 * transferência; cobrá-la de novo seria em dobro.
 *
 * Por que só a dispute fee (e NÃO a taxa do cartão):
 * - A taxa do cartão já sai do líquido do médico no repasse normal
 *   (financeiro.ts: TAXA_GATEWAY_NO_LIQUIDO e liquidoDaConsulta, "a taxa REAL
 *   do gateway sai dos 90% do médico"). Descontá-la de novo seria em dobro.
 * - A exceção seria o reembolso integral (liquidoComReembolso zera a taxa do
 *   médico: a BION absorve). Mas uma cobrança em chargeback não foi
 *   reembolsada pelo app (o Stripe recusa refund de charge disputada e o
 *   paciente não recebe duas vezes), então o repasse dela já saiu COM a taxa
 *   descontada. Não há caminho em que a taxa do cartão ficou sem desconto.
 * - Médicos (03/11): a cláusula 10.13 foi escrita para o Connect e cobra só
 *   taxas, não o valor disputado; a regra para o PIX vai ao Alisson. Toda a
 *   composição do desconto está em `composicaoDescontoChargeback` para mudar
 *   num lugar só.
 *
 * Disputa ganha (status 'won'): desconto 0 (o pendente é removido). Se o
 * desconto já entrou num repasse, grava `creditoPendente` — o RepasseAjuste
 * só representa desconto (> 0), não há crédito ao médico no modelo atual.
 *
 * Multa de remarcação: o médico vem de RemarcacaoPendente.consulta (a multa é
 * 50/50, então ele tem parte). Sem vínculo: medicoId nulo e nenhum desconto.
 *
 * Gancho para o repasse (repasse.ts, Médicos): `descontoChargebackCentavos(cb)`
 * é o ÚNICO valor a descontar. 0 = não criar/aplicar ajuste.
 */

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;

/** Status finais do Stripe: um evento não-final depois deles não sobrescreve. */
export const STATUS_FINAIS = ["won", "lost", "warning_closed"] as const;
export const statusFinal = (s: string | null | undefined) => (STATUS_FINAIS as readonly string[]).includes(s ?? "");

export type ChargebackParaDesconto = {
  falhaBion: boolean;
  medicoId: string | null;
  statusStripe: string;
  taxaDisputaCentavos: number | null;
  /** Conta conectada (event.account) = cobrança DIRETA: nada a descontar do PIX. */
  stripeConta?: string | null;
};

/**
 * ÚNICO ponto da composição do desconto ao médico. Hoje: só a dispute fee
 * líquida do Stripe. Zero quando: falha da BION, disputa ganha ou sem médico.
 * Valor disputado e taxa do cartão: 0 (ver comentário do módulo).
 */
export function composicaoDescontoChargeback(cb: ChargebackParaDesconto) {
  // Cobrança direta: valor + dispute fee já saíram do saldo do médico no Stripe.
  const isento = cb.falhaBion || cb.statusStripe === "won" || !cb.medicoId || !!cb.stripeConta;
  const fee = typeof cb.taxaDisputaCentavos === "number" && Number.isFinite(cb.taxaDisputaCentavos) ? Math.max(0, Math.round(cb.taxaDisputaCentavos)) : 0;
  const taxaDisputaCentavos = isento ? 0 : fee;
  const taxaCartaoCentavos = 0; // já descontada no repasse normal
  const valorDisputadoCentavos = 0; // decisão do Alisson de 27/11: alternativa B — valor contestado fica com a plataforma
  return { taxaDisputaCentavos, taxaCartaoCentavos, valorDisputadoCentavos, totalCentavos: taxaDisputaCentavos + taxaCartaoCentavos + valorDisputadoCentavos };
}

/** Quanto descontar do médico por este chargeback (centavos, ≥ 0). */
export function descontoChargebackCentavos(cb: ChargebackParaDesconto): number {
  return composicaoDescontoChargeback(cb).totalCentavos;
}

/** Valida o pedido do admin. */
export function validarPedidoFalhaBion(body: unknown):
  | { ok: true; falhaBion: boolean; motivo: string }
  | { ok: false; erro: string } {
  const b = (body ?? {}) as { falhaBion?: unknown; motivo?: unknown };
  if (typeof b.falhaBion !== "boolean") return { ok: false, erro: "Informe falhaBion (true para marcar, false para desmarcar)." };
  const motivo = typeof b.motivo === "string" ? b.motivo.trim() : "";
  if (motivo.length < MOTIVO_MIN) return { ok: false, erro: `Informe o motivo (mínimo ${MOTIVO_MIN} caracteres).` };
  if (motivo.length > MOTIVO_MAX) return { ok: false, erro: `Motivo longo demais (máximo ${MOTIVO_MAX} caracteres).` };
  return { ok: true, falhaBion: b.falhaBion, motivo };
}

// ------------------------------------------------------------ marcação

type CbLinha = {
  id: string;
  falhaBion: boolean;
  medicoId: string | null;
  statusStripe: string;
  taxaDisputaCentavos: number | null;
  stripeConta?: string | null;
  transferFalhaBionStatus?: string | null;
  taxasPlataformaStatus?: string | null;
  taxasPlataformaReversalCentavos?: number | null;
  taxasPlataformaDescontadoCentavos?: number | null;
};
type AjusteLinha = { id: string; repasseId: string | null };

/**
 * Trava de linha: TODO caminho que muda o desconto de um chargeback (marcação
 * do admin, eventos do Stripe, crédito devolvido E o fechamento do repasse em
 * repasse.ts — Médicos) faz, dentro da transação e ANTES de ler o estado,
 * `SELECT ... FROM "Chargeback" WHERE id = $1 FOR UPDATE`. O repasse, depois
 * da trava, re-confere `descontoChargebackCentavos(cb)` antes de aplicar o
 * ajuste (0 = não aplicar). Assim marcar/ganhar e fechar nunca se cruzam.
 */
type TravaSql = { $queryRaw(q: TemplateStringsArray, ...v: unknown[]): Promise<unknown> };
async function travarChargeback(tx: TravaSql, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Chargeback" WHERE "id" = ${id} FOR UPDATE`;
}
async function travarPorDisputa(tx: TravaSql, stripeDisputeId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Chargeback" WHERE "stripeDisputeId" = ${stripeDisputeId} FOR UPDATE`;
}

export type TxChargeback = TravaSql & {
  chargeback: {
    findUnique(a: unknown): Promise<CbLinha | null>;
    update(a: unknown): Promise<unknown>;
  };
  repasseAjuste: {
    findFirst(a: unknown): Promise<AjusteLinha | null>;
    deleteMany(a: unknown): Promise<{ count: number }>;
  };
  auditLog: { create(a: unknown): Promise<unknown> };
};
export type DbChargeback = { $transaction<T>(fn: (tx: TxChargeback) => Promise<T>): Promise<T> };

export type Admin = { id: string; nome: string; role: string };

export type ResultadoMarcacao =
  | { ok: true; mudou: boolean; falhaBion: boolean; descontoCentavos: number; ajusteRemovido: boolean }
  | { ok: false; status: 404 | 409 | 503; erro: string; codigo: string };

/**
 * Marca/desmarca "falha da BION". Transação única: chargeback + ajuste
 * pendente + AuditLog. Se a auditoria falhar, tudo é desfeito e o retorno é
 * 503 (mesmo padrão do #141: sem auditoria, sem mudança).
 * Idempotente: pedir o estado que já está não muda nada nem audita de novo.
 */
export async function marcarFalhaBion(
  p: { chargebackId: string; admin: Admin; falhaBion: boolean; motivo: string; agora?: Date },
  d: DbChargeback = db as unknown as DbChargeback,
): Promise<ResultadoMarcacao> {
  const agora = p.agora ?? new Date();
  class FalhaAudit extends Error {}
  try {
    return await d.$transaction(async (tx) => {
      await travarChargeback(tx, p.chargebackId);
      const cb = await tx.chargeback.findUnique({
        where: { id: p.chargebackId },
        select: { id: true, falhaBion: true, medicoId: true, statusStripe: true, taxaDisputaCentavos: true, stripeConta: true, transferFalhaBionStatus: true, taxasPlataformaStatus: true, taxasPlataformaReversalCentavos: true, taxasPlataformaDescontadoCentavos: true },
      });
      if (!cb) return { ok: false as const, status: 404 as const, erro: "Chargeback não encontrado.", codigo: "nao_encontrado" };
      // Cobrança direta: depois de a BION transferir (ou começar a transferir), não dá para desmarcar.
      if (!p.falhaBion && cb.falhaBion && cb.transferFalhaBionStatus && cb.transferFalhaBionStatus !== "falhou") {
        return { ok: false as const, status: 409 as const, erro: "A BION já transferiu (ou está transferindo) ao médico por este chargeback. Não dá para desmarcar; trate como ajuste manual.", codigo: "transferencia_enviada" };
      }
      if (cb.falhaBion === p.falhaBion) {
        return { ok: true as const, mudou: false, falhaBion: cb.falhaBion, descontoCentavos: descontoChargebackCentavos(cb), ajusteRemovido: false };
      }
      const ajuste = await tx.repasseAjuste.findFirst({ where: { chargebackId: cb.id }, select: { id: true, repasseId: true } });
      const liquidado = {
        ok: false as const,
        status: 409 as const,
        erro: "O desconto deste chargeback já entrou num repasse fechado. Não dá para mudar a marcação; trate como ajuste manual.",
        codigo: "repasse_liquidado",
      };
      if (ajuste?.repasseId) return liquidado;
      // Modo plataforma (20261127c): taxas já cobradas do médico (reversão ou
      // desconto em recebimento) não se desfazem com a marcação — ajuste
      // manual. Dívida ainda não cobrada é cancelada junto com a marcação.
      const recuperadoPlataforma = (cb.taxasPlataformaReversalCentavos ?? 0) + (cb.taxasPlataformaDescontadoCentavos ?? 0);
      if (p.falhaBion && recuperadoPlataforma > 0) {
        return { ok: false as const, status: 409 as const, erro: "As taxas deste chargeback já foram cobradas do médico (reversão ou desconto em recebimento). Não dá para mudar a marcação; trate como ajuste manual.", codigo: "taxas_ja_cobradas" };
      }
      if (p.falhaBion && cb.taxasPlataformaStatus === "pendente") {
        return { ok: false as const, status: 409 as const, erro: "A cobrança das taxas ao médico está em andamento. Tente de novo em instantes.", codigo: "cobranca_em_andamento" };
      }
      const cancelarDebitoPlataforma = p.falhaBion && (cb.taxasPlataformaStatus === "aguardando_desconto" || cb.taxasPlataformaStatus === "falhou");
      // Desmarcar devolve a dívida cancelada pela marcação — só se a disputa
      // segue perdida e nada foi cobrado (ganha/cobrado = crédito manual).
      const reativarDebitoPlataforma = !p.falhaBion && cb.taxasPlataformaStatus === "cancelado" && cb.statusStripe === "lost" && recuperadoPlataforma === 0;
      let ajusteRemovido = false;
      if (p.falhaBion && ajuste) {
        const r = await tx.repasseAjuste.deleteMany({ where: { id: ajuste.id, chargebackId: cb.id, repasseId: null } });
        // Defesa: 0 apagados = o ajuste foi aplicado num repasse depois da leitura.
        if (r.count === 0) return liquidado;
        ajusteRemovido = true;
      }
      await tx.chargeback.update({
        where: { id: cb.id },
        data: {
          ...(p.falhaBion
            ? { falhaBion: true, falhaBionMotivo: p.motivo, falhaBionPorId: p.admin.id, falhaBionEm: agora }
            : { falhaBion: false, falhaBionMotivo: null, falhaBionPorId: null, falhaBionEm: null }),
          ...(cancelarDebitoPlataforma ? { taxasPlataformaStatus: "cancelado", taxasPlataformaErro: null } : {}),
          ...(reativarDebitoPlataforma ? { taxasPlataformaStatus: "aguardando_desconto" } : {}),
        },
      });
      try {
        await tx.auditLog.create({
          data: {
            acao: p.falhaBion ? "CHARGEBACK_FALHA_BION_MARCADA" : "CHARGEBACK_FALHA_BION_DESMARCADA",
            categoria: "pagamento",
            severidade: "warning",
            usuarioId: p.admin.id,
            usuarioNome: p.admin.nome,
            role: p.admin.role,
            entidade: "chargeback",
            entidadeId: cb.id,
            detalhes: `${p.falhaBion ? "Marcado" : "Desmarcado"} falha da BION (cláusula 10.13)${ajusteRemovido ? "; desconto pendente removido" : ""}${cancelarDebitoPlataforma ? "; dívida de taxas do modo plataforma cancelada" : ""}${reativarDebitoPlataforma ? "; dívida de taxas do modo plataforma reativada" : ""}. Motivo: ${p.motivo}`,
          },
        });
      } catch {
        throw new FalhaAudit();
      }
      const desconto = descontoChargebackCentavos({ ...cb, falhaBion: p.falhaBion });
      return { ok: true as const, mudou: true, falhaBion: p.falhaBion, descontoCentavos: desconto, ajusteRemovido };
    });
  } catch (e) {
    if (e instanceof FalhaAudit) {
      return { ok: false, status: 503, erro: "Não foi possível registrar a auditoria; nada foi alterado. Tente de novo.", codigo: "auditoria_indisponivel" };
    }
    throw e;
  }
}

// ------------------------------------------------------------ webhook

type DisputaStripe = {
  id: string;
  amount: number;
  status: string;
  reason?: string | null;
  charge: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
  balance_transactions?: { fee?: number | null }[] | null;
};
export type EventoDisputa = { id: string; created: number; type: string; account?: string | null; data: { object: unknown } };

type CbExistente = { id: string; statusStripe: string; ultimoEventoId: string | null; ultimoEventoEm: Date | null; falhaBion: boolean; medicoId: string | null; taxaDisputaCentavos: number | null; creditoPendente: boolean; creditoDevolvidoEm: Date | null; stripeConta?: string | null; feeRefundStatus?: string | null; taxasPlataformaStatus?: string | null; taxasPlataformaReversalCentavos?: number | null; taxasPlataformaDescontadoCentavos?: number | null };
type TxDisputa = TravaSql & {
  pagamento: {
    findFirst(a: unknown): Promise<{ id: string; consultaId: string | null; consulta: { medicoId: string } | null; pedidoRenovacao: { medicoId: string } | null } | null>;
  };
  remarcacaoPendente: { findFirst(a: unknown): Promise<{ id: string; consultaId: string; consulta: { medicoId: string } | null } | null> };
  chargeback: {
    findUnique(a: unknown): Promise<CbExistente | null>;
    create(a: unknown): Promise<{ id: string }>;
    update(a: unknown): Promise<unknown>;
  };
  repasseAjuste: {
    findFirst(a: unknown): Promise<{ id: string; repasseId: string | null } | null>;
    deleteMany(a: unknown): Promise<{ count: number }>;
  };
};
export type DbDisputa = { $transaction<T>(fn: (tx: TxDisputa) => Promise<T>): Promise<T> };

/**
 * Dispute fee LÍQUIDA: soma das `fee` das balance_transactions da disputa.
 * Na retirada (funds_withdrawn) a fee é positiva; quando o Stripe devolve
 * (funds_reinstated / won), vem outra transação com fee negativa. Nunca < 0.
 */
export function taxaDaDisputa(bts: DisputaStripe["balance_transactions"]): number | null {
  if (!bts || bts.length === 0) return null;
  const soma = bts.reduce((s, b) => s + (typeof b.fee === "number" && Number.isFinite(b.fee) ? b.fee : 0), 0);
  return Math.max(0, Math.round(soma));
}

const idDe = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

export type ResultadoDisputa = "criada" | "atualizada" | "repetido" | "fora_de_ordem" | "invalida";

/**
 * charge.dispute.created / updated / closed / funds_withdrawn / funds_reinstated.
 * - Idempotente por event.id (ultimoEventoId) — além do StripeEvento do webhook.
 * - Ordem: evento com `created` anterior ao último aplicado é ignorado; status
 *   final (won/lost/warning_closed) nunca volta para não-final.
 * - Nunca mexe na marcação "falha da BION".
 * - Ganha (won): apaga o desconto pendente; se já foi aplicado num repasse,
 *   grava creditoPendente = true (não há ajuste de crédito no modelo).
 */
export async function registrarDisputaStripe(evento: EventoDisputa, d: DbDisputa = db as unknown as DbDisputa): Promise<ResultadoDisputa> {
  const disputa = evento?.data?.object as DisputaStripe | undefined;
  if (!disputa?.id || !evento.id) return "invalida";
  const em = new Date((evento.created ?? 0) * 1000);
  return d.$transaction(async (tx) => {
    await travarPorDisputa(tx, disputa.id);
    const atual = await tx.chargeback.findUnique({
      where: { stripeDisputeId: disputa.id },
      select: { id: true, statusStripe: true, ultimoEventoId: true, ultimoEventoEm: true, falhaBion: true, medicoId: true, taxaDisputaCentavos: true, creditoPendente: true, creditoDevolvidoEm: true, stripeConta: true, feeRefundStatus: true, taxasPlataformaStatus: true, taxasPlataformaReversalCentavos: true, taxasPlataformaDescontadoCentavos: true },
    });
    const taxa = taxaDaDisputa(disputa.balance_transactions);
    if (!atual) {
      const chargeId = idDe(disputa.charge);
      const piId = idDe(disputa.payment_intent);
      const or = [...(chargeId ? [{ stripeChargeId: chargeId }] : []), ...(piId ? [{ stripePaymentIntentId: piId }] : [])];
      const pag = or.length
        ? await tx.pagamento.findFirst({
            where: { OR: or },
            select: { id: true, consultaId: true, consulta: { select: { medicoId: true } }, pedidoRenovacao: { select: { medicoId: true } } },
          })
        : null;
      // Multa de remarcação: sem Pagamento; o PI fica em RemarcacaoPendente.gatewayRef 'stripe_pi:<id>'.
      const multa = !pag && piId
        ? await tx.remarcacaoPendente.findFirst({ where: { gatewayRef: `stripe_pi:${piId}` }, select: { id: true, consultaId: true, consulta: { select: { medicoId: true } } } })
        : null;
      await tx.chargeback.create({
        data: {
          stripeDisputeId: disputa.id,
          stripeChargeId: chargeId,
          pagamentoId: pag?.id ?? null,
          remarcacaoId: multa?.id ?? null,
          consultaId: pag?.consultaId ?? multa?.consultaId ?? null,
          medicoId: pag?.consulta?.medicoId ?? pag?.pedidoRenovacao?.medicoId ?? multa?.consulta?.medicoId ?? null,
          valorCentavos: Math.max(0, disputa.amount ?? 0),
          taxaDisputaCentavos: taxa,
          statusStripe: disputa.status,
          motivoStripe: disputa.reason ?? null,
          ultimoEventoId: evento.id,
          ultimoEventoEm: em,
          stripeConta: evento.account ?? null,
          ...(evento.account && disputa.status === "lost" ? { feeRefundStatus: "pendente" } : {}),
        },
      });
      return "criada";
    }
    if (atual.ultimoEventoId === evento.id) return "repetido";
    if (atual.ultimoEventoEm && em.getTime() < atual.ultimoEventoEm.getTime()) return "fora_de_ordem";
    if (statusFinal(atual.statusStripe) && !statusFinal(disputa.status)) return "fora_de_ordem";
    // Crédito ao médico só na PRIMEIRA transição para 'won' e nunca depois de o
    // admin registrar o crédito devolvido (ex.: funds_reinstated → PIX manual →
    // closed(won) não pode pedir para pagar de novo).
    const podeCreditar = atual.statusStripe !== "won" && !atual.creditoPendente && !atual.creditoDevolvidoEm;
    let creditoPendente = false;
    if (disputa.status === "won") {
      const ajuste = await tx.repasseAjuste.findFirst({ where: { chargebackId: atual.id }, select: { id: true, repasseId: true } });
      if (ajuste?.repasseId) creditoPendente = podeCreditar;
      else if (ajuste) {
        const r = await tx.repasseAjuste.deleteMany({ where: { id: ajuste.id, chargebackId: atual.id, repasseId: null } });
        // Defesa: 0 apagados = aplicado num repasse depois da leitura → crédito pendente.
        if (r.count === 0) creditoPendente = podeCreditar;
      }
      // Modo plataforma (20261127c): taxas já cobradas do médico (reversão ou
      // desconto em recebimento) viram crédito pendente — devolução manual,
      // mesmo fluxo do repasse. Dívida ainda não cobrada é cancelada abaixo.
      const recuperadoPlataforma = (atual.taxasPlataformaReversalCentavos ?? 0) + (atual.taxasPlataformaDescontadoCentavos ?? 0);
      if (recuperadoPlataforma > 0) creditoPendente = podeCreditar;
    }
    await tx.chargeback.update({
      where: { id: atual.id },
      data: {
        statusStripe: disputa.status,
        ultimoEventoId: evento.id,
        ultimoEventoEm: em,
        ...(taxa !== null ? { taxaDisputaCentavos: taxa } : {}),
        ...(creditoPendente ? { creditoPendente: true } : {}),
        // Cobrança direta perdida: marca a devolução dos 10% (decisão 03/11 12:33)
        // como pendente na mesma transação travada; devolverFeeChargeback executa.
        ...(disputa.status === "lost" && atual.stripeConta && !atual.feeRefundStatus ? { feeRefundStatus: "pendente" } : {}),
        // Modo plataforma: disputa ganha cancela a dívida de taxas ainda não
        // cobrada (a já cobrada virou creditoPendente acima).
        ...(disputa.status === "won" && (atual.taxasPlataformaStatus === "aguardando_desconto" || atual.taxasPlataformaStatus === "falhou")
          ? { taxasPlataformaStatus: "cancelado", taxasPlataformaErro: null } : {}),
      },
    });
    return "atualizada";
  });
}

// ------------------------------------------------------------ crédito devolvido

export type TxCredito = TravaSql & {
  chargeback: {
    findUnique(a: unknown): Promise<{ id: string; creditoPendente: boolean } | null>;
    update(a: unknown): Promise<unknown>;
  };
  auditLog: { create(a: unknown): Promise<unknown> };
};
export type DbCredito = { $transaction<T>(fn: (tx: TxCredito) => Promise<T>): Promise<T> };

export type ResultadoCredito =
  | { ok: true; mudou: boolean }
  | { ok: false; status: 404 | 409 | 503; erro: string; codigo: string };

/**
 * Admin registra que devolveu ao médico (fora do sistema, ex.: PIX manual) o
 * desconto de uma disputa ganha depois do repasse. Limpa creditoPendente e
 * grava quem/quando/por quê. Auditoria falhou → rollback e 503.
 * Idempotente: já devolvido → 200 mudou:false. Sem crédito pendente → 409.
 */
export async function registrarCreditoDevolvido(
  p: { chargebackId: string; admin: Admin; motivo: string; agora?: Date },
  d: DbCredito = db as unknown as DbCredito,
): Promise<ResultadoCredito> {
  const agora = p.agora ?? new Date();
  class FalhaAudit extends Error {}
  try {
    return await d.$transaction(async (tx) => {
      await travarChargeback(tx, p.chargebackId);
      const cb = await tx.chargeback.findUnique({
        where: { id: p.chargebackId },
        select: { id: true, creditoPendente: true, creditoDevolvidoEm: true },
      }) as { id: string; creditoPendente: boolean; creditoDevolvidoEm?: Date | null } | null;
      if (!cb) return { ok: false as const, status: 404 as const, erro: "Chargeback não encontrado.", codigo: "nao_encontrado" };
      if (!cb.creditoPendente) {
        if (cb.creditoDevolvidoEm) return { ok: true as const, mudou: false };
        return { ok: false as const, status: 409 as const, erro: "Este chargeback não tem crédito pendente ao médico.", codigo: "sem_credito_pendente" };
      }
      await tx.chargeback.update({
        where: { id: cb.id },
        data: { creditoPendente: false, creditoDevolvidoMotivo: p.motivo, creditoDevolvidoPorId: p.admin.id, creditoDevolvidoEm: agora },
      });
      try {
        await tx.auditLog.create({
          data: {
            acao: "CHARGEBACK_CREDITO_DEVOLVIDO",
            categoria: "pagamento",
            severidade: "warning",
            usuarioId: p.admin.id,
            usuarioNome: p.admin.nome,
            role: p.admin.role,
            entidade: "chargeback",
            entidadeId: cb.id,
            detalhes: `Crédito ao médico registrado como devolvido. Motivo: ${p.motivo}`,
          },
        });
      } catch {
        throw new FalhaAudit();
      }
      return { ok: true as const, mudou: true };
    });
  } catch (e) {
    if (e instanceof FalhaAudit) {
      return { ok: false, status: 503, erro: "Não foi possível registrar a auditoria; nada foi alterado. Tente de novo.", codigo: "auditoria_indisponivel" };
    }
    throw e;
  }
}

/** Valida { motivo } do crédito devolvido. */
export function validarMotivo(body: unknown): { ok: true; motivo: string } | { ok: false; erro: string } {
  const motivo = typeof (body as { motivo?: unknown } | null)?.motivo === "string" ? ((body as { motivo: string }).motivo).trim() : "";
  if (motivo.length < MOTIVO_MIN) return { ok: false, erro: `Informe o motivo (mínimo ${MOTIVO_MIN} caracteres).` };
  if (motivo.length > MOTIVO_MAX) return { ok: false, erro: `Motivo longo demais (máximo ${MOTIVO_MAX} caracteres).` };
  return { ok: true, motivo };
}

// ------------------------------------------------------------ cobrança direta: falha da BION

/**
 * Cobrança DIRETA (Connect, decisão do Alisson 03/11 12:13). A disputa
 * acontece na conta do médico: o valor disputado e a dispute fee saem do saldo
 * dele no Stripe (e o evento chega pelo endpoint Connect com `account`). Não
 * há RepasseAjuste. "Falha da BION" (cláusula 10.13) passa a significar que a
 * BION TRANSFERE ao médico a taxa do cartão (Pagamento.stripeTaxaCentavos) +
 * a dispute fee líquida.
 *
 * Quando: só com a disputa PERDIDA ('lost') e marcada falha da BION. Disputa
 * aberta: espera (se for ganha, o Stripe devolve o valor ao médico e não há o
 * que transferir). Chamada depois da marcação (rota do admin) e depois de cada
 * evento de disputa (webhook) — idempotente.
 *
 * Idempotência: (1) linha travada (FOR UPDATE) e status 'pendente' gravado
 * antes do Stripe; (2) transfer_group `chargeback_<id>` consultado antes de
 * criar (a Idempotency-Key do Stripe expira em 24h); (3) Idempotency-Key
 * `chargeback-falha-bion-<id>`. Os 10% de application fee são devolvidos à
 * parte, em devolverFeeChargeback (decisão do Alisson 03/11 12:33).
 */
export const chaveIdempotenciaFalhaBion = (chargebackId: string) => `chargeback-falha-bion-${chargebackId}`;
export const grupoFalhaBion = (chargebackId: string) => `chargeback_${chargebackId}`;

type CbTransfer = {
  id: string;
  falhaBion: boolean;
  statusStripe: string;
  stripeConta: string | null;
  taxaDisputaCentavos: number | null;
  transferFalhaBionId: string | null;
  transferFalhaBionStatus: string | null;
  transferFalhaBionCentavos: number | null;
  pagamento: { stripeTaxaCentavos: number | null } | null;
};
export type TxTransfer = TravaSql & {
  chargeback: { findUnique(a: unknown): Promise<CbTransfer | null>; update(a: unknown): Promise<unknown>; updateMany(a: unknown): Promise<{ count: number }> };
};
export type DbTransfer = TxTransfer & { $transaction<T>(fn: (tx: TxTransfer) => Promise<T>): Promise<T> };
export type StripeTransfer = {
  transfers: {
    create(p: { amount: number; currency: string; destination: string; transfer_group: string; description: string; metadata: Record<string, string> }, o: { idempotencyKey: string }): Promise<{ id: string }>;
    list(p: { transfer_group: string; limit: number }): Promise<{ data: { id: string; metadata?: Record<string, string> | null }[] }>;
  };
};

export type ResultadoTransferencia =
  | { enviado: true; transferId: string; valorCentavos: number }
  | { enviado: false; motivo: "nao_encontrado" | "nao_direta" | "sem_falha_bion" | "aguardando_desfecho" | "ja_enviado" | "valor_zero" };

/** Valor da transferência: taxa do cartão + dispute fee líquida (centavos, ≥ 0). */
export function valorTransferenciaFalhaBion(cb: Pick<CbTransfer, "taxaDisputaCentavos" | "pagamento">): number {
  const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  return n(cb.pagamento?.stripeTaxaCentavos) + n(cb.taxaDisputaCentavos);
}

const SEL_TRANSFER = {
  id: true, falhaBion: true, statusStripe: true, stripeConta: true, taxaDisputaCentavos: true,
  transferFalhaBionId: true, transferFalhaBionStatus: true, transferFalhaBionCentavos: true,
  pagamento: { select: { stripeTaxaCentavos: true } },
} as const;

export async function transferirFalhaBion(
  chargebackId: string,
  deps: { d?: DbTransfer; s?: StripeTransfer; moeda?: string; agora?: Date } = {},
): Promise<ResultadoTransferencia> {
  const d = deps.d ?? (db as unknown as DbTransfer);
  // Chave live barrada ANTES de qualquer leitura/escrita (invariante do teste
  // chave-live-dinheiro: zero acessos ao banco). A fábrica stripe() em si só
  // roda quando a transferência vai ser tentada: chargeback sem cobrança
  // direta ou aguardando desfecho devolve motivo sem exigir STRIPE_SECRET_KEY
  // (a marcação da falha da BION funciona sem chave; antes isto virava 502).
  if (!deps.s) (await import("@/lib/server/stripe")).exigirChaveNaoLive();
  type Preparo = { fim: ResultadoTransferencia } | { cb: CbTransfer; valor: number; s: StripeTransfer };
  const preparo = await d.$transaction(async (tx): Promise<Preparo> => {
    await travarChargeback(tx, chargebackId);
    const cb = await tx.chargeback.findUnique({ where: { id: chargebackId }, select: SEL_TRANSFER });
    if (!cb) return { fim: { enviado: false as const, motivo: "nao_encontrado" as const } };
    if (!cb.stripeConta) return { fim: { enviado: false as const, motivo: "nao_direta" as const } };
    if (!cb.falhaBion) return { fim: { enviado: false as const, motivo: "sem_falha_bion" as const } };
    if (cb.statusStripe !== "lost") return { fim: { enviado: false as const, motivo: "aguardando_desfecho" as const } };
    if (cb.transferFalhaBionStatus === "enviado") return { fim: { enviado: false as const, motivo: "ja_enviado" as const } };
    // Valor congelado na primeira tentativa (as retentativas mandam o mesmo).
    const valor = cb.transferFalhaBionCentavos ?? valorTransferenciaFalhaBion(cb);
    if (valor <= 0) return { fim: { enviado: false as const, motivo: "valor_zero" as const } };
    // Fábrica guardada ANTES de marcar 'pendente': sem chave configurada nada
    // é gravado (a repetição do POST tenta de novo do zero).
    const s = deps.s ?? ((await import("@/lib/server/stripe")).stripe() as unknown as StripeTransfer);
    await tx.chargeback.update({ where: { id: cb.id }, data: { transferFalhaBionStatus: "pendente", transferFalhaBionCentavos: valor } });
    return { cb, valor, s };
  });
  if ("fim" in preparo) return preparo.fim;
  const { cb, valor, s } = preparo as { cb: CbTransfer; valor: number; s: StripeTransfer };
  const conta = cb.stripeConta as string;

  const moeda = deps.moeda ?? (await import("@/lib/stripe-checkout-logica")).moedaCheckout();
  const grupo = grupoFalhaBion(cb.id);
  let transfer: { id: string };
  try {
    const existentes = await s.transfers.list({ transfer_group: grupo, limit: 10 });
    const anterior = existentes.data.find((t) => t.metadata?.chargebackId === cb.id && t.metadata?.tipo === "chargeback_falha_bion");
    transfer = anterior ?? (await s.transfers.create(
      {
        amount: valor,
        currency: moeda,
        destination: conta,
        transfer_group: grupo,
        description: "BION: falha da BION em chargeback (taxa do cartão + taxa da disputa)",
        metadata: { chargebackId: cb.id, tipo: "chargeback_falha_bion" },
      },
      { idempotencyKey: chaveIdempotenciaFalhaBion(cb.id) },
    ));
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "erro").slice(0, 300);
    await d.chargeback.updateMany({ where: { id: cb.id, transferFalhaBionStatus: { not: "enviado" } }, data: { transferFalhaBionStatus: "falhou", transferFalhaBionErro: msg } });
    throw e;
  }
  await d.chargeback.updateMany({
    where: { id: cb.id, transferFalhaBionStatus: { not: "enviado" } },
    data: { transferFalhaBionStatus: "enviado", transferFalhaBionId: transfer.id, transferFalhaBionErro: null, transferFalhaBionEm: deps.agora ?? new Date() },
  });
  return { enviado: true, transferId: transfer.id, valorCentavos: valor };
}

// ------------------------------------------------------------ cobrança direta: devolução dos 10% na disputa perdida

/**
 * Decisão do Alisson (03/11 12:33): no chargeback PERDIDO da cobrança direta,
 * a BION devolve ao médico os 10% de application fee, por reembolso da
 * application fee (applicationFees.createRefund) — não por transferência.
 * Independente da "falha da BION" (as duas podem acontecer). Ganha: nada.
 *
 * Idempotência: (1) linha travada (FOR UPDATE) e status 'pendente' gravado
 * antes do Stripe (registrarDisputaStripe já marca 'pendente' na transição
 * para 'lost'); (2) refunds da fee consultados antes de criar (a
 * Idempotency-Key expira em 24h): um refund nosso (metadata) é reaproveitado;
 * (3) Idempotency-Key `chargeback-fee-refund-<id>-<valor>` (valor em centavos:
 * retentativa com valor recalculado não fica presa num erro de chave reusada); (4) nunca mais que o
 * saldo não devolvido da fee — fee já toda devolvida (ex.: reembolso integral
 * com refund_application_fee) = 'ja_devolvida', sem chamada.
 * Erro do Stripe: grava 'falhou' e relança (webhook reentrega; admin repete).
 */
export const chaveIdempotenciaFeeChargeback = (chargebackId: string, valorCentavos: number) => `chargeback-fee-refund-${chargebackId}-${valorCentavos}`;

type CbFee = {
  id: string;
  statusStripe: string;
  stripeConta: string | null;
  stripeChargeId: string | null;
  feeRefundStatus: string | null;
  feeRefundId: string | null;
  feeRefundCentavos: number | null;
};
export type TxFee = TravaSql & {
  chargeback: { findUnique(a: unknown): Promise<CbFee | null>; update(a: unknown): Promise<unknown>; updateMany(a: unknown): Promise<{ count: number }> };
};
export type DbFee = TxFee & { $transaction<T>(fn: (tx: TxFee) => Promise<T>): Promise<T> };
type FeeRefund = { id: string; amount: number; metadata?: Record<string, string> | null };
export type StripeFee = {
  charges: { retrieve(id: string, p: Record<string, never>, o: { stripeAccount: string }): Promise<{ application_fee?: string | { id: string } | null }> };
  applicationFees: {
    retrieve(id: string): Promise<{ id: string; amount: number; amount_refunded: number }>;
    listRefunds(id: string, p: { limit: number }): Promise<{ data: FeeRefund[] }>;
    createRefund(id: string, p: { amount: number; metadata: Record<string, string> }, o: { idempotencyKey: string }): Promise<FeeRefund>;
  };
};
export type ResultadoFee =
  | { enviado: true; refundId: string; valorCentavos: number }
  | { enviado: false; motivo: "nao_encontrado" | "nao_direta" | "nao_perdida" | "ja_enviado" | "ja_devolvida" | "sem_fee" };

const SEL_FEE = { id: true, statusStripe: true, stripeConta: true, stripeChargeId: true, feeRefundStatus: true, feeRefundId: true, feeRefundCentavos: true } as const;
const FINAL_FEE = ["enviado", "ja_devolvida", "sem_fee"];

export async function devolverFeeChargeback(
  chargebackId: string,
  deps: { d?: DbFee; s?: StripeFee; agora?: Date } = {},
): Promise<ResultadoFee> {
  const d = deps.d ?? (db as unknown as DbFee);
  // Fábrica guardada ANTES de gravar qualquer coisa (chave live lança aqui).
  const s = deps.s ?? ((await import("@/lib/server/stripe")).stripe() as unknown as StripeFee);
  type Preparo = { fim: ResultadoFee } | { cb: CbFee };
  const preparo = await d.$transaction(async (tx): Promise<Preparo> => {
    await travarChargeback(tx, chargebackId);
    const cb = await tx.chargeback.findUnique({ where: { id: chargebackId }, select: SEL_FEE });
    if (!cb) return { fim: { enviado: false as const, motivo: "nao_encontrado" as const } };
    if (!cb.stripeConta) return { fim: { enviado: false as const, motivo: "nao_direta" as const } };
    if (cb.statusStripe !== "lost") return { fim: { enviado: false as const, motivo: "nao_perdida" as const } };
    if (cb.feeRefundStatus === "enviado") return { fim: { enviado: false as const, motivo: "ja_enviado" as const } };
    if (cb.feeRefundStatus === "ja_devolvida" || cb.feeRefundStatus === "sem_fee") return { fim: { enviado: false as const, motivo: cb.feeRefundStatus } };
    if (!cb.stripeChargeId) return { fim: { enviado: false as const, motivo: "sem_fee" as const } };
    if (cb.feeRefundStatus !== "pendente") await tx.chargeback.update({ where: { id: cb.id }, data: { feeRefundStatus: "pendente" } });
    return { cb };
  });
  if ("fim" in preparo) return preparo.fim;
  const cb = (preparo as { cb: CbFee }).cb;
  const naoFinal = { id: cb.id, feeRefundStatus: { notIn: FINAL_FEE } };
  let refund: FeeRefund | null = null;
  let valor = 0;
  try {
    const charge = await s.charges.retrieve(cb.stripeChargeId as string, {}, { stripeAccount: cb.stripeConta as string });
    const feeId = idDe(charge.application_fee ?? null);
    if (!feeId) {
      await d.chargeback.updateMany({ where: naoFinal, data: { feeRefundStatus: "sem_fee", feeRefundErro: null } });
      return { enviado: false, motivo: "sem_fee" };
    }
    const anteriores = await s.applicationFees.listRefunds(feeId, { limit: 100 });
    refund = anteriores.data.find((r) => r.metadata?.chargebackId === cb.id && r.metadata?.tipo === "chargeback_fee_refund") ?? null;
    if (!refund) {
      const fee = await s.applicationFees.retrieve(feeId);
      const resta = Math.max(0, fee.amount - fee.amount_refunded);
      valor = cb.feeRefundCentavos !== null ? Math.min(cb.feeRefundCentavos, resta) : resta;
      if (valor <= 0) {
        await d.chargeback.updateMany({ where: naoFinal, data: { feeRefundStatus: "ja_devolvida", feeRefundErro: null } });
        return { enviado: false, motivo: "ja_devolvida" };
      }
      await d.chargeback.updateMany({ where: naoFinal, data: { feeRefundCentavos: valor } });
      refund = await s.applicationFees.createRefund(
        feeId,
        { amount: valor, metadata: { chargebackId: cb.id, tipo: "chargeback_fee_refund" } },
        { idempotencyKey: chaveIdempotenciaFeeChargeback(cb.id, valor) },
      );
    }
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "erro").slice(0, 300);
    await d.chargeback.updateMany({ where: naoFinal, data: { feeRefundStatus: "falhou", feeRefundErro: msg } });
    throw e;
  }
  const r = refund as FeeRefund;
  await d.chargeback.updateMany({
    where: naoFinal,
    data: { feeRefundStatus: "enviado", feeRefundId: r.id, feeRefundCentavos: r.amount, feeRefundErro: null, feeRefundEm: deps.agora ?? new Date() },
  });
  return { enviado: true, refundId: r.id, valorCentavos: r.amount };
}

// ------------------------------------------------------------ cobrança plataforma: taxas do chargeback (alternativa B, 27/11)

/**
 * Decisão do Alisson de 27/11 (alternativa B da cláusula 10.13): no modo
 * plataforma o médico arca com a taxa do cartão e a taxa de contestação; o
 * valor contestado fica com a plataforma. A taxa do cartão JÁ sai no líquido
 * da TransferenciaMedico (financeiro.ts, TAXA_GATEWAY_NO_LIQUIDO) — cobrá-la
 * de novo seria em dobro. Aqui cobra-se a taxa de contestação, só com a
 * disputa PERDIDA ('lost'), sem falha da BION e com médico:
 *
 * - TransferenciaMedico já ENVIADA da mesma cobrança/multa: reversão no valor
 *   das taxas, limitada ao que ainda dá para reverter (líquido − desconto já
 *   aplicado − reversões de reembolso − reversões de outros chargebacks).
 *   transfers.createReversal com Idempotency-Key `chargeback-taxas-<id>-<valor>`
 *   e busca prévia em listReversals (a chave expira em 24 h). O que não couber
 *   na reversão vira dívida em recebimentos futuros.
 * - Sem transferência enviada: a dívida inteira fica registrada e é abatida
 *   no envio das próximas TransferenciaMedico do médico
 *   (ajustarDescontoChargeback, chamada por enviarTransferencia).
 *
 * Idempotência: linha travada (FOR UPDATE), 'pendente' gravado antes do
 * Stripe; 'quitado'/'sem_taxa' não repetem; 'falhou' tenta de novo só o que
 * resta (o já descontado em recebimentos não é cobrado duas vezes). Erro do
 * Stripe: grava 'falhou' e relança (webhook reentrega; admin repete no POST
 * cobrar-taxas). A dívida continua descontável de recebimentos futuros.
 *
 * Ganha depois de cobrado: creditoPendente (devolução manual, fluxo já
 * existente); dívida não cobrada é cancelada em registrarDisputaStripe e
 * marcarFalhaBion. Migração 20261127c.
 */
export const chaveIdempotenciaTaxasPlataforma = (chargebackId: string, valorCentavos: number) => `chargeback-taxas-${chargebackId}-${valorCentavos}`;

type CbTaxas = {
  id: string;
  falhaBion: boolean;
  medicoId: string | null;
  statusStripe: string;
  stripeConta: string | null;
  taxaDisputaCentavos: number | null;
  pagamentoId: string | null;
  remarcacaoId: string | null;
  taxasPlataformaStatus: string | null;
  taxasPlataformaCentavos: number | null;
  taxasPlataformaReversalCentavos: number | null;
  taxasPlataformaDescontadoCentavos: number;
  creditoDevolvidoEm: Date | null;
};
type TxTaxas = TravaSql & {
  chargeback: {
    findUnique(a: unknown): Promise<CbTaxas | null>;
    findMany(a: unknown): Promise<{ taxasPlataformaReversalCentavos: number | null }[]>;
    update(a: unknown): Promise<unknown>;
    updateMany(a: unknown): Promise<{ count: number }>;
  };
  transferenciaMedico: {
    findFirst(a: unknown): Promise<{ id: string; liquidoCentavos: number; descontoChargebackCentavos: number; stripeTransferId: string | null } | null>;
  };
  reembolso: { findMany(a: unknown): Promise<{ stripeReversalValorCentavos: number | null }[]> };
};
export type DbTaxas = TxTaxas & { $transaction<T>(fn: (tx: TxTaxas) => Promise<T>): Promise<T> };
export type StripeTaxas = {
  transfers: {
    createReversal(transferId: string, p: { amount: number; metadata: Record<string, string> }, o: { idempotencyKey: string }): Promise<{ id: string; amount: number }>;
    listReversals(transferId: string, p: { limit: number }): Promise<{ data: { id: string; amount: number; metadata?: Record<string, string> | null }[] }>;
  };
};

export type ResultadoTaxasPlataforma =
  | { cobrado: true; via: "reversao"; reversalId: string; valorCentavos: number; restanteCentavos: number }
  | { cobrado: true; via: "desconto_futuro"; valorCentavos: number }
  | { cobrado: false; motivo: "nao_encontrado" | "nao_plataforma" | "sem_medico" | "falha_bion" | "aguardando_desfecho" | "ja_cobrado" | "sem_taxa" | "em_andamento" | "cancelado" };

const SEL_TAXAS = {
  id: true, falhaBion: true, medicoId: true, statusStripe: true, stripeConta: true,
  taxaDisputaCentavos: true, pagamentoId: true, remarcacaoId: true,
  taxasPlataformaStatus: true, taxasPlataformaCentavos: true,
  taxasPlataformaReversalCentavos: true, taxasPlataformaDescontadoCentavos: true,
  creditoDevolvidoEm: true,
} as const;

export async function cobrarTaxasChargebackPlataforma(
  chargebackId: string,
  deps: { d?: DbTaxas; s?: StripeTaxas; agora?: Date; audit?: typeof registrarAudit } = {},
): Promise<ResultadoTaxasPlataforma> {
  const d = deps.d ?? (db as unknown as DbTaxas);
  // Chave live barrada ANTES de qualquer leitura/escrita (invariante do teste
  // chave-live-dinheiro: zero acessos ao banco).
  if (!deps.s) (await import("@/lib/server/stripe")).exigirChaveNaoLive();
  type Preparo =
    | { fim: ResultadoTaxasPlataforma }
    | { cb: CbTaxas; divida: number; valor: number; transferId: string; s: StripeTaxas }
    | { cb: CbTaxas; divida: number; debito: true };
  const preparo = await d.$transaction(async (tx): Promise<Preparo> => {
    await travarChargeback(tx, chargebackId);
    const cb = await tx.chargeback.findUnique({ where: { id: chargebackId }, select: SEL_TAXAS });
    if (!cb) return { fim: { cobrado: false as const, motivo: "nao_encontrado" as const } };
    if (cb.stripeConta) return { fim: { cobrado: false as const, motivo: "nao_plataforma" as const } };
    if (!cb.medicoId) return { fim: { cobrado: false as const, motivo: "sem_medico" as const } };
    if (cb.falhaBion) return { fim: { cobrado: false as const, motivo: "falha_bion" as const } };
    if (cb.statusStripe !== "lost") return { fim: { cobrado: false as const, motivo: "aguardando_desfecho" as const } };
    if (cb.taxasPlataformaStatus === "quitado") return { fim: { cobrado: false as const, motivo: "ja_cobrado" as const } };
    if (cb.taxasPlataformaStatus === "sem_taxa") return { fim: { cobrado: false as const, motivo: "sem_taxa" as const } };
    if (cb.taxasPlataformaStatus === "pendente") return { fim: { cobrado: false as const, motivo: "em_andamento" as const } };
    if (cb.taxasPlataformaStatus === "cancelado") return { fim: { cobrado: false as const, motivo: "cancelado" as const } };
    // Dívida congelada na primeira tentativa (as retentativas usam a mesma).
    const fee = cb.taxasPlataformaCentavos
      ?? (typeof cb.taxaDisputaCentavos === "number" && Number.isFinite(cb.taxaDisputaCentavos) ? Math.max(0, Math.round(cb.taxaDisputaCentavos)) : 0);
    if (fee <= 0) {
      await tx.chargeback.update({ where: { id: cb.id }, data: { taxasPlataformaStatus: "sem_taxa", taxasPlataformaCentavos: 0 } });
      return { fim: { cobrado: false as const, motivo: "sem_taxa" as const } };
    }
    const divida = Math.max(0, fee - (cb.taxasPlataformaReversalCentavos ?? 0) - cb.taxasPlataformaDescontadoCentavos);
    if (divida <= 0) {
      await tx.chargeback.update({ where: { id: cb.id }, data: { taxasPlataformaStatus: "quitado" } });
      return { fim: { cobrado: false as const, motivo: "ja_cobrado" as const } };
    }
    const or = [
      ...(cb.pagamentoId ? [{ pagamentoId: cb.pagamentoId }] : []),
      ...(cb.remarcacaoId ? [{ remarcacaoId: cb.remarcacaoId }] : []),
    ];
    const t = or.length
      ? await tx.transferenciaMedico.findFirst({ where: { status: "enviada", OR: or }, select: { id: true, liquidoCentavos: true, descontoChargebackCentavos: true, stripeTransferId: true } })
      : null;
    if (t?.stripeTransferId) {
      const irmaos = await tx.reembolso.findMany({
        where: { stripeReversalValorCentavos: { not: null }, ...(cb.pagamentoId ? { pagamentoId: cb.pagamentoId } : { remarcacaoId: cb.remarcacaoId }) },
        select: { stripeReversalValorCentavos: true },
      });
      const jaRevertidoReembolsos = irmaos.reduce((s, x) => s + (x.stripeReversalValorCentavos ?? 0), 0);
      const outrosChargebacks = await tx.chargeback.findMany({
        where: { taxasPlataformaReversalCentavos: { not: null }, OR: or },
        select: { taxasPlataformaReversalCentavos: true },
      });
      const jaRevertidoChargebacks = outrosChargebacks.reduce((s, x) => s + (x.taxasPlataformaReversalCentavos ?? 0), 0);
      const resta = Math.max(0, t.liquidoCentavos - t.descontoChargebackCentavos - jaRevertidoReembolsos - jaRevertidoChargebacks);
      const valor = Math.min(divida, resta);
      if (valor > 0) {
        // Fábrica guardada ANTES de marcar 'pendente': sem chave configurada
        // nada é gravado (a repetição tenta de novo do zero).
        const s = deps.s ?? ((await import("@/lib/server/stripe")).stripe() as unknown as StripeTaxas);
        await tx.chargeback.update({ where: { id: cb.id }, data: { taxasPlataformaStatus: "pendente", taxasPlataformaCentavos: fee, taxasPlataformaErro: null } });
        return { cb, divida, valor, transferId: t.stripeTransferId, s };
      }
    }
    // Sem transferência enviada (ou nada resta para reverter): dívida em
    // recebimentos futuros, abatida no envio das próximas transferências.
    await tx.chargeback.update({
      where: { id: cb.id },
      data: { taxasPlataformaStatus: "aguardando_desconto", taxasPlataformaCentavos: fee, taxasPlataformaErro: null, taxasPlataformaEm: deps.agora ?? new Date() },
    });
    return { cb, divida, debito: true };
  });
  if ("fim" in preparo) return preparo.fim;
  const audit = deps.audit ?? registrarAudit;
  if ("debito" in preparo) {
    const { cb, divida } = preparo;
    await audit(null, {
      acao: "CHARGEBACK_TAXAS_DESCONTO_REGISTRADO",
      categoria: "pagamento",
      entidade: "chargeback",
      entidadeId: cb.id,
      detalhes: `Taxa de contestação de ${divida} centavos registrada para desconto em recebimentos futuros do médico (disputa perdida; alternativa B de 27/11)`,
    });
    return { cobrado: true, via: "desconto_futuro", valorCentavos: divida };
  }
  const { cb, divida, valor, transferId, s } = preparo;
  let reversao: { id: string; amount: number };
  try {
    const anteriores = await s.transfers.listReversals(transferId, { limit: 100 });
    reversao = anteriores.data.find((r) => r.metadata?.chargebackId === cb.id && r.metadata?.tipo === "chargeback_taxas_plataforma")
      ?? (await s.transfers.createReversal(
        transferId,
        { amount: valor, metadata: { chargebackId: cb.id, tipo: "chargeback_taxas_plataforma" } },
        { idempotencyKey: chaveIdempotenciaTaxasPlataforma(cb.id, valor) },
      ));
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "erro").slice(0, 300);
    // 'cancelado' (disputa ganha/falha da BION no meio do caminho) não vira 'falhou'.
    await d.chargeback.updateMany({ where: { id: cb.id, taxasPlataformaStatus: { notIn: ["quitado", "cancelado"] } }, data: { taxasPlataformaStatus: "falhou", taxasPlataformaErro: msg } });
    await audit(null, {
      acao: "CHARGEBACK_TAXAS_REVERSAO_FALHOU",
      categoria: "pagamento",
      severidade: "critical",
      entidade: "chargeback",
      entidadeId: cb.id,
      detalhes: `Reversão de ${valor} centavos da transferência ${transferId} falhou: ${msg}. A dívida segue descontável de recebimentos futuros; conciliação manual se necessário.`,
    });
    throw e;
  }
  const restante = Math.max(0, divida - reversao.amount);
  // Travada de novo: a disputa pode ter virado 'won' (ou falha da BION marcada)
  // enquanto o Stripe respondia. O dinheiro já foi revertido → creditoPendente
  // (devolução manual) e nada mais é cobrado em recebimentos futuros.
  await d.$transaction(async (tx) => {
    await travarChargeback(tx, cb.id);
    const atual = await tx.chargeback.findUnique({ where: { id: cb.id }, select: SEL_TAXAS });
    const encerrou = atual?.statusStripe === "won" || atual?.falhaBion === true;
    await tx.chargeback.updateMany({
      where: { id: cb.id, taxasPlataformaStatus: { notIn: ["quitado", "cancelado"] } },
      data: {
        taxasPlataformaStatus: encerrou ? "cancelado" : restante <= 0 ? "quitado" : "aguardando_desconto",
        taxasPlataformaReversalId: reversao.id,
        taxasPlataformaReversalCentavos: reversao.amount,
        taxasPlataformaErro: null,
        taxasPlataformaEm: deps.agora ?? new Date(),
        ...(encerrou && !atual?.creditoDevolvidoEm ? { creditoPendente: true } : {}),
      },
    });
  });
  await audit(null, {
    acao: "CHARGEBACK_TAXAS_REVERTIDAS",
    categoria: "pagamento",
    entidade: "chargeback",
    entidadeId: cb.id,
    detalhes: `Reversão de ${reversao.amount} centavos da transferência ${transferId} (${reversao.id}) pelas taxas do chargeback; restante para recebimentos futuros: ${restante}`,
  });
  return { cobrado: true, via: "reversao", reversalId: reversao.id, valorCentavos: reversao.amount, restanteCentavos: restante };
}

// ------------------------------------------------------------ dívida de taxas: consumo no envio da transferência

type CbDebito = {
  id: string;
  statusStripe: string;
  falhaBion: boolean;
  taxasPlataformaStatus: string | null;
  taxasPlataformaCentavos: number | null;
  taxasPlataformaReversalCentavos: number | null;
  taxasPlataformaDescontadoCentavos: number;
};
const SEL_DEBITO = { id: true, statusStripe: true, falhaBion: true, taxasPlataformaStatus: true, taxasPlataformaCentavos: true, taxasPlataformaReversalCentavos: true, taxasPlataformaDescontadoCentavos: true } as const;
const restaDebito = (cb: CbDebito) => Math.max(0, (cb.taxasPlataformaCentavos ?? 0) - (cb.taxasPlataformaReversalCentavos ?? 0) - cb.taxasPlataformaDescontadoCentavos);

export type TxDesconto = TravaSql & {
  transferenciaMedico: {
    findUnique(a: unknown): Promise<{ id: string; descontoChargebackCentavos: number } | null>;
    update(a: unknown): Promise<unknown>;
  };
  chargeback: {
    findUnique(a: unknown): Promise<CbDebito | null>;
    findMany(a: unknown): Promise<{ id: string }[]>;
    update(a: unknown): Promise<unknown>;
  };
};
export type DbDesconto = { $transaction<T>(fn: (tx: TxDesconto) => Promise<T>): Promise<T> };

async function travarTransferencia(tx: TravaSql, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "TransferenciaMedico" WHERE "id" = ${id} FOR UPDATE`;
}

/** Devolve `centavos` de dívida já descontada aos chargebacks do médico (mais recentes primeiro). */
async function devolverDesconto(tx: TxDesconto, medicoId: string, centavos: number) {
  let resto = Math.max(0, Math.floor(centavos));
  if (resto <= 0) return;
  const cbs = await tx.chargeback.findMany({
    where: { medicoId, taxasPlataformaDescontadoCentavos: { gt: 0 } },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });
  for (const { id } of cbs) {
    if (resto <= 0) break;
    await travarChargeback(tx, id);
    const cb = await tx.chargeback.findUnique({ where: { id }, select: SEL_DEBITO });
    if (!cb || cb.taxasPlataformaDescontadoCentavos <= 0) continue;
    const devolver = Math.min(resto, cb.taxasPlataformaDescontadoCentavos);
    const novoDescontado = cb.taxasPlataformaDescontadoCentavos - devolver;
    // Reabre a dívida só se ainda cabe cobrar: disputa ganha ou falha da BION
    // encerram a cobrança (o já cobrado vira crédito manual, creditoPendente).
    const reabrir = cb.taxasPlataformaStatus === "quitado" && cb.statusStripe !== "won" && !cb.falhaBion
      && novoDescontado + (cb.taxasPlataformaReversalCentavos ?? 0) < (cb.taxasPlataformaCentavos ?? 0);
    await tx.chargeback.update({ where: { id: cb.id }, data: { taxasPlataformaDescontadoCentavos: novoDescontado, ...(reabrir ? { taxasPlataformaStatus: "aguardando_desconto" } : {}) } });
    resto -= devolver;
  }
}

/**
 * Consumo da dívida de taxas no envio da TransferenciaMedico (chamada por
 * enviarTransferencia). Transação única com travas: o desconto já gravado na
 * linha é reaproveitado (retentativa depois de crash não desconta duas vezes);
 * dívidas do médico em ordem de criação são abatidas até o líquido; se o
 * líquido caiu abaixo do desconto gravado (taxa real chegou depois,
 * financeiro.ts), o excesso volta aos chargebacks. Devolve o desconto a usar.
 */
export async function ajustarDescontoChargeback(
  transferenciaId: string,
  medicoId: string,
  liquidoCentavos: number,
  deps: { d?: DbDesconto } = {},
): Promise<number> {
  const d = deps.d ?? (db as unknown as DbDesconto);
  return d.$transaction(async (tx) => {
    await travarTransferencia(tx, transferenciaId);
    const t = await tx.transferenciaMedico.findUnique({ where: { id: transferenciaId }, select: { id: true, descontoChargebackCentavos: true } });
    if (!t) return 0;
    const liquido = Math.max(0, Math.floor(liquidoCentavos));
    if (t.descontoChargebackCentavos > liquido) {
      await devolverDesconto(tx, medicoId, t.descontoChargebackCentavos - liquido);
      await tx.transferenciaMedico.update({ where: { id: transferenciaId }, data: { descontoChargebackCentavos: liquido } });
      return liquido;
    }
    if (t.descontoChargebackCentavos > 0) return t.descontoChargebackCentavos;
    let disponivel = liquido;
    let total = 0;
    const cbs = await tx.chargeback.findMany({
      where: { medicoId, taxasPlataformaStatus: { in: ["aguardando_desconto", "falhou"] }, taxasPlataformaCentavos: { not: null } },
      orderBy: { criadoEm: "asc" },
      select: { id: true },
    });
    for (const { id } of cbs) {
      if (disponivel <= 0) break;
      await travarChargeback(tx, id);
      const cb = await tx.chargeback.findUnique({ where: { id }, select: SEL_DEBITO });
      if (!cb || (cb.taxasPlataformaStatus !== "aguardando_desconto" && cb.taxasPlataformaStatus !== "falhou")) continue;
      const take = Math.min(restaDebito(cb), disponivel);
      if (take <= 0) continue;
      const novo = cb.taxasPlataformaDescontadoCentavos + take;
      const quitado = novo + (cb.taxasPlataformaReversalCentavos ?? 0) >= (cb.taxasPlataformaCentavos ?? 0);
      await tx.chargeback.update({ where: { id: cb.id }, data: { taxasPlataformaDescontadoCentavos: novo, ...(quitado ? { taxasPlataformaStatus: "quitado" } : {}) } });
      disponivel -= take;
      total += take;
    }
    if (total > 0) await tx.transferenciaMedico.update({ where: { id: transferenciaId }, data: { descontoChargebackCentavos: total } });
    return total;
  });
}

/**
 * Devolve aos chargebacks o desconto consumido por uma transferência que vai
 * ser REMOVIDA (correção de desfecho, financeiro.ts). Chamar dentro da mesma
 * transação, ANTES do delete.
 */
export async function estornarDescontoChargeback(tx: TxDesconto, medicoId: string, centavos: number): Promise<void> {
  await devolverDesconto(tx, medicoId, centavos);
}

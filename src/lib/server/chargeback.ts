import { db } from "@/lib/db";

/**
 * Chargeback (disputa do Stripe) no modo plataforma. Dono: Admin. Migração 20261103e.
 *
 * Regra (decisão do Alisson, 03/11): o médico arca com as TAXAS do chargeback,
 * descontadas do repasse PIX por um RepasseAjuste (motivo 'chargeback'),
 * SALVO se a falha for da BION (cláusula 10.13 dos termos do médico).
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
  const valorDisputadoCentavos = 0; // cláusula 10.13: só taxas (pendente Alisson)
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
        select: { id: true, falhaBion: true, medicoId: true, statusStripe: true, taxaDisputaCentavos: true, stripeConta: true, transferFalhaBionStatus: true },
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
      let ajusteRemovido = false;
      if (p.falhaBion && ajuste) {
        const r = await tx.repasseAjuste.deleteMany({ where: { id: ajuste.id, chargebackId: cb.id, repasseId: null } });
        // Defesa: 0 apagados = o ajuste foi aplicado num repasse depois da leitura.
        if (r.count === 0) return liquidado;
        ajusteRemovido = true;
      }
      await tx.chargeback.update({
        where: { id: cb.id },
        data: p.falhaBion
          ? { falhaBion: true, falhaBionMotivo: p.motivo, falhaBionPorId: p.admin.id, falhaBionEm: agora }
          : { falhaBion: false, falhaBionMotivo: null, falhaBionPorId: null, falhaBionEm: null },
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
            detalhes: `${p.falhaBion ? "Marcado" : "Desmarcado"} falha da BION (cláusula 10.13)${ajusteRemovido ? "; desconto pendente removido" : ""}. Motivo: ${p.motivo}`,
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

type CbExistente = { id: string; statusStripe: string; ultimoEventoId: string | null; ultimoEventoEm: Date | null; falhaBion: boolean; medicoId: string | null; taxaDisputaCentavos: number | null; creditoPendente: boolean; creditoDevolvidoEm: Date | null; stripeConta?: string | null; feeRefundStatus?: string | null };
type TxDisputa = TravaSql & {
  pagamento: {
    findFirst(a: unknown): Promise<{ id: string; consultaId: string | null; consulta: { medicoId: string } | null; pedidoRenovacao: { medicoId: string } | null } | null>;
  };
  remarcacaoPendente: { findFirst(a: unknown): Promise<{ consultaId: string; consulta: { medicoId: string } | null } | null> };
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
      select: { id: true, statusStripe: true, ultimoEventoId: true, ultimoEventoEm: true, falhaBion: true, medicoId: true, taxaDisputaCentavos: true, creditoPendente: true, creditoDevolvidoEm: true, stripeConta: true, feeRefundStatus: true },
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
        ? await tx.remarcacaoPendente.findFirst({ where: { gatewayRef: `stripe_pi:${piId}` }, select: { consultaId: true, consulta: { select: { medicoId: true } } } })
        : null;
      await tx.chargeback.create({
        data: {
          stripeDisputeId: disputa.id,
          stripeChargeId: chargeId,
          pagamentoId: pag?.id ?? null,
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
  type Preparo = { fim: ResultadoTransferencia } | { cb: CbTransfer; valor: number };
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
    await tx.chargeback.update({ where: { id: cb.id }, data: { transferFalhaBionStatus: "pendente", transferFalhaBionCentavos: valor } });
    return { cb, valor };
  });
  if ("fim" in preparo) return preparo.fim;
  const { cb, valor } = preparo as { cb: CbTransfer; valor: number };
  const conta = cb.stripeConta as string;

  const s = deps.s ?? ((await import("@/lib/server/stripe")).stripe() as unknown as StripeTransfer);
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
 * (3) Idempotency-Key `chargeback-fee-refund-<id>`; (4) nunca mais que o
 * saldo não devolvido da fee — fee já toda devolvida (ex.: reembolso integral
 * com refund_application_fee) = 'ja_devolvida', sem chamada.
 * Erro do Stripe: grava 'falhou' e relança (webhook reentrega; admin repete).
 */
export const chaveIdempotenciaFeeChargeback = (chargebackId: string) => `chargeback-fee-refund-${chargebackId}`;

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
  const s = deps.s ?? ((await import("@/lib/server/stripe")).stripe() as unknown as StripeFee);
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
        { idempotencyKey: chaveIdempotenciaFeeChargeback(cb.id) },
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

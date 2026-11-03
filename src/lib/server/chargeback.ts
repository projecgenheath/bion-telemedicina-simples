import { db } from "@/lib/db";

/**
 * Chargeback (disputa do Stripe) no modo plataforma. Dono: Admin. Migração 20261103e.
 *
 * Regra (decisão do Alisson, 03/11): o médico arca com a taxa do cartão e a
 * dispute fee do Stripe, descontadas do repasse PIX por um RepasseAjuste
 * (motivo 'chargeback'), SALVO se a falha for da BION (cláusula 10.13 dos
 * termos do médico). O admin marca "falha da BION" com motivo; marcado, nada
 * é descontado do médico.
 *
 * Gancho para o repasse (repasse.ts, Médicos): `descontoChargebackCentavos(cb)`
 * é o ÚNICO valor a descontar. 0 = não criar ajuste. O ajuste só pode ser
 * criado com `chargebackId` (único), então é idempotente por disputa.
 *
 * Reversível só enquanto o desconto não foi aplicado num repasse
 * (RepasseAjuste.repasseId nulo). Depois disso, marcar ou desmarcar responde
 * 409 `repasse_liquidado`: o RepasseAjuste só representa DESCONTO (> 0), não
 * há crédito ao médico no modelo atual (pendência para o Alisson/Médicos).
 */

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;

export type ChargebackParaDesconto = {
  falhaBion: boolean;
  taxaCartaoCentavos: number | null;
  taxaDisputaCentavos: number | null;
};

/** Quanto descontar do médico por este chargeback (centavos, ≥ 0). */
export function descontoChargebackCentavos(cb: ChargebackParaDesconto): number {
  if (cb.falhaBion) return 0;
  const n = (v: number | null) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  return n(cb.taxaCartaoCentavos) + n(cb.taxaDisputaCentavos);
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
  valorCentavos: number;
  taxaCartaoCentavos: number | null;
  taxaDisputaCentavos: number | null;
};
type AjusteLinha = { id: string; repasseId: string | null };

export type TxChargeback = {
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
      const cb = await tx.chargeback.findUnique({
        where: { id: p.chargebackId },
        select: { id: true, falhaBion: true, medicoId: true, valorCentavos: true, taxaCartaoCentavos: true, taxaDisputaCentavos: true },
      });
      if (!cb) return { ok: false as const, status: 404 as const, erro: "Chargeback não encontrado.", codigo: "nao_encontrado" };
      if (cb.falhaBion === p.falhaBion) {
        return { ok: true as const, mudou: false, falhaBion: cb.falhaBion, descontoCentavos: descontoChargebackCentavos(cb), ajusteRemovido: false };
      }
      const ajuste = await tx.repasseAjuste.findFirst({ where: { chargebackId: cb.id }, select: { id: true, repasseId: true } });
      if (ajuste?.repasseId) {
        return {
          ok: false as const,
          status: 409 as const,
          erro: "O desconto deste chargeback já entrou num repasse fechado. Não dá para mudar a marcação; trate como ajuste manual.",
          codigo: "repasse_liquidado",
        };
      }
      let ajusteRemovido = false;
      if (p.falhaBion && ajuste) {
        const r = await tx.repasseAjuste.deleteMany({ where: { id: ajuste.id, chargebackId: cb.id, repasseId: null } });
        ajusteRemovido = r.count > 0;
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

export type DbDisputa = {
  pagamento: {
    findFirst(a: unknown): Promise<{ id: string; consultaId: string | null; stripeTaxaCentavos: number | null; consulta: { medicoId: string } | null; pedidoRenovacao: { medicoId: string } | null } | null>;
  };
  chargeback: { upsert(a: unknown): Promise<unknown> };
};

/** Soma das taxas (dispute fee) das balance_transactions da disputa. */
export function taxaDaDisputa(bts: DisputaStripe["balance_transactions"]): number | null {
  if (!bts || bts.length === 0) return null;
  return bts.reduce((s, b) => s + (typeof b.fee === "number" && b.fee > 0 ? b.fee : 0), 0);
}

const idDe = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

/**
 * charge.dispute.created / updated / closed / funds_withdrawn / funds_reinstated:
 * cria ou atualiza o Chargeback (nunca mexe na marcação "falha da BION").
 */
export async function registrarDisputaStripe(disputa: DisputaStripe, d: DbDisputa = db as unknown as DbDisputa): Promise<boolean> {
  if (!disputa?.id) return false;
  const chargeId = idDe(disputa.charge);
  const piId = idDe(disputa.payment_intent);
  const or = [...(chargeId ? [{ stripeChargeId: chargeId }] : []), ...(piId ? [{ stripePaymentIntentId: piId }] : [])];
  const pag = or.length
    ? await d.pagamento.findFirst({
        where: { OR: or },
        select: { id: true, consultaId: true, stripeTaxaCentavos: true, consulta: { select: { medicoId: true } }, pedidoRenovacao: { select: { medicoId: true } } },
      })
    : null;
  const taxaDisputa = taxaDaDisputa(disputa.balance_transactions);
  await d.chargeback.upsert({
    where: { stripeDisputeId: disputa.id },
    create: {
      stripeDisputeId: disputa.id,
      stripeChargeId: chargeId,
      pagamentoId: pag?.id ?? null,
      consultaId: pag?.consultaId ?? null,
      medicoId: pag?.consulta?.medicoId ?? pag?.pedidoRenovacao?.medicoId ?? null,
      valorCentavos: Math.max(0, disputa.amount ?? 0),
      taxaDisputaCentavos: taxaDisputa,
      taxaCartaoCentavos: pag?.stripeTaxaCentavos ?? null,
      statusStripe: disputa.status,
      motivoStripe: disputa.reason ?? null,
    },
    update: {
      statusStripe: disputa.status,
      ...(taxaDisputa !== null ? { taxaDisputaCentavos: taxaDisputa } : {}),
    },
  });
  return true;
}

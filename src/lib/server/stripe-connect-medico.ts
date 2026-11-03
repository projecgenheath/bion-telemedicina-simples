import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe, tipoContaConnect, type TipoContaConnect } from "@/lib/server/stripe";

/**
 * Onboarding do médico no Stripe Connect (Médicos, PR C). Decisão do Alisson
 * 03/11 12:13: cobrança DIRETA na conta conectada do médico (90% dele, 10% de
 * application fee da BION).
 *
 * - A conta fica em PerfilMedico.stripeAccountId (o checkout e o reembolso já
 *   leem dali). Idempotente: se já existe conta, NUNCA cria outra; criação
 *   concorrente usa a mesma idempotency key no Stripe e o update só grava se a
 *   coluna ainda estiver vazia.
 * - Tipo da conta: tipoContaConnect() (env STRIPE_CONNECT_TIPO_CONTA, padrão
 *   standard). Nada aqui é amarrado a um tipo: Express pede card_payments +
 *   transfers; Standard não aceita capabilities na criação.
 * - Status (charges_enabled, payouts_enabled, details_submitted) gravado no
 *   PerfilMedico (migração 20261103f) pelo retorno do onboarding e pelo webhook
 *   account.updated (/api/stripe/webhook-connect). medicoPodeSerCobrado lê
 *   esse status gravado.
 */

export type StatusContaMedico = {
  conta: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  atualizadoEm: string | null;
  /** Pode receber consulta paga: charges_enabled E payouts_enabled. */
  pronta: boolean;
};

type ClienteStripe = Pick<Stripe, "accounts" | "accountLinks">;
export type DepsConnect = { stripe?: () => ClienteStripe; tipo?: TipoContaConnect; agora?: () => Date };

const SEL = {
  stripeAccountId: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  stripeContaAtualizadaEm: true,
} as const;

type PerfilStatus = {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeContaAtualizadaEm: Date | null;
};

export function statusDoPerfil(p: PerfilStatus | null): StatusContaMedico {
  const conta = p?.stripeAccountId?.trim() || null;
  const charges = !!conta && !!p?.stripeChargesEnabled;
  const payouts = !!conta && !!p?.stripePayoutsEnabled;
  return {
    conta,
    chargesEnabled: charges,
    payoutsEnabled: payouts,
    detailsSubmitted: !!conta && !!p?.stripeDetailsSubmitted,
    atualizadoEm: p?.stripeContaAtualizadaEm ? p.stripeContaAtualizadaEm.toISOString() : null,
    pronta: charges && payouts,
  };
}

function erro(msg: string, status: number) {
  return Object.assign(new Error(msg), { status });
}

async function perfilDoMedico(medicoId: string): Promise<PerfilStatus> {
  const p = await db.perfilMedico.findUnique({ where: { userId: medicoId }, select: SEL });
  if (!p) throw erro("Perfil de médico não encontrado.", 404);
  return p;
}

export async function statusContaMedico(medicoId: string): Promise<StatusContaMedico> {
  return statusDoPerfil(await perfilDoMedico(medicoId));
}

/** Parâmetros de criação conforme o tipo configurado (sem amarrar a nenhum). */
export function parametrosNovaConta(tipo: TipoContaConnect, medico: { id: string; email?: string | null }): Stripe.AccountCreateParams {
  const base: Stripe.AccountCreateParams = {
    type: tipo,
    country: "BR",
    metadata: { bionMedicoId: medico.id },
    ...(medico.email ? { email: medico.email } : {}),
  };
  if (tipo === "express") {
    base.capabilities = { card_payments: { requested: true }, transfers: { requested: true } };
  }
  return base;
}

/** Cria a conta conectada SÓ se ainda não houver uma. Devolve o status. */
export async function garantirContaMedico(
  medico: { id: string; email?: string | null },
  deps: DepsConnect = {},
): Promise<{ criada: boolean; status: StatusContaMedico }> {
  const atual = await perfilDoMedico(medico.id);
  if (atual.stripeAccountId?.trim()) return { criada: false, status: statusDoPerfil(atual) };

  const cli = (deps.stripe ?? stripe)();
  const tipo = deps.tipo ?? tipoContaConnect();
  const conta = await cli.accounts.create(parametrosNovaConta(tipo, medico), {
    idempotencyKey: `bion-conta-medico-${medico.id}-${tipo}`,
  });
  // Só grava se a coluna ainda estiver vazia (corrida entre duas abas).
  const r = await db.perfilMedico.updateMany({
    where: { userId: medico.id, stripeAccountId: null },
    data: {
      stripeAccountId: conta.id,
      stripeChargesEnabled: !!conta.charges_enabled,
      stripePayoutsEnabled: !!conta.payouts_enabled,
      stripeDetailsSubmitted: !!conta.details_submitted,
      stripeContaAtualizadaEm: (deps.agora ?? (() => new Date()))(),
    },
  });
  return { criada: r.count > 0, status: await statusContaMedico(medico.id) };
}

/** Link de onboarding (type account_onboarding) para a conta do médico. */
export async function linkOnboardingMedico(
  medico: { id: string; email?: string | null },
  baseUrl: string,
  deps: DepsConnect = {},
): Promise<{ url: string; expiraEm: string }> {
  const { status } = await garantirContaMedico(medico, deps);
  if (!status.conta) throw erro("Não foi possível criar a conta Stripe agora.", 502);
  const base = baseUrl.replace(/\/+$/, "");
  const link = await (deps.stripe ?? stripe)().accountLinks.create({
    account: status.conta,
    type: "account_onboarding",
    refresh_url: `${base}/api/medico/stripe/conta/retorno?refresh=1`,
    return_url: `${base}/api/medico/stripe/conta/retorno`,
  });
  return { url: link.url, expiraEm: new Date(link.expires_at * 1000).toISOString() };
}

/**
 * Grava no PerfilMedico o status de uma conta lida no Stripe (retorno do
 * onboarding ou webhook account.updated). Só atualiza o perfil que JÁ tem
 * essa conta; conta desconhecida = 0 linhas (não cria vínculo novo).
 */
export async function gravarStatusConta(conta: Stripe.Account, agora = new Date()): Promise<boolean> {
  const r = await db.perfilMedico.updateMany({
    where: { stripeAccountId: conta.id },
    data: {
      stripeChargesEnabled: !!conta.charges_enabled,
      stripePayoutsEnabled: !!conta.payouts_enabled,
      stripeDetailsSubmitted: !!conta.details_submitted,
      stripeContaAtualizadaEm: agora,
    },
  });
  return r.count > 0;
}

/** Relê a conta do médico no Stripe (accounts.retrieve) e grava o status. */
export async function sincronizarContaMedico(medicoId: string, deps: DepsConnect = {}): Promise<StatusContaMedico> {
  const atual = await perfilDoMedico(medicoId);
  const conta = atual.stripeAccountId?.trim();
  if (!conta) return statusDoPerfil(atual);
  const a = await (deps.stripe ?? stripe)().accounts.retrieve(conta);
  await gravarStatusConta(a, (deps.agora ?? (() => new Date()))());
  return statusContaMedico(medicoId);
}

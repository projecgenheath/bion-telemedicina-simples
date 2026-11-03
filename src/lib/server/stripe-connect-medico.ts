import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe, tipoContaConnect, type TipoContaConnect } from "@/lib/server/stripe";
import { bloqueioChaveLive } from "@/lib/stripe-checkout-logica";

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
  /** requirements.disabled_reason do Stripe (null = sem bloqueio). */
  motivoBloqueio: string | null;
  /** Quantidade de requirements.currently_due (pendências no Stripe). */
  pendencias: number;
  /** Pode receber consulta paga: charges_enabled E payouts_enabled. */
  pronta: boolean;
};

type ClienteStripe = Pick<Stripe, "accounts" | "accountLinks">;
export type DepsConnect = { stripe?: () => ClienteStripe; tipo?: TipoContaConnect; agora?: () => Date; chave?: string };

/** Código de erro das rotas de onboarding com chave live (trava do Alisson, 03/11 12:28). */
export const CODIGO_CHAVE_LIVE = "stripe_chave_live_bloqueada";

/**
 * Trava sk_live_ (mesma regra do checkout, bloqueioChaveLive): enquanto o
 * Alisson não liberar, o onboarding só roda com chave de TESTE. Lança erro
 * 503 com `codigo` antes de qualquer chamada que cria algo no Stripe.
 */
export function exigirChaveTeste(chave: string | undefined = process.env.STRIPE_SECRET_KEY) {
  if (bloqueioChaveLive("direta", chave)) {
    throw Object.assign(new Error("Cadastro no Stripe indisponível no momento."), { status: 503, codigo: CODIGO_CHAVE_LIVE });
  }
}

const SEL = {
  stripeAccountId: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  stripeContaAtualizadaEm: true,
  stripeMotivoBloqueio: true,
  stripePendencias: true,
} as const;

type PerfilStatus = {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeContaAtualizadaEm: Date | null;
  stripeMotivoBloqueio?: string | null;
  stripePendencias?: number | null;
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
    motivoBloqueio: conta ? p?.stripeMotivoBloqueio ?? null : null,
    pendencias: conta ? Math.max(0, p?.stripePendencias ?? 0) : 0,
    pronta: charges && payouts,
  };
}

/** Resposta 503 com `codigo` para a trava sk_live_; null para outros erros. */
export function respostaErroConnect(e: unknown): Response | null {
  if (!ehChaveLiveBloqueada(e)) return null;
  return Response.json({ erro: "Cadastro no Stripe indisponível no momento.", codigo: CODIGO_CHAVE_LIVE }, { status: 503 });
}

/**
 * Trava live: a nossa (exigirChaveTeste, antes do banco) ou a do cliente
 * stripe() do Admin (ChaveLiveBloqueadaError, lançada mais fundo). Conferida
 * pelo nome para não depender da classe (mocks de teste).
 */
export function ehChaveLiveBloqueada(e: unknown): boolean {
  const x = e as { codigo?: string; name?: string } | null;
  return x?.codigo === CODIGO_CHAVE_LIVE || x?.name === "ChaveLiveBloqueadaError";
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

/**
 * País da conta conectada: env STRIPE_CONNECT_PAIS (padrão "BR"). Só aceita
 * código ISO de 2 letras; qualquer outra coisa volta para "BR". Permite testar
 * com a plataforma de teste US/USD sem mudar código.
 */
export function paisContaConnect(valor: string | undefined = process.env.STRIPE_CONNECT_PAIS): string {
  const v = (valor ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : "BR";
}

/** Parâmetros de criação conforme o tipo configurado (sem amarrar a nenhum). */
export function parametrosNovaConta(tipo: TipoContaConnect, medico: { id: string; email?: string | null }): Stripe.AccountCreateParams {
  const base: Stripe.AccountCreateParams = {
    type: tipo,
    country: paisContaConnect(),
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

  exigirChaveTeste(deps.chave);
  const cli = (deps.stripe ?? stripe)();
  const tipo = deps.tipo ?? tipoContaConnect();
  const conta = await cli.accounts.create(parametrosNovaConta(tipo, medico), {
    idempotencyKey: `bion-conta-medico-${medico.id}-${tipo}`,
  });
  // Só grava se a coluna ainda estiver vazia (null ou ""; corrida entre abas).
  const r = await db.perfilMedico.updateMany({
    where: { userId: medico.id, OR: [{ stripeAccountId: null }, { stripeAccountId: "" }] },
    data: { stripeAccountId: conta.id, ...dadosStatus(conta), stripeContaAtualizadaEm: (deps.agora ?? (() => new Date()))() },
  });
  return { criada: r.count > 0, status: await statusContaMedico(medico.id) };
}

/**
 * Link de onboarding (type account_onboarding). criar=true (POST
 * /api/medico/stripe/conta/link) cria a conta se faltar; criar=false (refresh
 * do retorno, GET) NUNCA cria: sem conta devolve null.
 */
export async function linkOnboardingMedico(
  medico: { id: string; email?: string | null },
  baseUrl: string,
  deps: DepsConnect = {},
  opcoes: { criar?: boolean } = {},
): Promise<{ url: string; expiraEm: string } | null> {
  exigirChaveTeste(deps.chave);
  const criar = opcoes.criar ?? true;
  const status = criar ? (await garantirContaMedico(medico, deps)).status : await statusContaMedico(medico.id);
  if (!status.conta) {
    if (criar) throw erro("Não foi possível criar a conta Stripe agora.", 502);
    return null;
  }
  const base = baseUrl.replace(/\/+$/, "");
  const link = await (deps.stripe ?? stripe)().accountLinks.create({
    account: status.conta,
    type: "account_onboarding",
    refresh_url: `${base}/api/medico/stripe/conta/retorno?refresh=1`,
    return_url: `${base}/api/medico/stripe/conta/retorno`,
  });
  return { url: link.url, expiraEm: new Date(link.expires_at * 1000).toISOString() };
}

function dadosStatus(conta: Stripe.Account) {
  return {
    stripeChargesEnabled: !!conta.charges_enabled,
    stripePayoutsEnabled: !!conta.payouts_enabled,
    stripeDetailsSubmitted: !!conta.details_submitted,
    stripeMotivoBloqueio: conta.requirements?.disabled_reason ?? null,
    stripePendencias: conta.requirements?.currently_due?.length ?? 0,
  };
}

/**
 * Grava no PerfilMedico o status de uma conta lida no Stripe (retorno do
 * onboarding ou webhook account.updated). Só atualiza o perfil que JÁ tem
 * essa conta; conta desconhecida = 0 linhas (não cria vínculo novo).
 */
export async function gravarStatusConta(conta: Stripe.Account, agora = new Date()): Promise<boolean> {
  const r = await db.perfilMedico.updateMany({
    where: { stripeAccountId: conta.id },
    data: { ...dadosStatus(conta), stripeContaAtualizadaEm: agora },
  });
  return r.count > 0;
}

/**
 * Webhook account.updated: a ORDEM dos eventos não é garantida, então o
 * payload não é gravado; a conta é relida no Stripe (estado atual) e só então
 * gravada. Conta que não é de nenhum médico: nada é gravado (nem lido).
 */
export async function sincronizarContaDoEvento(contaId: string, deps: DepsConnect = {}): Promise<boolean> {
  const id = contaId?.trim();
  if (!id) return false;
  const dono = await db.perfilMedico.findFirst({ where: { stripeAccountId: id }, select: { userId: true } });
  if (!dono) return false;
  const a = await (deps.stripe ?? stripe)().accounts.retrieve(id);
  return gravarStatusConta(a, (deps.agora ?? (() => new Date()))());
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

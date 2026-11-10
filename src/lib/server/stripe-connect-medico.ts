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
 *   leem dali). Idempotente: se já existe conta no banco, NUNCA cria outra.
 *   Antes de criar, lista as contas Connect (auto-paginação) e reaproveita
 *   qualquer uma cuja metadata aponte para o médico (perfilMedicoId / medicoId,
 *   plataforma 'bion'). Na criação grava essa metadata e usa a idempotency
 *   key `bion-connect-medico-<perfilMedicoId>-<tipo>-<pais>` (sem o e-mail;
 *   a do Stripe expira em ~24 h e exige os MESMOS parâmetros). Se o create
 *   falhar com StripeIdempotencyError, busca de novo pela metadata; se não
 *   achar a conta, devolve 409 `stripe_tente_novamente`.
 *   O update só grava se a coluna ainda estiver vazia (null ou "").
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

type ListaContas = {
  list(params?: Stripe.AccountListParams): Promise<{ data: Stripe.Account[]; has_more?: boolean }> | AsyncIterable<Stripe.Account>;
};
type ClienteStripe = {
  accounts: Pick<Stripe["accounts"], "create" | "retrieve"> & Partial<ListaContas>;
  accountLinks: Stripe["accountLinks"];
};

export type DepsConnect = { stripe?: () => ClienteStripe; tipo?: TipoContaConnect; agora?: () => Date; chave?: string };

/** Código de erro das rotas de onboarding com chave live (trava do Alisson, 03/11 12:28). */
export const CODIGO_CHAVE_LIVE = "stripe_chave_live_bloqueada";
export const CODIGO_TENTE_NOVAMENTE = "stripe_tente_novamente";
export const MSG_TENTE_NOVAMENTE = "Não foi possível concluir o cadastro no Stripe agora. Tente de novo em alguns minutos.";

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
  id: true,
  stripeAccountId: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  stripeContaAtualizadaEm: true,
  stripeMotivoBloqueio: true,
  stripePendencias: true,
} as const;

type PerfilStatus = {
  id: string;
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

/** 503 da trava sk_live_ ou 409 de idempotência sem conta para reaproveitar; null para outros erros. */
export function respostaErroConnect(e: unknown): Response | null {
  if (ehChaveLiveBloqueada(e)) {
    return Response.json({ erro: "Cadastro no Stripe indisponível no momento.", codigo: CODIGO_CHAVE_LIVE }, { status: 503 });
  }
  const x = e as { codigo?: string; message?: string; status?: number } | null;
  if (x?.codigo === CODIGO_TENTE_NOVAMENTE) {
    return Response.json({ erro: x.message ?? MSG_TENTE_NOVAMENTE, codigo: CODIGO_TENTE_NOVAMENTE }, { status: 409 });
  }
  return null;
}

/** StripeIdempotencyError ou o equivalente (type/rawType idempotency_error), sem depender da classe (mocks). */
export function ehIdempotenciaStripe(e: unknown): boolean {
  const x = e as { name?: string; type?: string; rawType?: string; raw?: { type?: string } } | null;
  return (
    x?.name === "StripeIdempotencyError" ||
    x?.type === "idempotency_error" ||
    x?.rawType === "idempotency_error" ||
    x?.raw?.type === "idempotency_error"
  );
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

export type IdsMedicoConnect = { perfilMedicoId: string; medicoId: string };

/**
 * Idempotency key por perfil + tipo + país (sem o e-mail: o médico pode
 * corrigir o e-mail sem invalidar a chave). Tipo e país entram para que uma
 * mudança desses parâmetros não reaproveite uma chave de 24 h com outro body.
 */
export function chaveIdempotenciaConta(
  perfilMedicoId: string,
  tipo: TipoContaConnect = tipoContaConnect(),
  pais: string = paisContaConnect(),
): string {
  return `bion-connect-medico-${perfilMedicoId}-${tipo}-${pais}`;
}

/** Metadata gravada na criação; a busca posterior filtra por ela (Stripe não tem search de accounts). */
export function metadataNovaConta(ids: IdsMedicoConnect): { perfilMedicoId: string; medicoId: string; plataforma: "bion" } {
  return { perfilMedicoId: ids.perfilMedicoId, medicoId: ids.medicoId, plataforma: "bion" };
}

export function contaComMetadataDoMedico(
  conta: { metadata?: Stripe.Metadata | null },
  ids: IdsMedicoConnect,
): boolean {
  const m = conta.metadata ?? {};
  if (m.plataforma && m.plataforma !== "bion") return false;
  return m.perfilMedicoId === ids.perfilMedicoId || m.medicoId === ids.medicoId || m.bionMedicoId === ids.medicoId;
}

/**
 * Lista as contas Connect com auto-paginação e devolve a primeira cuja
 * metadata aponta para este médico. Sem `accounts.list` (cliente de teste
 * antigo) = não achou; o create com a idempotency key cobre o buraco.
 *
 * TODO(Médicos): `accounts.list` lê todas as contas a cada médico novo, o que
 * pesa no limite de taxa com milhares de médicos. Trocar por uma busca no
 * banco ou por um índice próprio, quando houver esse volume.
 */
export async function buscarContaPorMetadata(cli: ClienteStripe, ids: IdsMedicoConnect): Promise<Stripe.Account | null> {
  const listar = cli.accounts.list;
  if (typeof listar !== "function") return null;

  const combinar = (a: Stripe.Account) => (contaComMetadataDoMedico(a, ids) ? a : null);
  const res = listar({ limit: 100 });
  if (res && typeof (res as AsyncIterable<Stripe.Account>)[Symbol.asyncIterator] === "function") {
    for await (const a of res as AsyncIterable<Stripe.Account>) {
      const achada = combinar(a);
      if (achada) return achada;
    }
    return null;
  }

  let startingAfter: string | undefined;
  let pagina = res as Promise<{ data: Stripe.Account[]; has_more?: boolean }>;
  for (;;) {
    const page = await pagina;
    const data = page?.data ?? [];
    const achada = data.find((a) => contaComMetadataDoMedico(a, ids));
    if (achada) return achada;
    if (!page?.has_more || data.length === 0) return null;
    startingAfter = data[data.length - 1]?.id;
    if (!startingAfter) return null;
    pagina = listar({ limit: 100, starting_after: startingAfter }) as Promise<{ data: Stripe.Account[]; has_more?: boolean }>;
  }
}

export type MedicoConnect = { id: string; email?: string | null; perfilMedicoId?: string };

/** Parâmetros de criação conforme o tipo configurado (sem amarrar a nenhum). */
export function parametrosNovaConta(tipo: TipoContaConnect, medico: MedicoConnect & { perfilMedicoId: string }): Stripe.AccountCreateParams {
  const base: Stripe.AccountCreateParams = {
    type: tipo,
    country: paisContaConnect(),
    metadata: metadataNovaConta({ perfilMedicoId: medico.perfilMedicoId, medicoId: medico.id }),
    ...(medico.email ? { email: medico.email } : {}),
  };
  if (tipo === "express") {
    base.capabilities = { card_payments: { requested: true }, transfers: { requested: true } };
  }
  return base;
}

async function gravarContaNoPerfil(medicoId: string, conta: Stripe.Account, agora: Date): Promise<boolean> {
  const r = await db.perfilMedico.updateMany({
    where: { userId: medicoId, OR: [{ stripeAccountId: null }, { stripeAccountId: "" }] },
    data: { stripeAccountId: conta.id, ...dadosStatus(conta), stripeContaAtualizadaEm: agora },
  });
  return r.count > 0;
}

/** Cria a conta conectada SÓ se ainda não houver uma (banco ou metadata no Stripe). */
export async function garantirContaMedico(
  medico: MedicoConnect,
  deps: DepsConnect = {},
): Promise<{ criada: boolean; status: StatusContaMedico }> {
  const atual = await perfilDoMedico(medico.id);
  if (atual.stripeAccountId?.trim()) return { criada: false, status: statusDoPerfil(atual) };

  exigirChaveTeste(deps.chave);
  const cli = (deps.stripe ?? stripe)();
  const tipo = deps.tipo ?? tipoContaConnect();
  const ids = { perfilMedicoId: atual.id, medicoId: medico.id };
  const pais = paisContaConnect();
  const existente = await buscarContaPorMetadata(cli, ids);
  let conta = existente;
  let criadaAgora = false;
  if (!conta) {
    try {
      conta = await cli.accounts.create(parametrosNovaConta(tipo, { ...medico, perfilMedicoId: atual.id }), {
        idempotencyKey: chaveIdempotenciaConta(atual.id, tipo, pais),
      });
      criadaAgora = true;
    } catch (e) {
      // Chave reutilizada com outros parâmetros, ou create anterior falhou na
      // Stripe e ficou preso na janela de 24 h: tenta reaproveitar a conta.
      if (!ehIdempotenciaStripe(e)) throw e;
      conta = await buscarContaPorMetadata(cli, ids);
      if (!conta) {
        throw Object.assign(new Error(MSG_TENTE_NOVAMENTE), { status: 409, codigo: CODIGO_TENTE_NOVAMENTE });
      }
    }
  }
  await gravarContaNoPerfil(medico.id, conta, (deps.agora ?? (() => new Date()))());
  // `criada` = esta chamada pediu accounts.create (conta nova no Stripe).
  // Reaproveitar metadata ou perder a corrida no updateMany: criada = false.
  const status = await statusContaMedico(medico.id);
  return { criada: criadaAgora && !!status.conta, status };
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

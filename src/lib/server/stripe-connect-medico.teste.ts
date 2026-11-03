/**
 * Onboarding Stripe Connect do médico (helper + rotas), com Stripe e banco falsos.
 * Rodar: bun --conditions=react-server test ./src/lib/server/stripe-connect-medico.teste.ts
 */
import { expect, mock, test } from "bun:test";

type Perfil = { userId: string; stripeAccountId: string | null; stripeChargesEnabled: boolean; stripePayoutsEnabled: boolean; stripeDetailsSubmitted: boolean; stripeContaAtualizadaEm: Date | null };
const perfis: Perfil[] = [];
const novo = (userId: string): Perfil => ({ userId, stripeAccountId: null, stripeChargesEnabled: false, stripePayoutsEnabled: false, stripeDetailsSubmitted: false, stripeContaAtualizadaEm: null });
const casa = (p: Perfil, w: Record<string, unknown>): boolean =>
  Object.entries(w).every(([k, v]) => (k === "OR" ? (v as Record<string, unknown>[]).some((o) => casa(p, o)) : (p as Record<string, unknown>)[k] === v));
(globalThis as unknown as { prisma: unknown }).prisma = {
  perfilMedico: {
    findUnique: async ({ where }: { where: { userId: string } }) => perfis.find((p) => p.userId === where.userId) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => perfis.find((p) => casa(p, where)) ?? null,
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Perfil> }) => {
      const alvo = perfis.filter((p) => casa(p, where));
      alvo.forEach((p) => Object.assign(p, data));
      return { count: alvo.length };
    },
  },
};

let sessao: { id: string; email: string; role: string } | null = { id: "m1", email: "m1@t.local", role: "MEDICO" };
mock.module("@/lib/server/auth", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!sessao) throw Object.assign(new Error("Não autenticado"), { status: 401 });
    if (!papeis.includes(sessao.role)) throw Object.assign(new Error("Acesso negado"), { status: 403 });
    return sessao;
  },
}));

const criadas: { params: Record<string, unknown>; chave?: string }[] = [];
type ContaFake = { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; requirements?: { disabled_reason: string | null; currently_due: string[] } };
const contasStripe: Record<string, ContaFake> = {};
let retrieves = 0;
const links: Record<string, unknown>[] = [];
const fake = {
  accounts: {
    create: async (params: Record<string, unknown>, opts?: { idempotencyKey?: string }) => {
      criadas.push({ params, chave: opts?.idempotencyKey });
      const id = `acct_${criadas.length}`;
      contasStripe[id] = { charges_enabled: false, payouts_enabled: false, details_submitted: false };
      return { id, ...contasStripe[id] };
    },
    retrieve: async (id: string) => {
      retrieves++;
      return { id, ...contasStripe[id] };
    },
  },
  accountLinks: {
    create: async (p: Record<string, unknown>) => {
      links.push(p);
      return { url: `https://connect.stripe.test/${String(p.account)}`, expires_at: 1_900_000_000 };
    },
  },
};
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
mock.module("@/lib/server/stripe", () => ({
  stripe: () => fake,
  tipoContaConnect: () => (process.env.STRIPE_CONNECT_TIPO_CONTA === "express" ? "express" : "standard"),
  stripeConnectAtivo: () => true,
}));

const h = await import("./stripe-connect-medico");
const cob = await import("@/lib/medico-cobravel");

test("parâmetros: standard sem capabilities; express pede card_payments + transfers; país BR", () => {
  const s = h.parametrosNovaConta("standard", { id: "m", email: "a@b" });
  expect(s.type).toBe("standard");
  expect(s.country).toBe("BR");
  expect(s.capabilities).toBeUndefined();
  const e = h.parametrosNovaConta("express", { id: "m" });
  expect(e.capabilities).toEqual({ card_payments: { requested: true }, transfers: { requested: true } });
});

test("garantirContaMedico é idempotente: nunca cria segunda conta", async () => {
  perfis.push(novo("m1"));
  const a = await h.garantirContaMedico({ id: "m1", email: "m1@t.local" });
  expect(a.criada).toBe(true);
  expect(a.status.conta).toBe("acct_1");
  expect(criadas[0].chave).toBe("bion-conta-medico-m1-standard");
  const b = await h.garantirContaMedico({ id: "m1" });
  expect(b.criada).toBe(false);
  expect(criadas.length).toBe(1);
});

test("sync grava status e medicoPodeSerCobrado usa o status gravado (charges E payouts)", async () => {
  expect(await cob.medicoPodeSerCobrado("direta", "acct_1")).toBe(false);
  contasStripe.acct_1 = { charges_enabled: true, payouts_enabled: false, details_submitted: true };
  const s1 = await h.sincronizarContaMedico("m1");
  expect(s1.pronta).toBe(false);
  expect(await cob.medicoPodeSerCobrado("direta", "acct_1")).toBe(false);
  contasStripe.acct_1.payouts_enabled = true;
  await h.gravarStatusConta({ id: "acct_1", ...contasStripe.acct_1 } as never);
  expect(await cob.medicoPodeSerCobrado("direta", "acct_1")).toBe(true);
  expect(await cob.medicoPodeSerCobrado("direta", "acct_desconhecida")).toBe(false);
  expect(await h.gravarStatusConta({ id: "acct_x", charges_enabled: true } as never)).toBe(false);
});

test("rotas: GET status, POST cria (idempotente), link, retorno; só médico", async () => {
  perfis.push(novo("m2"));
  sessao = { id: "m2", email: "m2@t.local", role: "MEDICO" };
  const conta = await import("@/app/api/medico/stripe/conta/route");
  const g = await (await conta.GET()).json();
  expect(g.temConta).toBe(false);
  expect(JSON.stringify(g)).not.toContain("acct_");
  const p1 = await (await conta.POST()).json();
  const p2 = await (await conta.POST()).json();
  expect(p1.criada).toBe(true);
  expect(p2.criada).toBe(false);
  expect(criadas.length).toBe(2);

  const { NextRequest } = await import("next/server");
  const link = await import("@/app/api/medico/stripe/conta/link/route");
  const l = await (await link.POST(new NextRequest("https://app.test/api/medico/stripe/conta/link", { method: "POST" }))).json();
  expect(l.url).toBe("https://connect.stripe.test/acct_2");
  expect(links.at(-1)?.return_url).toBe("https://app.test/api/medico/stripe/conta/retorno");

  const ret = await import("@/app/api/medico/stripe/conta/retorno/route");
  contasStripe.acct_2 = { charges_enabled: true, payouts_enabled: true, details_submitted: true };
  const r = await ret.GET(new NextRequest("https://app.test/api/medico/stripe/conta/retorno"));
  expect(r.headers.get("location")).toBe("https://app.test/painel?painel=perfil&stripe=ok");
  expect(perfis.find((x) => x.userId === "m2")?.stripeChargesEnabled).toBe(true);
  const rf = await ret.GET(new NextRequest("https://app.test/api/medico/stripe/conta/retorno?refresh=1"));
  expect(rf.headers.get("location")).toBe("https://connect.stripe.test/acct_2");

  sessao = { id: "p1", email: "p@t", role: "PACIENTE" };
  expect((await conta.GET()).status).toBe(403);
  expect((await conta.POST()).status).toBe(403);
  sessao = null;
  const semLogin = await ret.GET(new NextRequest("https://app.test/api/medico/stripe/conta/retorno"));
  expect(semLogin.headers.get("location")).toBe("https://app.test/entrar");
});

test("trava sk_live_: helper e rotas recusam com 503 + código; nada é criado", async () => {
  const antes = criadas.length;
  perfis.push(novo("m3"));
  await expect(h.garantirContaMedico({ id: "m3" }, { chave: "sk_live_x" })).rejects.toMatchObject({ status: 503, codigo: h.CODIGO_CHAVE_LIVE });
  await expect(h.garantirContaMedico({ id: "m3" }, { chave: "rk_live_x" })).rejects.toMatchObject({ status: 503, codigo: h.CODIGO_CHAVE_LIVE });
  await expect(h.linkOnboardingMedico({ id: "m1" }, "https://app.test", { chave: "sk_live_x" })).rejects.toMatchObject({ codigo: h.CODIGO_CHAVE_LIVE });
  sessao = { id: "m3", email: "m3@t.local", role: "MEDICO" };
  process.env.STRIPE_SECRET_KEY = "sk_live_fake";
  try {
    const conta = await import("@/app/api/medico/stripe/conta/route");
    const r = await conta.POST();
    expect(r.status).toBe(503);
    expect((await r.json()).codigo).toBe("stripe_chave_live_bloqueada");
    const { NextRequest } = await import("next/server");
    const link = await import("@/app/api/medico/stripe/conta/link/route");
    const l = await link.POST(new NextRequest("https://app.test/x", { method: "POST" }));
    expect(l.status).toBe(503);
    const ret = await import("@/app/api/medico/stripe/conta/retorno/route");
    perfis.find((p) => p.userId === "m3")!.stripeAccountId = "acct_m3";
    const rr = await ret.GET(new NextRequest("https://app.test/api/medico/stripe/conta/retorno?refresh=1"));
    expect(rr.headers.get("location")).toBe("https://app.test/painel?painel=perfil&stripe=indisponivel");
  } finally {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  }
  expect(criadas.length).toBe(antes);
});

test("refresh=1 sem conta NÃO cria conta; volta com stripe=sem_conta", async () => {
  perfis.push(novo("m4"));
  sessao = { id: "m4", email: "m4@t.local", role: "MEDICO" };
  const antes = criadas.length;
  const { NextRequest } = await import("next/server");
  const ret = await import("@/app/api/medico/stripe/conta/retorno/route");
  const r = await ret.GET(new NextRequest("https://app.test/api/medico/stripe/conta/retorno?refresh=1"));
  expect(r.headers.get("location")).toBe("https://app.test/painel?painel=perfil&stripe=sem_conta");
  expect(criadas.length).toBe(antes);
});

test("guarda do updateMany: stripeAccountId \"\" conta como vazio", async () => {
  const p = novo("m5");
  p.stripeAccountId = "";
  perfis.push(p);
  const r = await h.garantirContaMedico({ id: "m5" });
  expect(r.criada).toBe(true);
  expect(p.stripeAccountId).toMatch(/^acct_/);
});

test("requirements gravados e expostos (disabled_reason, currently_due)", async () => {
  contasStripe.acct_1 = { charges_enabled: false, payouts_enabled: false, details_submitted: true, requirements: { disabled_reason: "requirements.past_due", currently_due: ["individual.id_number", "external_account"] } };
  const s = await h.sincronizarContaMedico("m1");
  expect(s.motivoBloqueio).toBe("requirements.past_due");
  expect(s.pendencias).toBe(2);
  sessao = { id: "m1", email: "m1@t.local", role: "MEDICO" };
  const conta = await import("@/app/api/medico/stripe/conta/route");
  const g = await (await conta.GET()).json();
  expect(g.pendencias).toBe(2);
  expect(g.motivoBloqueio).toBe("requirements.past_due");
});

test("webhook account.updated fora de ordem: relê a conta no Stripe (estado atual), não grava o payload", async () => {
  contasStripe.acct_1 = { charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { disabled_reason: null, currently_due: [] } };
  const antes = retrieves;
  // evento ANTIGO chega por último dizendo charges=false: o estado gravado é o atual (true)
  expect(await h.sincronizarContaDoEvento("acct_1")).toBe(true);
  expect(retrieves).toBe(antes + 1);
  expect(await cob.medicoPodeSerCobrado("direta", "acct_1")).toBe(true);
  // conta de ninguém: não lê nem grava
  expect(await h.sincronizarContaDoEvento("acct_estranha")).toBe(false);
  expect(retrieves).toBe(antes + 1);
});

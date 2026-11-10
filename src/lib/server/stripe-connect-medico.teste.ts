/**
 * Onboarding Stripe Connect do médico (helper + rotas), com Stripe e banco falsos.
 * Rodar: bun --conditions=react-server test ./src/lib/server/stripe-connect-medico.teste.ts
 */
import { expect, mock, test } from "bun:test";

type Perfil = { id: string; userId: string; stripeAccountId: string | null; stripeChargesEnabled: boolean; stripePayoutsEnabled: boolean; stripeDetailsSubmitted: boolean; stripeContaAtualizadaEm: Date | null };
const perfis: Perfil[] = [];
const novo = (userId: string): Perfil => ({ id: `pf-${userId}`, userId, stripeAccountId: null, stripeChargesEnabled: false, stripePayoutsEnabled: false, stripeDetailsSubmitted: false, stripeContaAtualizadaEm: null });
let falharGravacao = 0;
/** Se definido, o próximo accounts.create lança StripeIdempotencyError; "achar" grava a conta na lista antes. */
let falhaIdempotencia: { medicoId: string; modo: "achar" | "vazio" } | null = null;
const casa = (p: Perfil, w: Record<string, unknown>): boolean =>
  Object.entries(w).every(([k, v]) => (k === "OR" ? (v as Record<string, unknown>[]).some((o) => casa(p, o)) : (p as Record<string, unknown>)[k] === v));
(globalThis as unknown as { prisma: unknown }).prisma = {
  perfilMedico: {
    findUnique: async ({ where }: { where: { userId: string } }) => perfis.find((p) => p.userId === where.userId) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => perfis.find((p) => casa(p, where)) ?? null,
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Perfil> }) => {
      if (falharGravacao > 0) {
        falharGravacao--;
        throw new Error("falha de teste no banco");
      }
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

const criadas: { params: Record<string, unknown>; chave?: string; id?: string }[] = [];
type ContaFake = { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; requirements?: { disabled_reason: string | null; currently_due: string[] }; metadata?: Record<string, string> };
const contasStripe: Record<string, ContaFake> = {};
let retrieves = 0;
const links: Record<string, unknown>[] = [];
const fake = {
  accounts: {
    create: async (params: Record<string, unknown>, opts?: { idempotencyKey?: string }) => {
      if (falhaIdempotencia) {
        const { medicoId, modo } = falhaIdempotencia;
        falhaIdempotencia = null;
        if (modo === "achar") {
          const id = `acct_idem_${medicoId}`;
          contasStripe[id] = {
            charges_enabled: false,
            payouts_enabled: false,
            details_submitted: false,
            metadata: { perfilMedicoId: `pf-${medicoId}`, medicoId, plataforma: "bion" },
          };
        }
        throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), {
          name: "StripeIdempotencyError",
          type: "idempotency_error",
          rawType: "idempotency_error",
        });
      }
      const ja = criadas.find((c) => c.chave && opts?.idempotencyKey && c.chave === opts.idempotencyKey);
      if (ja?.id) return { id: ja.id, ...contasStripe[ja.id] };
      const id = `acct_${criadas.length + 1}`;
      criadas.push({ params, chave: opts?.idempotencyKey, id });
      contasStripe[id] = { charges_enabled: false, payouts_enabled: false, details_submitted: false, metadata: (params.metadata as Record<string, string> | undefined) ?? {} };
      return { id, ...contasStripe[id] };
    },
    list: async function* () {
      for (const [id, c] of Object.entries(contasStripe)) yield { id, ...c };
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
  const s = h.parametrosNovaConta("standard", { id: "m", email: "a@b", perfilMedicoId: "pf-m" });
  expect(s.type).toBe("standard");
  expect(s.country).toBe("BR");
  expect(s.capabilities).toBeUndefined();
  expect(s.metadata).toEqual({ perfilMedicoId: "pf-m", medicoId: "m", plataforma: "bion" });
  const e = h.parametrosNovaConta("express", { id: "m", perfilMedicoId: "pf-m" });
  expect(e.capabilities).toEqual({ card_payments: { requested: true }, transfers: { requested: true } });
});

test("garantirContaMedico é idempotente: nunca cria segunda conta", async () => {
  perfis.push(novo("m1"));
  const a = await h.garantirContaMedico({ id: "m1", email: "m1@t.local" });
  expect(a.criada).toBe(true);
  expect(a.status.conta).toBe("acct_1");
  expect(criadas[0].chave).toBe("bion-connect-medico-pf-m1-standard-BR");
  expect(h.chaveIdempotenciaConta("pf-m1")).toBe("bion-connect-medico-pf-m1-standard-BR");
  expect(criadas[0].params.metadata).toEqual({ perfilMedicoId: "pf-m1", medicoId: "m1", plataforma: "bion" });
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

test("ChaveLiveBloqueadaError lançada dentro do stripe() vira 503 stripe_chave_live_bloqueada", async () => {
  perfis.push(novo("m6"));
  sessao = { id: "m6", email: "m6@t.local", role: "MEDICO" };
  const original = fake.accounts.create;
  fake.accounts.create = async () => {
    throw Object.assign(new Error("Chave Stripe live bloqueada"), { name: "ChaveLiveBloqueadaError", codigo: "chave_live_bloqueada" });
  };
  try {
    const conta = await import("@/app/api/medico/stripe/conta/route");
    const r = await conta.POST();
    expect(r.status).toBe(503);
    expect((await r.json()).codigo).toBe("stripe_chave_live_bloqueada");
    const { NextRequest } = await import("next/server");
    const link = await import("@/app/api/medico/stripe/conta/link/route");
    expect((await link.POST(new NextRequest("https://app.test/x", { method: "POST" }))).status).toBe(503);
  } finally {
    fake.accounts.create = original;
  }
});

test("STRIPE_CONNECT_PAIS: padrão BR, US quando definido, inválido volta para BR", () => {
  const antes = process.env.STRIPE_CONNECT_PAIS;
  try {
    delete process.env.STRIPE_CONNECT_PAIS;
    expect(h.paisContaConnect()).toBe("BR");
    expect(h.parametrosNovaConta("standard", { id: "m", perfilMedicoId: "pf-m" }).country).toBe("BR");
    process.env.STRIPE_CONNECT_PAIS = " us ";
    expect(h.paisContaConnect()).toBe("US");
    expect(h.parametrosNovaConta("express", { id: "m", perfilMedicoId: "pf-m" }).country).toBe("US");
    for (const ruim of ["USA", "1A", "", "b"]) expect(h.paisContaConnect(ruim)).toBe("BR");
  } finally {
    if (antes === undefined) delete process.env.STRIPE_CONNECT_PAIS;
    else process.env.STRIPE_CONNECT_PAIS = antes;
  }
});

test("falha no banco depois do create: o retry reaproveita a conta (não cria segunda)", async () => {
  const p = novo("m7");
  perfis.push(p);
  falharGravacao = 1;
  const antes = criadas.length;
  await expect(h.garantirContaMedico({ id: "m7", email: "m7@t.local" })).rejects.toThrow("falha de teste no banco");
  expect(criadas.length).toBe(antes + 1);
  expect(p.stripeAccountId).toBeNull();
  const r = await h.garantirContaMedico({ id: "m7", email: "m7@t.local" });
  expect(criadas.length).toBe(antes + 1);
  expect(r.criada).toBe(false);
  expect(r.status.conta).toBe(criadas[antes]?.id);
  expect(p.stripeAccountId).toBe(criadas[antes]?.id);
});

test("conta já existente no Stripe (metadata do médico) é reaproveitada, sem create", async () => {
  const p = novo("m8");
  perfis.push(p);
  contasStripe.acct_ja = {
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    metadata: { perfilMedicoId: "pf-m8", medicoId: "m8", plataforma: "bion" },
  };
  const antes = criadas.length;
  const r = await h.garantirContaMedico({ id: "m8" });
  expect(criadas.length).toBe(antes);
  expect(r.criada).toBe(false);
  expect(r.status.conta).toBe("acct_ja");
  expect(p.stripeAccountId).toBe("acct_ja");
});

test("idempotency key inclui perfil, tipo e país, e não o e-mail", () => {
  expect(h.chaveIdempotenciaConta("pf-abc")).toBe("bion-connect-medico-pf-abc-standard-BR");
  expect(h.chaveIdempotenciaConta("pf-abc", "express", "US")).toBe("bion-connect-medico-pf-abc-express-US");
  expect(h.chaveIdempotenciaConta("pf-abc")).toBe(h.chaveIdempotenciaConta("pf-abc"));
});

test("StripeIdempotencyError: se a conta existir na metadata, reaproveita e grava", async () => {
  const p = novo("m9");
  perfis.push(p);
  falhaIdempotencia = { medicoId: "m9", modo: "achar" };
  const antes = criadas.length;
  const r = await h.garantirContaMedico({ id: "m9", email: "m9@t.local" });
  expect(criadas.length).toBe(antes);
  expect(r.criada).toBe(false);
  expect(r.status.conta).toBe("acct_idem_m9");
  expect(p.stripeAccountId).toBe("acct_idem_m9");
});

test("StripeIdempotencyError sem conta na metadata: 409 stripe_tente_novamente", async () => {
  const p = novo("m10");
  perfis.push(p);
  falhaIdempotencia = { medicoId: "m10", modo: "vazio" };
  const antes = criadas.length;
  await expect(h.garantirContaMedico({ id: "m10", email: "m10@t.local" })).rejects.toMatchObject({
    status: 409,
    codigo: "stripe_tente_novamente",
  });
  expect(criadas.length).toBe(antes);
  expect(p.stripeAccountId).toBeNull();

  sessao = { id: "m10", email: "m10@t.local", role: "MEDICO" };
  falhaIdempotencia = { medicoId: "m10", modo: "vazio" };
  const conta = await import("@/app/api/medico/stripe/conta/route");
  const res = await conta.POST();
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.codigo).toBe("stripe_tente_novamente");
  expect(String(body.erro).toLowerCase()).toContain("alguns minutos");
});

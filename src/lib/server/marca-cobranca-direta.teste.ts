/** Marca da cobrança direta. Rodar: bun --conditions=react-server test ./src/lib/server/marca-cobranca-direta.teste.ts */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const pagamentos: Record<string, { stripeContaMedico: string | null }> = {};
const remarcacoes: Record<string, { stripeContaMedico: string | null }> = {};
(globalThis as unknown as { prisma: unknown }).prisma = {
  pagamento: {
    update: async ({ where, data }: { where: { id: string }; data: { stripeContaMedico: string | null } }) => {
      const row = pagamentos[where.id] ?? (pagamentos[where.id] = { stripeContaMedico: "acct_inicial" });
      Object.assign(row, data);
      return row;
    },
  },
  remarcacaoPendente: {
    update: async ({ where, data }: { where: { id: string }; data: { stripeContaMedico: string | null } }) => {
      const row = remarcacoes[where.id] ?? (remarcacoes[where.id] = { stripeContaMedico: "acct_inicial" });
      Object.assign(row, data);
      return row;
    },
  },
};

const { contaMedicoDaCobranca, marcaCobrancaDireta, gravarContaMedicoDaCobranca } = await import("./marca-cobranca-direta");

// Simula a coluna: cada chamada do hook (checkout ou webhook) aplica marcaCobrancaDireta.
function registro() {
  const r = { stripeContaMedico: null as string | null };
  return { r, hook: (conta: string | null) => Object.assign(r, marcaCobrancaDireta(conta)) };
}

describe("marca da cobrança direta", () => {
  test("sessão direta abandonada, depois paga no modo plataforma: marca null", () => {
    const { r, hook } = registro();
    hook(contaMedicoDaCobranca("direta", { contaMedico: "acct_med" })); // checkout direta (abandonado)
    expect(r.stripeContaMedico).toBe("acct_med");
    hook(contaMedicoDaCobranca("plataforma", null)); // checkout plataforma
    hook(null); // webhook do pagamento sem event.account
    expect(r.stripeContaMedico).toBeNull();
  });
  test("webhook pago só com event.account já basta para limpar (sem novo checkout)", () => {
    const { r, hook } = registro();
    hook("acct_med");
    hook(null);
    expect(r.stripeContaMedico).toBeNull();
  });
  test("sessão direta, depois sessão plataforma limpa, depois webhook confirma com event.account", () => {
    const { r, hook } = registro();
    hook(contaMedicoDaCobranca("direta", { contaMedico: "acct_med" }));
    hook(contaMedicoDaCobranca("plataforma", null));
    expect(r.stripeContaMedico).toBeNull();
    hook("acct_med"); // pago de fato na sessão direta: o evento manda
    expect(r.stripeContaMedico).toBe("acct_med");
  });
  test("pago na direta: marca com event.account", () => {
    const { r, hook } = registro();
    hook(null);
    hook("acct_med");
    expect(r.stripeContaMedico).toBe("acct_med");
  });
  test("o hook não ignora null e o webhook chama nos dois caminhos pagos", () => {
    const hookSrc = readFileSync(new URL("./marca-cobranca-direta.ts", import.meta.url), "utf8");
    expect(/if \(!conta\) return/.test(hookSrc)).toBe(false);
    const wh = readFileSync(new URL("./stripe-webhook.ts", import.meta.url), "utf8");
    expect(wh).toContain("const conta = evento.account ?? null;");
    expect(wh).toContain("gravarContaMedicoDaCobranca({ pagamentoId: pagamento.id }, conta)");
    expect(wh).toContain("gravarContaMedicoDaCobranca({ remarcacaoId: r.id }, conta)");
  });
  test("marcaCobrancaDireta: string grava; null e \"\" viram null", () => {
    expect(marcaCobrancaDireta("acct_x")).toEqual({ stripeContaMedico: "acct_x" });
    expect(marcaCobrancaDireta("  acct_x  ")).toEqual({ stripeContaMedico: "acct_x" });
    expect(marcaCobrancaDireta(null)).toEqual({ stripeContaMedico: null });
    expect(marcaCobrancaDireta(undefined)).toEqual({ stripeContaMedico: null });
    expect(marcaCobrancaDireta("")).toEqual({ stripeContaMedico: null });
    expect(marcaCobrancaDireta("   ")).toEqual({ stripeContaMedico: null });
  });
});

describe("gravarContaMedicoDaCobranca (updates do Prisma)", () => {
  test("conta string grava a marca no Pagamento e na RemarcacaoPendente", async () => {
    pagamentos.p1 = { stripeContaMedico: null };
    remarcacoes.r1 = { stripeContaMedico: null };
    await gravarContaMedicoDaCobranca({ pagamentoId: "p1", remarcacaoId: "r1" }, "acct_med");
    expect(pagamentos.p1.stripeContaMedico).toBe("acct_med");
    expect(remarcacoes.r1.stripeContaMedico).toBe("acct_med");
  });
  test("conta null limpa a marca (grava null) nos dois registros", async () => {
    pagamentos.p2 = { stripeContaMedico: "acct_old" };
    remarcacoes.r2 = { stripeContaMedico: "acct_old" };
    await gravarContaMedicoDaCobranca({ pagamentoId: "p2", remarcacaoId: "r2" }, null);
    expect(pagamentos.p2.stripeContaMedico).toBeNull();
    expect(remarcacoes.r2.stripeContaMedico).toBeNull();
  });
  test("string vazia é tratada como null e limpa a marca", async () => {
    pagamentos.p3 = { stripeContaMedico: "acct_old" };
    remarcacoes.r3 = { stripeContaMedico: "acct_old" };
    await gravarContaMedicoDaCobranca({ pagamentoId: "p3" }, "");
    await gravarContaMedicoDaCobranca({ remarcacaoId: "r3" }, "   ");
    expect(pagamentos.p3.stripeContaMedico).toBeNull();
    expect(remarcacoes.r3.stripeContaMedico).toBeNull();
  });
});

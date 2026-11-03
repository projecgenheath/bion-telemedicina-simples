/** Marca da cobrança direta. Rodar: bun --conditions=react-server test ./src/lib/server/marca-cobranca-direta.teste.ts */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { contaMedicoDaCobranca, marcaCobrancaDireta } from "./marca-cobranca-direta";

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
});

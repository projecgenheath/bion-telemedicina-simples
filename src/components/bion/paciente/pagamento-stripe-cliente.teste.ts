/**
 * Testes de pagamento-stripe-cliente.ts (checkoutStripeAtivo).
 * Rodar: bun src/components/bion/paciente/pagamento-stripe-cliente.teste.ts
 *
 * Foco na regressão: uma falha de rede/HTTP no GET da flag NÃO pode ficar
 * cacheada — antes ela escondia todos os botões de pagar pela sessão toda.
 * Os cenários são sequenciais e compartilham o cache do módulo de propósito.
 */
import { checkoutStripeAtivo } from "./pagamento-stripe-cliente";

let ok = 0;
let falhas = 0;
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
  }
}

const fetchOriginal = globalThis.fetch;
let chamadas = 0;
function instalarFetch(impl: () => Promise<unknown>) {
  chamadas = 0;
  globalThis.fetch = (() => {
    chamadas++;
    return impl();
  }) as typeof fetch;
}
const respostaOk = (ativo: boolean) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ ativo }) } as Response);

// 1) HTTP de erro → false, e NÃO cacheia…
instalarFetch(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response));
eq("HTTP 500 → false", await checkoutStripeAtivo(), false);
eq("HTTP 500 fez 1 chamada", chamadas, 1);

// 2) …então a chamada seguinte vai à rede de novo (e falha de rede também dá false)…
instalarFetch(() => Promise.reject(new Error("sem rede")));
eq("falha de rede → false", await checkoutStripeAtivo(), false);
eq("falha de rede fez nova chamada (nada ficou cacheado)", chamadas, 1);

// 3) …e quando a rede volta, o botão descobre que o Stripe está ativo.
instalarFetch(() => respostaOk(true));
eq("rede de volta → true", await checkoutStripeAtivo(), true);
eq("sucesso fez 1 chamada", chamadas, 1);

// 4) Resposta boa fica em cache dentro do TTL: sem nova chamada.
eq("dentro do TTL → true do cache", await checkoutStripeAtivo(), true);
eq("dentro do TTL → nenhuma chamada nova", chamadas, 1);

globalThis.fetch = fetchOriginal;
console.log(`pagamento-stripe-cliente: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);

/**
 * Testes de reembolso-visivel.ts. Rodar: bun src/components/bion/paciente/reembolso-visivel.teste.ts
 */
import { centavosDoValorBRL, consultaTemReembolso, previaTemReembolso } from "./reembolso-visivel";

let ok = 0;
let falhas = 0;
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
  }
}

eq("R$ 0", centavosDoValorBRL("R$ 0"), 0);
eq("R$ 150", centavosDoValorBRL("R$ 150"), 15000);
eq("R$ 99,9", centavosDoValorBRL("R$ 99,9"), 9990);
eq("R$ 1.234,56", centavosDoValorBRL("R$ 1.234,56"), 123456);
eq("vazio", centavosDoValorBRL(undefined), null);
eq("lixo", centavosDoValorBRL("abc"), null);
eq("retorno grátis: sem reembolso", consultaTemReembolso({ pago: true, valor: "R$ 0" }), false);
eq("paga: com reembolso", consultaTemReembolso({ pago: true, valor: "R$ 150" }), true);
eq("não paga: sem reembolso", consultaTemReembolso({ pago: false, valor: "R$ 150" }), false);
eq("valor ausente conta como pago", consultaTemReembolso({ pago: true }), true);
eq("prévia valor 0", previaTemReembolso({ pago: true, valorCentavos: 0 }), false);
eq("prévia paga", previaTemReembolso({ pago: true, valorCentavos: 15000 }), true);
eq("prévia não paga", previaTemReembolso({ pago: false, valorCentavos: 15000 }), false);

console.log(`reembolso-visivel: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

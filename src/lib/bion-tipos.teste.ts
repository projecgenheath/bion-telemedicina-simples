/** Rodar: bun src/lib/bion-tipos.teste.ts */
import { fmtValorBRL } from "./bion-tipos";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}

// Contrato histórico: inteiro sai SEM centavos ("R$ 150" — telas e parsers
// como o de reembolso esperam esse formato); com centavos, sempre 2 casas.
igual("zero", fmtValorBRL(0), "R$ 0");
igual("inteiro", fmtValorBRL(150), "R$ 150");
igual("centavos", fmtValorBRL(149.9), "R$ 149,90");
igual("centavos redondos", fmtValorBRL(99.9), "R$ 99,90");
// O errinho corrigido: milhar agrupado (a fórmula manual saía "R$ 1234,56").
igual("milhar com centavos", fmtValorBRL(1234.56), "R$ 1.234,56");
igual("milhar inteiro", fmtValorBRL(1234), "R$ 1.234");
igual("milhão", fmtValorBRL(1000000.5), "R$ 1.000.000,50");
// Sem NBSP: a string usa o espaço comum, como a histórica.
igual("sem NBSP nem NBSP estreito", /[\u00a0\u202f]/.test(fmtValorBRL(1234.56)), false);

console.log(`bion-tipos: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

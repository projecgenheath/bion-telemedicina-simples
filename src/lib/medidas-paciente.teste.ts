/** Rodar: bun --conditions=react-server src/lib/medidas-paciente.teste.ts */
import { calcularImc, faixaImc, ROTULO_FAIXA_IMC } from "./medidas-paciente";

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

// Fronteiras das faixas OMS: o limite inferior pertence à faixa seguinte.
igual("17,0 abaixo", faixaImc(17), "abaixo");
igual("18,49 abaixo", faixaImc(18.49), "abaixo");
igual("18,5 normal", faixaImc(18.5), "normal");
igual("22,0 normal (caso do dono)", faixaImc(22), "normal");
igual("24,9 normal", faixaImc(24.9), "normal");
igual("25 sobrepeso", faixaImc(25), "sobrepeso");
igual("29,9 sobrepeso", faixaImc(29.9), "sobrepeso");
igual("30 obesidade", faixaImc(30), "obesidade");
igual("42 obesidade", faixaImc(42), "obesidade");

// Rótulos exibidos no card e no detalhe — os mesmos textos de antes.
igual("rótulo abaixo", ROTULO_FAIXA_IMC.abaixo, "Abaixo do peso");
igual("rótulo normal", ROTULO_FAIXA_IMC.normal, "Peso normal");
igual("rótulo sobrepeso", ROTULO_FAIXA_IMC.sobrepeso, "Sobrepeso");
igual("rótulo obesidade", ROTULO_FAIXA_IMC.obesidade, "Obesidade");
igual("toda faixa tem rótulo", ["abaixo", "normal", "sobrepeso", "obesidade"].every((f) => typeof ROTULO_FAIXA_IMC[f as keyof typeof ROTULO_FAIXA_IMC] === "string" && ROTULO_FAIXA_IMC[f as keyof typeof ROTULO_FAIXA_IMC].length > 0), true);

// Sanidade: calcularImc continua coerente com a faixa (70 kg, 178 cm ≈ 22,1).
const imc = calcularImc(70, 178);
igual("imc 70kg/178cm na faixa normal", imc !== null && faixaImc(imc) === "normal", true);

console.log(`medidas-paciente: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

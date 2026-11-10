/** Rodar: bun src/lib/cpf.teste.ts */
import { digitosCpf, formatarCpfExibicao, mascararCpfDigitacao } from "./cpf";

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

// --- digitosCpf ---
igual("dígitos de mascarado", digitosCpf("529.982.247-25"), "52998224725");
igual("dígitos de texto puro", digitosCpf("abc"), "");
igual("dígitos truncam em 11", digitosCpf("52998224725999"), "52998224725");
igual("dígitos de vazio", digitosCpf(""), "");

// --- mascararCpfDigitacao (progressiva) ---
igual("máscara vazia", mascararCpfDigitacao(""), "");
igual("máscara 1 dígito", mascararCpfDigitacao("5"), "5");
igual("máscara 3 dígitos", mascararCpfDigitacao("529"), "529");
igual("máscara 4 dígitos", mascararCpfDigitacao("5299"), "529.9");
igual("máscara 6 dígitos", mascararCpfDigitacao("529982"), "529.982");
igual("máscara 7 dígitos", mascararCpfDigitacao("5299822"), "529.982.2");
igual("máscara 9 dígitos", mascararCpfDigitacao("529982247"), "529.982.247");
igual("máscara 10 dígitos", mascararCpfDigitacao("5299822472"), "529.982.247-2");
igual("máscara completa", mascararCpfDigitacao("52998224725"), "529.982.247-25");
igual("máscara idempotente", mascararCpfDigitacao("529.982.247-25"), "529.982.247-25");
igual("máscara ignora letras", mascararCpfDigitacao("52a9"), "529");

// --- formatarCpfExibicao ---
igual("exibição de vazio", formatarCpfExibicao(""), "");
igual("exibição de undefined", formatarCpfExibicao(undefined), "");
igual("exibição de null", formatarCpfExibicao(null), "");
igual("exibição de dígitos puros", formatarCpfExibicao("52998224725"), "529.982.247-25");
igual("exibição de mascarado", formatarCpfExibicao("529.982.247-25"), "529.982.247-25");
igual("exibição de legado curto", formatarCpfExibicao("123"), "123");

console.log(`cpf: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

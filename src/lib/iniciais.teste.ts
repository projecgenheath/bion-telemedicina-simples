/** Rodar: bun src/lib/iniciais.teste.ts */
import { iniciaisNome } from "./iniciais";

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

igual("nome composto com partícula", iniciaisNome("Alisson de Santana Siqueira"), "AS");
igual("dois nomes", iniciaisNome("Marina Silva"), "MS");
igual("nome único", iniciaisNome("Madonna"), "M");
igual("só partícula no meio", iniciaisNome("Maria da Silva"), "MS");
igual("partícula no fim não conta", iniciaisNome("João Pedro de"), "JP");
igual("vazio", iniciaisNome(""), "?");
igual("só espaços", iniciaisNome("   "), "?");
igual("só partículas", iniciaisNome("de da"), "?");
igual("minúsculas viram maiúsculas", iniciaisNome("ana beatriz souza"), "AS");
igual("espaços duplos", iniciaisNome("Carlos  Eduardo   Lima"), "CL");

console.log(`iniciais: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);

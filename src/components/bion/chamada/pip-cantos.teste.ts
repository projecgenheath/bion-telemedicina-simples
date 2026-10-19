/**
 * Testes dos cantos do PiP (chamada/pip-cantos.ts).
 * Rodar: bun src/components/bion/chamada/pip-cantos.teste.ts
 */
import { cantoAposArrasto, cantoMaisProximo, classesCanto, foiArrasto } from "./pip-cantos";

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

// Tela 390×844
igual("superior esquerdo", cantoMaisProximo(60, 100, 390, 844), "sup-esq");
igual("superior direito", cantoMaisProximo(330, 100, 390, 844), "sup-dir");
igual("inferior esquerdo", cantoMaisProximo(60, 700, 390, 844), "inf-esq");
igual("inferior direito", cantoMaisProximo(330, 700, 390, 844), "inf-dir");
igual("no meio exato vai para baixo/direita", cantoMaisProximo(195, 422, 390, 844), "inf-dir");

igual("arrasto lento: canto mais perto", cantoAposArrasto("sup-dir", 100, 120, 390, 844, 0.1, 0.1), "sup-esq");
igual("peteleco para a esquerda troca de lado", cantoAposArrasto("sup-dir", 300, 120, 390, 844, -1.2, 0), "sup-esq");
igual("peteleco para baixo troca de cima para baixo", cantoAposArrasto("sup-dir", 300, 200, 390, 844, 0, 1.5), "inf-dir");
igual("peteleco diagonal", cantoAposArrasto("sup-dir", 300, 200, 390, 844, -1, 1), "inf-esq");

igual("6 px é toque", foiArrasto(4, 4), false);
igual("10 px é arrasto", foiArrasto(10, 0), true);

igual("canto inferior sobe com a barra", classesCanto("inf-dir", true).includes("7.5rem"), true);
igual("canto inferior desce sem a barra", classesCanto("inf-dir", false).includes("7.5rem"), false);
igual("canto esquerdo", classesCanto("sup-esq", true).includes("left-3"), true);

console.log(`pip-cantos: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);

/**
 * Testes de quando aparece o botão "Compartilhar tela" (chamada/compartilhar-tela.ts).
 * Rodar: bun src/components/bion/chamada/compartilhar-tela.teste.ts
 */
import { podeCompartilharTela } from "./compartilhar-tela";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${JSON.stringify(obtido)} — esperado ${JSON.stringify(esperado)}`);
  }
}

const CHROME_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

igual("PC com mouse e getDisplayMedia", podeCompartilharTela({ temGetDisplayMedia: true, ponteiroFino: true, userAgent: CHROME_PC }), true);
igual("Mac com trackpad", podeCompartilharTela({ temGetDisplayMedia: true, ponteiroFino: true, userAgent: MAC, maxTouchPoints: 0 }), true);
igual("sem getDisplayMedia", podeCompartilharTela({ temGetDisplayMedia: false, ponteiroFino: true, userAgent: CHROME_PC }), false);
igual("PC com tela de toque como ponteiro principal", podeCompartilharTela({ temGetDisplayMedia: true, ponteiroFino: false, userAgent: CHROME_PC }), false);
igual("Android (mesmo com mouse)", podeCompartilharTela({ temGetDisplayMedia: true, ponteiroFino: true, userAgent: ANDROID }), false);
igual("iPhone", podeCompartilharTela({ temGetDisplayMedia: true, ponteiroFino: false, userAgent: IPHONE, maxTouchPoints: 5 }), false);
igual("iPad que se passa por Mac (toque)", podeCompartilharTela({ temGetDisplayMedia: true, ponteiroFino: true, userAgent: MAC, maxTouchPoints: 5 }), false);

console.log(`compartilhar-tela: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);

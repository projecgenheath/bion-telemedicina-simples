/**
 * Divisão de exibição do repasse. Rodar: bun src/lib/repasse-exibicao.teste.ts
 */
import { partesDaConsulta } from "./repasse-exibicao";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}

igual(
  "R$ 150 padrão",
  partesDaConsulta(150),
  { brutoCentavos: 15000, bionCentavos: 1500, medicoCentavos: 13500, comissaoPct: 10, parteMedicoPct: 90 },
);
igual("centavos quebrados", partesDaConsulta(10.005).brutoCentavos, 1001);
igual("percentual fora do intervalo", partesDaConsulta(100, 200).comissaoPct, 100);

console.log(`repasse-exibicao: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

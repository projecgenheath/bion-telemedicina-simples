/** Rodar: bun scripts/teste_arrastar_fechar.ts */
import { deveFecharArrasto, ehArrastoParaBaixo, deslocamentoVisivel } from "../src/components/bion/paciente/arrastar-fechar";

let ok = 0, falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else { falhas++; console.log(`FALHA ${nome}: obtido ${String(obtido)} — esperado ${String(esperado)}`); }
}
igual("parado", deveFecharArrasto(0, 0), false);
igual("para cima", deveFecharArrasto(-200, -2), false);
igual("curto e lento volta", deveFecharArrasto(60, 0.1), false);
igual("119 lento volta", deveFecharArrasto(119, 0.2), false);
igual("120 fecha", deveFecharArrasto(120, 0), true);
igual("longo fecha", deveFecharArrasto(300, 0), true);
igual("peteleco fecha", deveFecharArrasto(40, 0.8), true);
igual("toque rápido mínimo não fecha", deveFecharArrasto(10, 2), false);
igual("NaN", deveFecharArrasto(NaN, 1), false);
igual("limite custom", deveFecharArrasto(90, 0, 80), true);
igual("indefinido", ehArrastoParaBaixo(3, 4), null);
igual("vertical baixo", ehArrastoParaBaixo(2, 20), true);
igual("vertical cima", ehArrastoParaBaixo(2, -20), false);
igual("horizontal (chips)", ehArrastoParaBaixo(30, 10), false);
igual("visível baixo", deslocamentoVisivel(50), 50);
igual("visível cima", deslocamentoVisivel(-50), 0);
console.log(`${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);

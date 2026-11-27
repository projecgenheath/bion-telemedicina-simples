/**
 * Regra 3 (decisão do Presidente em 27/11, contrato 3.2): remarcação por
 * falta do médico no modelo de 21/11. Regras puras, sem banco.
 */
import {
  brutoRepasseRemarcacaoPlataforma,
  conferirDiferencaEsperada,
  conferirDiferencaPlataforma,
  diferencaParaListaLivresAgora,
  REMARCACAO_PLATAFORMA_DIFERENCA_CENTAVOS,
} from "./espera-medico-logica";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`FALHOU ${nome}\n  obtido:   ${a}\n  esperado: ${b}`);
  }
}

// livres-agora: modelo plataforma zera a diferença; legado mantém o cálculo.
igual(
  "plataforma: diferença zero mesmo com médico mais caro",
  diferencaParaListaLivresAgora({ plataforma: true, valorMedicoCentavos: 20000, valorOriginalCentavos: 15000 }),
  0,
);
igual(
  "plataforma: diferença zero mesmo com médico mais barato",
  diferencaParaListaLivresAgora({ plataforma: true, valorMedicoCentavos: 12050, valorOriginalCentavos: 15000 }),
  0,
);
igual(
  "legado: médico mais caro → paciente paga",
  diferencaParaListaLivresAgora({ plataforma: false, valorMedicoCentavos: 20000, valorOriginalCentavos: 15000 }),
  5000,
);
igual(
  "legado: médico mais barato → recebe de volta",
  diferencaParaListaLivresAgora({ plataforma: false, valorMedicoCentavos: 12050, valorOriginalCentavos: 15000 }),
  -2950,
);

// POST remarcar: no modelo plataforma só vale diferença 0.
igual("plataforma aceita diferença 0", conferirDiferencaPlataforma(0), true);
igual("plataforma recusa diferença positiva", conferirDiferencaPlataforma(5000), false);
igual("plataforma recusa diferença negativa", conferirDiferencaPlataforma(-2950), false);
igual("legado aceita a diferença calculada", conferirDiferencaEsperada(-2950, -2950).ok, true);

// Repasse: bruto ORIGINAL, não o preço do médico novo (sem segunda taxa).
igual("bruto do repasse é o original", brutoRepasseRemarcacaoPlataforma(15000), 15000);
igual("bruto não segue o preço do médico novo", brutoRepasseRemarcacaoPlataforma(12050) === 15000, false);
igual("valor da remarcação plataforma", REMARCACAO_PLATAFORMA_DIFERENCA_CENTAVOS, 0);

console.log(`regra3: ${ok} ok, ${falhas} falhas`);
if (falhas > 0) process.exit(1);

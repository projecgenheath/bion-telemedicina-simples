/**
 * Testes da formatação da coleta da anamnese para a aba Triagem.
 * Rodar: bun src/components/bion/medico/triagem-valor.teste.ts
 */
import { ehCampoInternoColeta, rotuloCampoColeta, textoValorColeta } from "./triagem-valor";

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

igual("rótulo com underscore", rotuloCampoColeta("pressao_arterial"), "Pressao arterial");
igual("rótulo simples", rotuloCampoColeta("relato"), "Relato");
igual("interno _n", ehCampoInternoColeta("_n"), true);
igual("campo clínico não é interno", ehCampoInternoColeta("peso"), false);

igual("texto simples", textoValorColeta("dor no peito"), "dor no peito");
igual("número", textoValorColeta(80), "80");
igual("booleano sim", textoValorColeta(true), "Sim");
igual("booleano não", textoValorColeta(false), "Não");
igual("nulo", textoValorColeta(null), "");
igual("lista de textos", textoValorColeta(["febre", "tosse"]), "febre, tosse");
igual(
  "objeto (pressão do LLM)",
  textoValorColeta({ sistolica: 120, diastolica: 80 }),
  "Sistolica: 120; Diastolica: 80",
);
igual(
  "lista de objetos (medicamentos do LLM)",
  textoValorColeta([{ nome: "Losartana", dose: "50 mg" }, { nome: "Dipirona" }]),
  "Nome: Losartana; Dose: 50 mg, Nome: Dipirona",
);
igual("objeto ignora internos e vazios", textoValorColeta({ _n: 3, relato: "dor", obs: "" }), "Relato: dor");
igual("objeto vazio", textoValorColeta({}), "");
igual("objeto aninhado", textoValorColeta({ sinais: { fc: 72 } }), "Sinais: Fc: 72");

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

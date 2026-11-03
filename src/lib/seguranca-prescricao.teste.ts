/**
 * Testes da checagem textual de segurança da prescrição (fase 1 da
 * melhoria nº 14 da auditoria médica): conflito com alergia registrada e
 * duplicidade com medicamento em uso — alerta NÃO bloqueante, sem base
 * externa de interações (fase 2). Rodar: bun src/lib/seguranca-prescricao.teste.ts
 */
import {
  alergiasValidas,
  normalizarTextoPrescricao,
  tokensDoMedicamento,
  tokensSeCorrespondem,
  verificarPrescricao,
} from "./seguranca-prescricao";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}

// Normalização: caixa, acento e espaços.
igual("normaliza acento e caixa", normalizarTextoPrescricao("  Ácido   Acetilsalicílico "), "acido acetilsalicilico");
igual("normaliza nulo", normalizarTextoPrescricao(null), "");

// Tokens: fora dose, unidade e forma farmacêutica.
igual("tokens dipirona", tokensDoMedicamento("Dipirona 500 mg"), ["dipirona"]);
igual("tokens losartana", tokensDoMedicamento("Losartana potássica 50 mg"), ["losartana", "potassica"]);
igual("tokens salbutamol spray", tokensDoMedicamento("Salbutamol 100 mcg spray"), ["salbutamol"]);
igual("tokens vazio", tokensDoMedicamento("500 mg"), []);

// Correspondência por raiz: plural/variação casa; prefixo curto não.
igual("raiz plural", tokensSeCorrespondem("penicilina", "penicilinas"), true);
igual("raiz losartana", tokensSeCorrespondem("losartana", "losartan"), true);
igual("exato curto", tokensSeCorrespondem("aas", "aas"), true);
igual("prefixo curto não casa", tokensSeCorrespondem("metformina", "metoclopramida"), false);
igual("diferentes", tokensSeCorrespondem("dipirona", "paracetamol"), false);

// Negações no cadastro de alergia não são alergia.
igual(
  "alergias válidas filtra negações",
  alergiasValidas(["Nenhuma", "Nega alergias", "Não informado", "Dipirona", "  ", "Sem alergia conhecida"]),
  ["Dipirona"],
);

// Conflito direto com a alergia (nome exato, outra caixa/acento).
igual(
  "alergia exata",
  verificarPrescricao("DIPIRONA 500 mg", ["dipirona"], []),
  [{ tipo: "alergia", referencia: "dipirona" }],
);
// Conflito por raiz: alergia "Penicilinas" × medicamento "Penicilina G benzatina".
igual(
  "alergia por raiz",
  verificarPrescricao("Penicilina G benzatina 1.200.000 UI", ["Penicilinas"], []),
  [{ tipo: "alergia", referencia: "Penicilinas" }],
);
// Alergia composta: qualquer token relevante dispara.
igual(
  "alergia token composto",
  verificarPrescricao("Ácido acetilsalicílico 100 mg", ["AAS (ácido acetilsalicílico)"], []),
  [{ tipo: "alergia", referencia: "AAS (ácido acetilsalicílico)" }],
);
// Sem conflito: medicamento diferente das alergias.
igual("sem conflito", verificarPrescricao("Loratadina 10 mg", ["Dipirona", "Penicilina"], []), []);
// Cadastro com negação não gera alerta falso.
igual("negação não alerta", verificarPrescricao("Dipirona 500 mg", ["Nenhuma"], []), []);

// Duplicidade: mesmo fármaco já em uso (apresentação diferente).
igual(
  "duplicidade em uso",
  verificarPrescricao("Losartana 50 mg", [], [{ nome: "Losartana potássica", dose: "50 mg" }]),
  [{ tipo: "duplicidade", referencia: "Losartana potássica" }],
);
// Sem duplicidade: fármacos diferentes.
igual(
  "sem duplicidade",
  verificarPrescricao("Anlodipino 5 mg", [], [{ nome: "Losartana", dose: "50 mg" }]),
  [],
);
// Os dois alertas juntos, na ordem alergia → duplicidade.
igual(
  "alergia e duplicidade",
  verificarPrescricao("Dipirona 500 mg", ["Dipirona"], [{ nome: "Dipirona", dose: "500 mg" }]),
  [
    { tipo: "alergia", referencia: "Dipirona" },
    { tipo: "duplicidade", referencia: "Dipirona" },
  ],
);
// Medicamento ainda vazio/curto demais: nenhum alerta (não assusta à toa).
igual("medicamento vazio", verificarPrescricao("", ["Dipirona"], [{ nome: "Dipirona" }]), []);
igual("medicamento só dose", verificarPrescricao("500 mg", ["Dipirona"], []), []);

console.log(`seguranca-prescricao: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

/**
 * Testes da verificação de nome do laudo (lib/nome-laudo.ts) — M7 da
 * auditoria da área do paciente: subconjunto (até 1 token) NÃO pode bastar;
 * o documento precisa provar o nome completo da conta.
 * Rodar: bun src/lib/nome-laudo.teste.ts
 */
import { readFileSync } from "fs";
import { nomeCorresponde } from "./nome-laudo";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (Object.is(atual, esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}

// Nome completo igual aceita (com a normalização de sempre: acentos/caixa).
igual("completo igual", nomeCorresponde("Maria Clara Silva", "Maria Clara Silva"), true);
igual("caixa alta no documento", nomeCorresponde("MARIA CLARA SILVA", "Maria Clara Silva"), true);
igual("acentos diferentes", nomeCorresponde("José Araújo Lima", "Jose Araujo Lima"), true);
igual("honorífico no documento é ignorado", nomeCorresponde("Dra. Maria Clara Silva", "Maria Clara Silva"), true);
igual("conta de 2 tokens, documento igual", nomeCorresponde("Maria Silva", "Maria Silva"), true);

// 1 token NÃO prova nada (o buraco do M7).
igual("documento com 1 token rejeita", nomeCorresponde("Maria", "Maria Clara Silva"), false);
igual("documento vazio rejeita", nomeCorresponde("", "Maria Clara Silva"), false);
igual("conta vazia rejeita", nomeCorresponde("Maria Clara Silva", ""), false);

// Subconjunto próprio rejeita — mesmo com primeiro E último token da conta.
igual("primeiro+último sem o do meio rejeita", nomeCorresponde("Maria Silva", "Maria Clara Silva"), false);
igual("primeiro+meio sem o último rejeita", nomeCorresponde("Maria Clara", "Maria Clara Silva"), false);
igual("inicial do nome do meio não basta", nomeCorresponde("Maria C Silva", "Maria Clara Silva"), false);

// Documento com o nome MAIS completo que a conta aceita (prova mais, não menos).
igual("documento com sobrenome a mais", nomeCorresponde("Maria Clara Silva Souza", "Maria Clara Silva"), true);
igual("documento com nome do meio a mais", nomeCorresponde("Maria Clara Silva", "Maria Silva"), true);

// Tokens do meio: a ORDEM é livre, a presença é obrigatória.
igual("tokens do meio em ordem trocada", nomeCorresponde("Maria Silva Clara", "Maria Clara Silva"), true);

// Homônimo parcial / outro nome rejeita.
igual("homônimo parcial (último diferente)", nomeCorresponde("Maria Souza", "Maria Silva"), false);
igual("último token diferente", nomeCorresponde("Maria Clara Souza", "Maria Clara Silva"), false);
igual("nome totalmente diferente", nomeCorresponde("João Pedro Santos", "Maria Clara Silva"), false);

// Abreviação por prefixo (regra herdada): "alex" casa "alexandre".
igual("abreviação por prefixo", nomeCorresponde("Alex Silva", "Alexandre Silva"), true);

// Guarda estática: a rota de exame usa ESTA função (nada de cópia local frouxa).
const rota = readFileSync("src/app/api/bion-ia/exame/route.ts", "utf8");
igual("rota importa nomeCorresponde de lib/nome-laudo", rota.includes('from "@/lib/nome-laudo"'), true);
igual("rota não redefine nomeCorresponde localmente", /function nomeCorresponde/.test(rota), false);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

/**
 * Testes da verificação pública de documentos (lib/server/verificacao-documento
 * + lib/verificacao-documento) — item 26 da auditoria de melhorias médicas:
 * o código é id + HMAC truncado; conferir aceita o código legítimo (inclusive
 * na forma impressa, com espaços e caixa alta) e recusa adulteração, segredo
 * errado e formatos inválidos.
 * Rodar: bun src/lib/server/verificacao-documento.teste.ts
 */
import {
  assinarDocumentoId,
  conferirCodigoVerificacao,
  gerarCodigoVerificacao,
} from "./verificacao-documento";
import {
  extrairPartesCodigoVerificacao,
  formatarCodigoVerificacao,
  urlVerificacaoDocumento,
} from "../verificacao-documento";

let ok = 0;
let falhas = 0;
function igual(nome: string, atual: unknown, esperado: unknown) {
  if (Object.is(atual, esperado)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
}
function verdade(nome: string, cond: boolean) {
  igual(nome, cond, true);
}

const SEGREDO = "segredo-de-teste-bem-longo-0123456789";
const OUTRO = "outro-segredo-qualquer-987654321";
const ID = "cm1234567890abcdef12345";

// Geração: formato id-assinatura(20 hex), determinística por segredo.
const codigo = gerarCodigoVerificacao(ID, SEGREDO);
const sig = codigo.split("-")[1];
verdade("formato do código", new RegExp(`^${ID}-[0-9a-f]{20}$`).test(codigo));
igual("assinatura é o HMAC truncado", codigo, `${ID}-${assinarDocumentoId(ID, SEGREDO)}`);
igual("mesmo segredo, mesmo código", gerarCodigoVerificacao(ID, SEGREDO), codigo);
verdade("segredo diferente muda a assinatura", gerarCodigoVerificacao(ID, OUTRO) !== codigo);
verdade("id diferente muda a assinatura", gerarCodigoVerificacao("cm9999999999999999999999", SEGREDO) !== codigo);

// Conferência: o código legítimo passa; qualquer adulteração cai.
igual("código legítimo confere", conferirCodigoVerificacao(codigo, SEGREDO), ID);
igual("segredo errado não confere", conferirCodigoVerificacao(codigo, OUTRO), null);
const adulterado = codigo.slice(0, -1) + (codigo.endsWith("0") ? "1" : "0");
igual("um hex trocado não confere", conferirCodigoVerificacao(adulterado, SEGREDO), null);
// O código é auto-identificado: o código do documento B confere para o B
// (a rota pública então lê o B) — nunca "empresta" validade ao documento A.
igual(
  "código identifica o próprio documento",
  conferirCodigoVerificacao(gerarCodigoVerificacao("cm9999999999999999999999", SEGREDO), SEGREDO),
  "cm9999999999999999999999",
);

// Formas de entrada: impressa (espaços + caixa alta), com espaços nas pontas.
igual("forma impressa confere", conferirCodigoVerificacao(formatarCodigoVerificacao(codigo), SEGREDO), ID);
// A assinatura tolera caixa alta (é como ela é impressa); o id é cuid
// minúsculo e sensível à caixa — a via impressa o mantém como está.
igual("assinatura em caixa alta confere", conferirCodigoVerificacao(`${ID}-${sig.toUpperCase()}`, SEGREDO), ID);
igual("espaços nas pontas conferem", conferirCodigoVerificacao(`  ${codigo}  `, SEGREDO), ID);

// Formatos inválidos: null, sem nunca lançar.
for (const invalido of ["", "abc", `${ID}-`, `-${"a".repeat(20)}`, `${ID}-zzzz`, `${ID}-${"a".repeat(19)}`, `${ID}-${"a".repeat(21)}`, null, undefined]) {
  igual(`inválido ${JSON.stringify(invalido)}`, conferirCodigoVerificacao(invalido as string | null, SEGREDO), null);
  igual(`partes de ${JSON.stringify(invalido)}`, extrairPartesCodigoVerificacao(invalido as string | null), null);
}

// Formatação de impressão: assinatura em grupos de 4, caixa alta; id intacto.
const impresso = formatarCodigoVerificacao(codigo);
igual(
  "impressão agrupa a assinatura",
  impresso,
  `${ID}-${(sig.toUpperCase().match(/.{1,4}/g) ?? []).join(" ")}`,
);
igual("impressão de código inválido devolve a entrada", formatarCodigoVerificacao("lixo"), "lixo");

// URL pública.
igual("url com origem", urlVerificacaoDocumento(codigo, "https://exemplo.com.br/"), `https://exemplo.com.br/verificar/${codigo}`);
igual("url sem origem", urlVerificacaoDocumento(codigo, ""), `/verificar/${codigo}`);

console.log(`verificacao-documento: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

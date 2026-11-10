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
  codigoVerificacaoOuNulo,
  gerarCodigoVerificacao,
  segredoVerificacao,
  VerificacaoIndisponivelError,
  verificacaoDisponivel,
} from "./verificacao-documento";
import { crmNumeroUf } from "../medico-exibicao";
import {
  extrairPartesCodigoVerificacao,
  formatarCodigoVerificacao,
  LIMITE_VERIFICAR_IP_POR_MIN,
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

// Falha fechada sem BION_VERIFICACAO_SEGREDO (não existe mais segredo fixo).
const envOriginal = process.env.BION_VERIFICACAO_SEGREDO;
delete process.env.BION_VERIFICACAO_SEGREDO;
verdade("sem segredo: indisponível", !verificacaoDisponivel());
let lancou: unknown = null;
try { segredoVerificacao(); } catch (e) { lancou = e; }
verdade("sem segredo: segredoVerificacao lança", lancou instanceof VerificacaoIndisponivelError);
lancou = null;
try { conferirCodigoVerificacao(codigo); } catch (e) { lancou = e; }
verdade("sem segredo: conferir (sem segredo injetado) lança, nunca aceita", lancou instanceof VerificacaoIndisponivelError);
igual("sem segredo: wire sai sem código", codigoVerificacaoOuNulo(ID), null);
process.env.BION_VERIFICACAO_SEGREDO = "   ";
verdade("segredo só com espaços conta como ausente", !verificacaoDisponivel());
process.env.BION_VERIFICACAO_SEGREDO = SEGREDO;
igual("com segredo injetado na env: wire gera o código", codigoVerificacaoOuNulo(ID), codigo);
igual("com segredo injetado na env: conferir usa a env", conferirCodigoVerificacao(codigo), ID);
if (envOriginal === undefined) delete process.env.BION_VERIFICACAO_SEGREDO;
else process.env.BION_VERIFICACAO_SEGREDO = envOriginal;

// CRM no formato nº/UF (página pública).
igual("crm 'CRM 12345 SP'", crmNumeroUf("CRM 12345 SP"), "CRM 12345/SP");
igual("crm '12345 sp'", crmNumeroUf("12345 sp"), "CRM 12345/SP");
igual("crm 'CRM-RJ 23456'", crmNumeroUf("CRM-RJ 23456"), "CRM 23456/RJ");
igual("crm '12.345/MG'", crmNumeroUf("12.345/MG"), "CRM 12345/MG");
igual("crm já no formato", crmNumeroUf("CRM 34567/MG"), "CRM 34567/MG");
igual("crm sem UF cai no rótulo", crmNumeroUf("12345"), "CRM 12345");
igual("crm vazio", crmNumeroUf(""), "CRM não informado");

igual("limite por IP da verificação pública", LIMITE_VERIFICAR_IP_POR_MIN, 20);

console.log(`verificacao-documento: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

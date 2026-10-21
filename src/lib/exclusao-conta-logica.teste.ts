/**
 * Testes das regras da exclusão da conta pelo paciente.
 * Rodar: bun src/lib/exclusao-conta-logica.teste.ts
 */
import { confirmacaoExclusaoValida, motivosBloqueioExclusao } from "./exclusao-conta-logica";
import { consentimentoIaExameValido, VERSAO_CONSENTIMENTO_IA_EXAME } from "./consentimento-ia-exame";
import { limparMetadadosImagem } from "./server/limpar-metadados";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`FALHOU ${nome}: obtido ${a}, esperado ${b}`);
  }
}

igual("EXCLUIR aceita", confirmacaoExclusaoValida("EXCLUIR"), true);
igual("com espaços", confirmacaoExclusaoValida("  EXCLUIR "), true);
igual("minúsculo recusa", confirmacaoExclusaoValida("excluir"), false);
igual("vazio recusa", confirmacaoExclusaoValida(""), false);
igual("não string", confirmacaoExclusaoValida(1), false);

igual("sem pendências", motivosBloqueioExclusao({ consultasAtivas: 0, reembolsosAbertos: 0, remarcacoesAbertas: 0 }), []);
igual("consulta ativa bloqueia", motivosBloqueioExclusao({ consultasAtivas: 1, reembolsosAbertos: 0, remarcacoesAbertas: 0 }).length, 1);
igual("três motivos", motivosBloqueioExclusao({ consultasAtivas: 2, reembolsosAbertos: 1, remarcacoesAbertas: 3 }).length, 3);
igual("plural", motivosBloqueioExclusao({ consultasAtivas: 2, reembolsosAbertos: 0, remarcacoesAbertas: 0 })[0].startsWith("2 consultas ativas"), true);

igual("consentimento versão atual", consentimentoIaExameValido(VERSAO_CONSENTIMENTO_IA_EXAME), true);
igual("consentimento ausente", consentimentoIaExameValido(null), false);
igual("consentimento antigo", consentimentoIaExameValido("ia-exame-v0"), false);
igual("consentimento 'true'", consentimentoIaExameValido("true"), false);

// JPEG: SOI, APP0(JFIF), APP1(EXIF), COM, SOS + dados, EOI
const jpeg = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46,
  0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
  0xff, 0xfe, 0x00, 0x03, 0x41,
  0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
]);
const lj = limparMetadadosImagem("image/jpeg", jpeg);
igual("jpeg removidos", lj.removidos, 2);
igual("jpeg resultado", [...lj.bytes], [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
igual("jpeg truncado = original", limparMetadadosImagem("image/jpeg", jpeg.subarray(0, 10)).removidos, 0);

function chunk(tipo: string, dados: number[]) {
  const n = dados.length;
  return [0, 0, 0, n, ...[...tipo].map((c) => c.charCodeAt(0)), ...dados, 1, 2, 3, 4];
}
const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = new Uint8Array([...assinatura, ...chunk("IHDR", [9]), ...chunk("tEXt", [65, 66]), ...chunk("IDAT", [7]), ...chunk("IEND", [])]);
const lp = limparMetadadosImagem("image/png", png);
igual("png removidos", lp.removidos, 1);
igual("png resultado", [...lp.bytes], [...assinatura, ...chunk("IHDR", [9]), ...chunk("IDAT", [7]), ...chunk("IEND", [])]);
igual("pdf intocado", limparMetadadosImagem("application/pdf", jpeg).bytes === jpeg, true);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

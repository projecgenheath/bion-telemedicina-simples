/**
 * A página /termos-medico e o portão de aceite do médico usam o MESMO
 * documento oficial, a mesma constante de versão e o mesmo rótulo.
 * Rodar: bun src/lib/termos-medico-documento.teste.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ARQUIVOS_TERMOS_MEDICO,
  URL_TERMOS_POR_PERFIL,
  VERSAO_TERMOS_MEDICO,
  VERSAO_TERMOS_POR_PERFIL,
  partesVersao,
  rotuloVersao,
} from "./aceite-termos";
import { lerFrontMatter } from "./markdown-simples";

let falhas = 0;
function checa(nome: string, fn: () => void) {
  try {
    fn();
    console.log("ok  ", nome);
  } catch (e) {
    falhas++;
    console.error("FALHA", nome, (e as Error).message);
  }
}
const raiz = process.cwd();
const ler = (p: string) => readFileSync(path.join(raiz, p), "utf8");

checa("partes da versão v2.1", () => assert.deepEqual(partesVersao("termos-medico-v2.1-2026-11-03"), { numero: "2.1", dataIso: "2026-11-03" }));
checa("partes da versão v3 (#163)", () => assert.deepEqual(partesVersao("termos-medico-v3-2026-11-09"), { numero: "3", dataIso: "2026-11-09" }));
checa("rótulo v2.1 (antes saía v0)", () => assert.equal(rotuloVersao("termos-medico-v2.1-2026-11-03"), "v2.1, versão de 03/11/2026"));
checa("rótulo v3", () => assert.equal(rotuloVersao("termos-medico-v3-2026-11-09"), "v3, versão de 09/11/2026"));
checa("rótulo com data explícita", () => assert.equal(rotuloVersao("privacidade-v1-2026-10-27", "2026-10-28"), "v1, versão de 28/10/2026"));
checa("id sem data", () => assert.equal(rotuloVersao("marketing-x"), "v0"));

checa("portão do médico exige a mesma versão da página", () => assert.equal(VERSAO_TERMOS_POR_PERFIL.MEDICO, VERSAO_TERMOS_MEDICO));
checa("portão do médico aponta para /termos-medico", () => assert.equal(URL_TERMOS_POR_PERFIL.MEDICO, "/termos-medico"));

const pagina = ler("src/app/termos-medico/page.tsx");
checa("página usa VERSAO_TERMOS_MEDICO", () => assert.match(pagina, /versao=\{VERSAO_TERMOS_MEDICO\}/));
checa("página usa ARQUIVOS_TERMOS_MEDICO", () => assert.match(pagina, /arquivos=\{ARQUIVOS_TERMOS_MEDICO\}/));
checa("página sem data fixa", () => assert.doesNotMatch(pagina, /data=/));
checa("página sem texto próprio (só o documento oficial)", () => assert.doesNotMatch(pagina, /PIX|Pix|23:30|repasse/i));

const guarda = ler("src/components/bion/GuardaAceiteTermos.tsx");
checa("portão mostra o rótulo da mesma versão", () => assert.match(guarda, /rotuloVersao\(VERSAO_TERMOS_MEDICO\)/));
const comp = ler("src/components/bion/juridico/PaginaDocumentoJuridico.tsx");
checa("página pública usa o mesmo rótulo", () => assert.match(comp, /rotuloVersao\(versao, data\)/));

for (const arq of ARQUIVOS_TERMOS_MEDICO) {
  const doc = lerFrontMatter(ler(path.join("src/conteudo/juridico", arq)));
  const p = partesVersao(VERSAO_TERMOS_MEDICO);
  checa(`${arq}: subtítulo bate com a versão aceita`, () => {
    assert.ok(doc.subtitulo?.includes(`v${p.numero}`), `subtítulo "${doc.subtitulo}" sem v${p.numero}`);
    assert.ok(doc.subtitulo?.includes(p.dataIso!.split("-").reverse().join("/")), `subtítulo "${doc.subtitulo}" sem a data`);
  });
  checa(`${arq}: sem o modelo antigo de repasse por PIX`, () => {
    assert.doesNotMatch(doc.corpo, /chave PIX|repasse di[aá]rio|23:30|23h30/i);
    assert.match(doc.corpo, /conta Stripe/);
  });
}

if (falhas) {
  console.error(`${falhas} falha(s)`);
  process.exit(1);
}
console.log("termos-medico-documento: tudo ok");

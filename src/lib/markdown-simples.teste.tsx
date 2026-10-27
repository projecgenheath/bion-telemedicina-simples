/**
 * Testes do renderizador das minutas: texto preservado (inclusive [A DEFINIR]).
 * Rodar: bun src/lib/markdown-simples.teste.tsx
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { lerFrontMatter, MarkdownSimples } from "./markdown-simples";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else { falhas++; console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(obtido)}\n  esperado: ${JSON.stringify(esperado)}`); }
}
const html = (md: string) => renderToStaticMarkup(<MarkdownSimples md={md} />);
const texto = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, "");

igual("front matter", lerFrontMatter('---\ntitle: "T"\nsubtitle: "S"\n---\nx').titulo, "T");
igual("negrito", html("a **b** c"), "<div class=\"space-y-3 text-sm leading-relaxed text-foreground\"><p>a <strong>b</strong> c</p></div>");
igual("sem HTML cru", html("<script>x</script>").includes("<script>"), false);
igual("tabela", html("| a | b |\n|---|---|\n| 1 | 2 |").includes("<td class=\"border px-2 py-1 align-top\">2</td>"), true);

for (const f of ["01-termos-de-uso-paciente.md", "03-politica-de-privacidade.md", "06-politica-de-cookies.md"]) {
  const doc = lerFrontMatter(readFileSync(`src/conteudo/juridico/${f}`, "utf8"));
  const h = html(doc.corpo);
  const qtdOrig = (doc.corpo.match(/\[A DEFINIR/g) ?? []).length;
  igual(`${f}: [A DEFINIR] preservados`, (h.match(/\[A DEFINIR/g) ?? []).length, qtdOrig);
  // Todo o texto visível do Markdown (sem a marcação) aparece no HTML.
  const esperado = doc.corpo
    .replace(/^#+\s+|^>\s?|^\s*[-*]\s+|^\s*\d+\.\s+|^---\s*$/gm, "")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "")
    .replace(/\*\*|`|\||\\$/gm, "")
    .replace(/\*([^*\s][^*]*?)\*/g, "$1")
    .replace(/\s+/g, "");
  igual(`${f}: texto fiel`, texto(h) === esperado, true);
}

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

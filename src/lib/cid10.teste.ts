/**
 * Testes do catálogo CID-10 local (item 32 da auditoria de melhorias
 * médicas): integridade do subconjunto curado e regras da busca pura.
 * Rodar: bun src/lib/cid10.teste.ts
 */
import { CATALOGO_CID10, buscarCid, cidDoCatalogo, normalizarCodigoCid } from "./cid10";

let ok = 0;
let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const o = JSON.stringify(obtido);
  const e = JSON.stringify(esperado);
  if (o === e) ok++;
  else {
    falhas++;
    console.log(`FALHOU ${nome}: obtido=${o} esperado=${e}`);
  }
}
function checa(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else {
    falhas++;
    console.log(`FALHOU ${nome}${detalhe ? ` (${detalhe})` : ""}`);
  }
}
const codigos = (q: string, limite?: number) => buscarCid(q, limite).map((e) => e.codigo);

// ── Integridade do catálogo curado ────────────────────────────────────
checa("catálogo é um subconjunto enxuto (150–300 códigos)", CATALOGO_CID10.length >= 150 && CATALOGO_CID10.length <= 300, `total=${CATALOGO_CID10.length}`);
checa(
  "nenhum código duplicado",
  new Set(CATALOGO_CID10.map((e) => normalizarCodigoCid(e.codigo))).size === CATALOGO_CID10.length,
);
checa(
  "todo código tem formato CID-10 (letra + 2 dígitos, subcategoria opcional)",
  CATALOGO_CID10.every((e) => /^[A-Z]\d{2}(\.\d)?$/.test(e.codigo)),
  CATALOGO_CID10.filter((e) => !/^[A-Z]\d{2}(\.\d)?$/.test(e.codigo))
    .map((e) => e.codigo)
    .join(","),
);
// Descrições oficiais podem ser curtas ("Tosse" é a descrição de R05);
// o que não pode é descrição vazia ou placeholder.
checa("toda entrada tem descrição", CATALOGO_CID10.every((e) => e.descricao.trim().length >= 4));

// ── Busca por código ──────────────────────────────────────────────────
igual("código com ponto acha a subcategoria", codigos("J06.9"), ["J06.9"]);
igual("prefixo de código lista as subcategorias", codigos("J06"), ["J06.9"]);
igual("código sem ponto e minúsculo", codigos("j301"), ["J30.1"]);
igual("código exato vem primeiro no prefixo", buscarCid("J30")[0]?.codigo, "J30.1");
igual("capítulo inteiro por prefixo de 2 letras+dígito", codigos("E11"), ["E11.9"]);
checa("prefixo F41 lista os transtornos ansiosos", codigos("F41").includes("F41.1") && codigos("F41").includes("F41.9"));
igual("COVID pelo código U07.1", codigos("U07.1"), ["U07.1"]);

// ── Busca por termo na descrição (sem acento, qualquer caixa) ─────────
checa("termo simples: sinusite", codigos("sinusite").includes("J01.9") && codigos("sinusite").includes("J32.9"));
checa("termo com acento: infecção urinária acha N39.0", codigos("infecção urinária").includes("N39.0"));
checa("termo sem acento: infeccao urinaria acha N39.0", codigos("infeccao urinaria").includes("N39.0"));
checa("diabetes lista os principais", ["E10.9", "E11.9", "E14.9"].every((c) => codigos("diabetes").includes(c)));
checa("ansiedade acha F41.1/F41.9", codigos("ansiedade").includes("F41.1") && codigos("ansiedade").includes("F41.9"));
checa("dor lombar acha M54.5", codigos("dor lombar").includes("M54.5"));
checa("hipertensão acha I10", codigos("hipertensão").includes("I10"));
checa("enxaqueca acha G43.9", codigos("enxaqueca").includes("G43.9"));
checa("atestado acha Z02.7 (obtenção de atestado)", codigos("atestado").includes("Z02.7"));

// ── Limites e vazios ──────────────────────────────────────────────────
igual("consulta vazia não sugere nada", buscarCid(""), []);
igual("consulta só com espaços não sugere nada", buscarCid("   "), []);
igual("termo inexistente não sugere nada", buscarCid("xyzqux"), []);
checa("limite padrão de 8 é respeitado", buscarCid("não especificada").length <= 8, `n=${buscarCid("não especificada").length}`);
igual("limite explícito", buscarCid("não especificada", 3).length, 3);

// ── Lookup exato (legenda do campo) ───────────────────────────────────
igual("lookup aceita minúsculo com ponto", cidDoCatalogo("j06.9")?.codigo, "J06.9");
igual("lookup aceita sem ponto", cidDoCatalogo("J069")?.codigo, "J06.9");
igual("lookup de categoria de 3 caracteres", cidDoCatalogo("I10")?.codigo, "I10");
igual("lookup fora do catálogo é null (código pode existir na tabela completa)", cidDoCatalogo("X99.9"), null);
igual("lookup vazio é null", cidDoCatalogo(""), null);
igual("normalização de código", normalizarCodigoCid(" j-30.1 "), "J301");

console.log(`cid10: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);

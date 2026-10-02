/**
 * Teste unitário do validador do PATCH /api/medico/perfil (dados pessoais do
 * médico: data de nascimento, sexo, telefone e CNPJ) e dos helpers
 * isomórficos de src/components/bion/medico/dados-pessoais.ts.
 * CNPJ: numérico e alfanumérico (exemplo oficial da Receita Federal).
 * Uso: bun scripts/teste_validar_perfil_medico.ts
 */
import {
  validarCnpj,
  validarDataNascimentoMedico,
  validarGeneroMedico,
  validarPatchPerfilMedico,
} from "../src/lib/server/validar-perfil-medico";
import {
  cnpjValido,
  formatarCnpj,
  limitesDataNascimentoMedico,
  normalizarCnpj,
} from "../src/components/bion/medico/dados-pessoais";
import { idadeDeNascimento } from "../src/lib/idade";

let passou = 0;
let falhou = 0;
function verificar(nome: string, cond: boolean, detalhe?: unknown) {
  if (cond) passou++;
  else {
    falhou++;
    console.error(`✗ ${nome}`, detalhe ?? "");
  }
}

// "Agora" fixo: 01/10/2026 12:00 em São Paulo (15:00 UTC).
const AGORA = new Date("2026-10-01T15:00:00Z");

/* ---------------- CNPJ (numérico e alfanumérico) ---------------- */
// Numéricos com DV válido (exemplos públicos/sintéticos) — mesmo comportamento de antes.
const VALIDOS = ["11222333000181", "11444777000161", "45723174000110", "04252011000110"];
for (const c of VALIDOS) verificar(`CNPJ numérico válido ${c}`, cnpjValido(c));
verificar("CNPJ numérico DV1 errado", !cnpjValido("11222333000191"));
verificar("CNPJ numérico DV2 errado", !cnpjValido("11222333000182"));
for (let d = 0; d <= 9; d++) verificar(`CNPJ repetido ${d}×14`, !cnpjValido(String(d).repeat(14)));
verificar("CNPJ 13 caracteres", !cnpjValido("1122233300018"));
verificar("CNPJ 15 caracteres", !cnpjValido("112223330001810"));

// Exemplo oficial da Receita Federal (Manual de Cálculo do DV do CNPJ): 12.ABC.345/01DE-35.
verificar("CNPJ alfanumérico oficial 12ABC34501DE35", cnpjValido("12ABC34501DE35"));
// Primeiro CNPJ alfanumérico emitido (Receita Federal, notícia de 31/07/2026): 00.000.000/E08G-12.
verificar("CNPJ alfanumérico real 00.000.000/E08G-12", cnpjValido(normalizarCnpj("00.000.000/E08G-12")));
verificar("alfanumérico oficial: 1º DV errado", !cnpjValido("12ABC34501DE45"));
verificar("alfanumérico oficial: 2º DV errado", !cnpjValido("12ABC34501DE36"));
verificar("alfanumérico: letra trocada muda o DV", !cnpjValido("12ABD34501DE35"));
verificar("alfanumérico: DV com letra → inválido", !cnpjValido("12ABC34501DE3A"));
verificar("alfanumérico minúsculo sem normalizar → inválido", !cnpjValido("12abc34501de35"));
verificar("14 letras iguais → inválido", !cnpjValido("AAAAAAAAAAAAAA"));
verificar("caractere fora de A-Z0-9 → inválido", !cnpjValido("12ABÇ34501DE35"));
verificar("normalizarCnpj", normalizarCnpj(" 12.abc.345/01de-35 ") === "12ABC34501DE35");
// Paridade com o algoritmo numérico tradicional (só dígitos) em amostras aleatórias.
const dvTradicional = (d: string) => {
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const a = calc(12);
  const b = calc(13);
  return d.length === 14 && a === Number(d[12]) && b === Number(d[13]);
};
let paridade = true;
for (let i = 0; i < 2000; i++) {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
  for (const dvs of ["00", "35", "81", String(Math.floor(Math.random() * 100)).padStart(2, "0")]) {
    const c = base + dvs;
    if (/^(.)\1{13}$/.test(c)) continue;
    if (cnpjValido(c) !== dvTradicional(c)) paridade = false;
  }
}
verificar("numérico: paridade com o algoritmo tradicional (8000 amostras)", paridade);

const rMasc = validarCnpj("11.222.333/0001-81");
verificar("validarCnpj numérico com máscara → normalizado", rMasc.ok && rMasc.valor === "11222333000181", rMasc);
const rSem = validarCnpj(" 11222333000181 ");
verificar("validarCnpj numérico sem máscara (trim)", rSem.ok && rSem.valor === "11222333000181", rSem);
const rAlfa = validarCnpj("12.ABC.345/01DE-35");
verificar("validarCnpj alfanumérico oficial com máscara", rAlfa.ok && rAlfa.valor === "12ABC34501DE35", rAlfa);
const rAlfaMin = validarCnpj("12.abc.345/01de-35");
verificar("validarCnpj alfanumérico minúsculo → maiúsculo", rAlfaMin.ok && rAlfaMin.valor === "12ABC34501DE35", rAlfaMin);
const rAlfaSem = validarCnpj("12ABC34501DE35");
verificar("validarCnpj alfanumérico sem máscara", rAlfaSem.ok && rAlfaSem.valor === "12ABC34501DE35", rAlfaSem);
verificar("validarCnpj '' limpa", (() => { const r = validarCnpj(""); return r.ok && r.valor === ""; })());
verificar("validarCnpj null limpa", (() => { const r = validarCnpj(null); return r.ok && r.valor === ""; })());
verificar("validarCnpj número → erro", !validarCnpj(11222333000181).ok);
verificar("validarCnpj DV errado → erro com campo", (() => { const r = validarCnpj("11.222.333/0001-82"); return !r.ok && r.campo === "cnpj"; })());
verificar("validarCnpj alfanumérico DV errado → erro", !validarCnpj("12.ABC.345/01DE-36").ok);
verificar("validarCnpj repetido → erro", !validarCnpj("00.000.000/0000-00").ok);
verificar("validarCnpj letras repetidas → erro", !validarCnpj("AA.AAA.AAA/AAAA-AA").ok);
verificar("validarCnpj DV com letra → erro", !validarCnpj("11.222.333/0001-8a").ok);
verificar("validarCnpj caractere especial → erro", !validarCnpj("12.ABC.345/01DE_35").ok);
verificar("validarCnpj acento → erro", !validarCnpj("12.ÁBC.345/01DE-35").ok);
verificar("validarCnpj gigante → erro", !validarCnpj("1".repeat(100)).ok);

verificar("formatarCnpj numérico", formatarCnpj("11222333000181") === "11.222.333/0001-81");
verificar("formatarCnpj alfanumérico", formatarCnpj("12ABC34501DE35") === "12.ABC.345/01DE-35");
verificar("formatarCnpj normaliza minúsculas", formatarCnpj("12abc34501de35") === "12.ABC.345/01DE-35");
verificar("formatarCnpj idempotente", formatarCnpj("12.ABC.345/01DE-35") === "12.ABC.345/01DE-35");
verificar("formatarCnpj incompleto → ''", formatarCnpj("1122") === "");
verificar("formatarCnpj DV com letra → ''", formatarCnpj("12ABC34501DEAB") === "");
verificar("formatarCnpj vazio/null → ''", formatarCnpj("") === "" && formatarCnpj(null) === "");

/* ---------------- Data de nascimento (18–100) ---------------- */
const dn = (v: unknown) => validarDataNascimentoMedico(v, AGORA);
verificar("nascimento 1980-05-10 ok", (() => { const r = dn("1980-05-10"); return r.ok && r.valor?.toISOString() === "1980-05-10T00:00:00.000Z"; })());
verificar("18 anos hoje (2008-10-01) ok", dn("2008-10-01").ok);
verificar("17 anos (faz 18 amanhã: 2008-10-02) → erro", !dn("2008-10-02").ok);
verificar("100 anos (1926-10-01) ok", dn("1926-10-01").ok);
verificar("100 anos, faz 101 amanhã (1925-10-02) ok", dn("1925-10-02").ok);
verificar("101 anos (1925-10-01) → erro", !dn("1925-10-01").ok);
verificar("futuro → erro", (() => { const r = dn("2027-01-01"); return !r.ok && r.campo === "dataNascimento"; })());
verificar("31/02 → erro", !dn("1990-02-31").ok);
verificar("formato BR → erro", !dn("10/05/1980").ok);
verificar("número → erro", !dn(19800510).ok);
verificar("'' limpa", (() => { const r = dn(""); return r.ok && r.valor === null; })());
verificar("null limpa", (() => { const r = dn(null); return r.ok && r.valor === null; })());
// Fuso: 01/10/2026 01:00 UTC ainda é 30/09 em São Paulo → 2008-10-01 tem 17 anos.
verificar("fuso São Paulo (antes da meia-noite local)", !validarDataNascimentoMedico("2008-10-01", new Date("2026-10-01T01:00:00Z")).ok);

const lim = limitesDataNascimentoMedico(AGORA);
verificar("limite max = 18 anos hoje", lim.max === "2008-10-01", lim);
verificar("limite min = 100 anos (dia seguinte aos 101)", lim.min === "1925-10-02", lim);
verificar("limites coerentes com idadeDeNascimento", idadeDeNascimento(lim.max, AGORA) === 18 && idadeDeNascimento(lim.min, AGORA) === 100);
const lim29 = limitesDataNascimentoMedico(new Date("2028-02-29T15:00:00Z"));
verificar("limites em 29/02 (ano alvo não bissexto)", lim29.max === "2010-02-28" && lim29.min === "1927-03-01", lim29);

/* ---------------- Sexo ---------------- */
for (const g of ["Feminino", "Masculino", "Outro", "Prefiro não informar"]) {
  verificar(`sexo ${g}`, (() => { const r = validarGeneroMedico(g); return r.ok && r.valor === g; })());
}
verificar("sexo minúsculo → erro", !validarGeneroMedico("feminino").ok);
verificar("sexo livre → erro", !validarGeneroMedico("F").ok);
verificar("sexo '' limpa", (() => { const r = validarGeneroMedico(""); return r.ok && r.valor === null; })());
verificar("sexo null limpa", (() => { const r = validarGeneroMedico(null); return r.ok && r.valor === null; })());

/* ---------------- PATCH completo ---------------- */
const p = (c: unknown) => validarPatchPerfilMedico(c, AGORA);
const completo = p({ dataNascimento: "1980-05-10", genero: "Feminino", telefone: "11912345678", cnpj: "11.222.333/0001-81" });
const completoAlfa = p({ cnpj: "12.abc.345/01de-35" });
verificar("PATCH CNPJ alfanumérico → normalizado", completoAlfa.ok && completoAlfa.valor.dados.cnpj === "12ABC34501DE35", completoAlfa);
verificar(
  "PATCH completo",
  completo.ok &&
    completo.valor.dados.telefone === "(11) 91234-5678" &&
    completo.valor.dados.cnpj === "11222333000181" &&
    completo.valor.dados.genero === "Feminino" &&
    completo.valor.dados.dataNascimento instanceof Date &&
    completo.valor.campos.join(",") === "dataNascimento,genero,telefone,cnpj",
  completo,
);
verificar("PATCH só telefone", (() => { const r = p({ telefone: "(21) 3123-4567" }); return r.ok && r.valor.campos.join() === "telefone" && Object.keys(r.valor.dados).join() === "telefone"; })());
verificar("PATCH telefone null limpa", (() => { const r = p({ telefone: null }); return r.ok && r.valor.dados.telefone === ""; })());
verificar("PATCH telefone inválido → campo telefone", (() => { const r = p({ telefone: "123" }); return !r.ok && r.campo === "telefone"; })());
verificar("PATCH chave desconhecida → erro com campo", (() => { const r = p({ telefone: "", crm: "123" }); return !r.ok && r.campo === "crm"; })());
verificar("PATCH valor (campo do diretório) → erro", !p({ valor: 10 }).ok);
verificar("PATCH __proto__ → erro", (() => { const r = p(JSON.parse('{"__proto__": {"x": 1}, "telefone": ""}')); return !r.ok && r.campo === "__proto__"; })());
verificar("PATCH vazio → erro", !p({}).ok);
verificar("PATCH array → erro", !p([]).ok);
verificar("PATCH null → erro", !p(null).ok);
verificar("PATCH string → erro", !p("telefone").ok);
verificar("PATCH CNPJ inválido → campo cnpj", (() => { const r = p({ cnpj: "11111111111111" }); return !r.ok && r.campo === "cnpj"; })());
verificar("PATCH idade < 18 → campo dataNascimento", (() => { const r = p({ dataNascimento: "2015-01-01" }); return !r.ok && r.campo === "dataNascimento"; })());
verificar("PATCH limpa tudo", (() => {
  const r = p({ dataNascimento: null, genero: "", telefone: "", cnpj: "" });
  return r.ok && r.valor.dados.dataNascimento === null && r.valor.dados.genero === null && r.valor.dados.telefone === "" && r.valor.dados.cnpj === "";
})());

console.log(`\n${passou} ok, ${falhou} falha(s)`);
if (falhou) process.exit(1);

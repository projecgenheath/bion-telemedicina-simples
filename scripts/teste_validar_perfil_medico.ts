/**
 * Teste unitário do validador do PATCH /api/medico/perfil (dados pessoais do
 * médico: data de nascimento, sexo, telefone e CNPJ) e dos helpers
 * isomórficos de src/components/bion/medico/dados-pessoais.ts.
 * Uso: bun scripts/teste_validar_perfil_medico.ts
 */
import {
  validarCnpj,
  validarDataNascimentoMedico,
  validarGeneroMedico,
  validarPatchPerfilMedico,
} from "../src/lib/server/validar-perfil-medico";
import {
  cnpjDigitosValidos,
  formatarCnpj,
  limitesDataNascimentoMedico,
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

/* ---------------- CNPJ ---------------- */
// CNPJs com DV válido (exemplos públicos/sintéticos).
const VALIDOS = ["11222333000181", "11444777000161", "45723174000110", "04252011000110"];
for (const c of VALIDOS) verificar(`CNPJ válido ${c}`, cnpjDigitosValidos(c));
verificar("CNPJ DV1 errado", !cnpjDigitosValidos("11222333000191"));
verificar("CNPJ DV2 errado", !cnpjDigitosValidos("11222333000182"));
for (let d = 0; d <= 9; d++) verificar(`CNPJ repetido ${d}×14`, !cnpjDigitosValidos(String(d).repeat(14)));
verificar("CNPJ 13 dígitos", !cnpjDigitosValidos("1122233300018"));
verificar("CNPJ 15 dígitos", !cnpjDigitosValidos("112223330001810"));
verificar("CNPJ com letra", !cnpjDigitosValidos("1122233300018A"));

const rMasc = validarCnpj("11.222.333/0001-81");
verificar("validarCnpj com máscara → só dígitos", rMasc.ok && rMasc.valor === "11222333000181", rMasc);
const rSem = validarCnpj(" 11222333000181 ");
verificar("validarCnpj sem máscara (trim)", rSem.ok && rSem.valor === "11222333000181", rSem);
verificar("validarCnpj '' limpa", (() => { const r = validarCnpj(""); return r.ok && r.valor === ""; })());
verificar("validarCnpj null limpa", (() => { const r = validarCnpj(null); return r.ok && r.valor === ""; })());
verificar("validarCnpj número → erro", !validarCnpj(11222333000181).ok);
verificar("validarCnpj DV errado → erro com campo", (() => { const r = validarCnpj("11.222.333/0001-82"); return !r.ok && r.campo === "cnpj"; })());
verificar("validarCnpj repetido → erro", !validarCnpj("00.000.000/0000-00").ok);
verificar("validarCnpj letras → erro", !validarCnpj("11.222.333/0001-8a").ok);
verificar("validarCnpj gigante → erro", !validarCnpj("1".repeat(100)).ok);

verificar("formatarCnpj", formatarCnpj("11222333000181") === "11.222.333/0001-81");
verificar("formatarCnpj idempotente", formatarCnpj("11.222.333/0001-81") === "11.222.333/0001-81");
verificar("formatarCnpj incompleto → ''", formatarCnpj("1122") === "");
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

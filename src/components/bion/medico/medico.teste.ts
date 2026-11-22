/**
 * Testes da fundação visual do médico (contraste AA dos tokens + cor da zona).
 * Rodar: bun src/components/bion/medico/medico.teste.ts
 */
import { readFileSync } from "node:fs";

let ok = 0;
let falhas = 0;
function verdade(nome: string, v: boolean, detalhe = "") {
  if (v) ok++;
  else {
    falhas++;
    console.error(`x ${nome}${detalhe ? ` (${detalhe})` : ""}`);
  }
}

type RGBA = [number, number, number, number];
function cor(v: string): RGBA {
  const s = v.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(",").map((x) => Number(x.trim()));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`cor nao reconhecida: ${v}`);
}
const sobre = (c: RGBA, fundo: RGBA): RGBA =>
  [0, 1, 2].map((i) => c[i] * c[3] + fundo[i] * (1 - c[3])).concat(1) as RGBA;
const lum = (c: RGBA) => {
  const f = (x: number) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contraste = (a: RGBA, b: RGBA) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function bloco(css: string, seletor: string): Record<string, string> {
  const re = new RegExp(`(^|\\n)${seletor.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  const m = re.exec(css);
  if (!m) throw new Error(`bloco ${seletor} nao encontrado`);
  const out: Record<string, string> = {};
  for (const linha of m[2].split(";")) {
    const kv = /(--bm-[a-z0-9-]+)\s*:\s*([^;/]+)/.exec(linha);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

const css = readFileSync(new URL("./medico.css", import.meta.url), "utf8");
const TEXTOS = [
  "--bm-texto",
  "--bm-texto-2",
  "--bm-texto-3",
  "--bm-ok",
  "--bm-atencao",
  "--bm-critico",
  "--bm-neutro",
];
const CEUS = {
  claro: { vars: bloco(css, ":root"), fundos: ["#2B6E4E", "#1D152D"] },
  escuro: { vars: bloco(css, ".dark"), fundos: ["#2B6E4E", "#1D152D"] },
};
for (const [modo, { vars, fundos }] of Object.entries(CEUS)) {
  for (const f of fundos) {
    const card = sobre(cor(vars["--bm-card"]), cor(f));
    for (const t of TEXTOS) {
      const c = contraste(cor(vars[t]), card);
      verdade(`AA ${modo}: ${t} no card sobre ${f}`, c >= 4.5, c.toFixed(2));
    }
  }
}
// Trilho lateral (vidro sobre o céu): textos de navegacao
for (const [modo, { vars, fundos }] of Object.entries(CEUS)) {
  for (const f of fundos) {
    const trilho = sobre(cor(vars["--bm-trilho"]), cor(f));
    for (const t of ["--bm-texto", "--bm-texto-2", "--bm-texto-3"]) {
      const c = contraste(cor(vars[t]), trilho);
      verdade(`AA ${modo}: ${t} no trilho sobre ${f}`, c >= 4.5, c.toFixed(2));
    }
  }
}

/* Pares fixos da zona medica (texto >= 4,5:1; indicador >= 3:1). */
const paresFixos: [string, string, string, number][] = [
  ["botao primario claro: roxo escuro em #469B72", "#1D152D", "#469B72", 4.5],
  ["botao primario escuro: roxo escuro em #469B72", "#1D152D", "#469B72", 4.5],
  ["indicador da pilula claro: #469B72 na capsula #09090b", "#469B72", "#09090b", 3],
  ["indicador da pilula escuro: #469B72 na capsula #09090b", "#469B72", "#09090b", 3],
  ["topo verde do gradiente: paper em #2B6E4E", "#f7f2f5", "#2B6E4E", 4.5],
  ["meio do gradiente: paper em #2D483A", "#f7f2f5", "#2D483A", 4.5],
  ["fim roxo do gradiente: paper em #1D152D", "#f7f2f5", "#1D152D", 4.5],
  ["faixa clara do ceu: #1D152D em #f3edf5", "#1D152D", "#f3edf5", 4.5],
  ["faixa clara do ceu: #1D152D em #e6dce9", "#1D152D", "#e6dce9", 4.5],
  ["barra clara do hero: #1D152D em #e3d7de", "#1D152D", "#e3d7de", 4.5],
  ["barra escura do hero: branco em #20182d", "#ffffff", "#20182d", 4.5],
  ["bolha do suporte clara: branco em #2B6E4E", "#ffffff", "#2B6E4E", 4.5],
  ["bolha do suporte escura: roxo escuro em #469B72", "#1D152D", "#469B72", 4.5],
];
for (const [nome, a, b, min] of paresFixos) {
  const c = contraste(cor(a), cor(b));
  verdade(`AA ${nome}`, c >= min, c.toFixed(2));
}

/* A zona médica termina no roxo da referência; o verde vivo aparece no gradiente de destaque. */
verdade("gradiente claro percorre verde profundo ate roxo", /\.bm-tela-2\s*\{[^}]*--bm-grad-a[^}]*--bm-grad-b/.test(css));
verdade("gradiente escuro percorre verde profundo ate roxo", /\.dark \.bm-tela-2\s*\{[^}]*--bm-grad-a[^}]*--bm-grad-b/.test(css));
verdade("fundos usam verde profundo #2B6E4E", /--bm-grad-a:\s*#2B6E4E/.test(css));
verdade("fim do gradiente usa o roxo #1D152D", /--bm-grad-b:\s*#1D152D/.test(css));
verdade("tokens definem acento #469B72", /--bm-verde:\s*#469B72/.test(css));
verdade("avatar mostra gradiente #469B72 para roxo", /\.bm-avatar-botao\s*\{[^}]*linear-gradient\(140deg, var\(--bm-verde\) 0%, var\(--bm-grad-b\) 100%\)/.test(css));
verdade("tela 1 nao usa o roxo antigo #24058D", !/\.bm-tela-1\s*\{[^}]*#24058D/.test(css));
verdade("tela 2 nao usa o roxo antigo #24058D", !/\.bm-tela-2\s*\{[^}]*#24058D/.test(css));
verdade("hero nao usa o roxo antigo #24058D", !/\.bm-app \.bm-hero\s*\{[^}]*#24058D/.test(css));

const indSrc = readFileSync(new URL("./IndicadorTelas.tsx", import.meta.url), "utf8");
verdade("indicador de navegacao nao usa o lilas antigo #C4B5FD", !/#C4B5FD/i.test(indSrc));
verdade("indicador de navegacao usa o verde da zona", /#469B72/i.test(indSrc));

const inicioSrc = readFileSync(new URL("./telas/TelaInicio.tsx", import.meta.url), "utf8");
verdade("TelaInicio nao usa o roxo antigo #24058D", !/#24058D/i.test(inicioSrc));
verdade("TelaInicio nao usa o lilas antigo #C4B5FD", !/#C4B5FD/i.test(inicioSrc));

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

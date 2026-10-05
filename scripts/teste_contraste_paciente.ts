/**
 * Verificação de contraste do app do PACIENTE (WCAG 2.x, AA).
 *
 *   bun scripts/teste_contraste_paciente.ts
 *
 * Lê as cores reais de:
 *  - src/components/bion/paciente/paciente.css (tokens --bpp-* do Clean e do Dark);
 *  - node_modules/tailwindcss/theme.css (paleta do Tailwind 4, em oklch);
 * e calcula a razão de contraste dos pares usados nas telas do paciente,
 * compondo transparências (texto com /75, vidro sobre o degradê etc.)
 * sobre o fundo MAIS DESFAVORÁVEL em que o elemento pode aparecer.
 *
 * Mínimos: texto 4,5:1 · títulos grandes, ícones e linhas de gráfico 3:1.
 * Também falha se aparecer nos .tsx do paciente texto < 12 px
 * (text-[9|10|11px]) ou opacidade de texto abaixo do piso usado aqui.
 * Sai com código 1 se algo falhar.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type RGB = [number, number, number];
type RGBA = { c: RGB; a: number };

const raiz = join(import.meta.dir, "..");
const css = readFileSync(join(raiz, "src/components/bion/paciente/paciente.css"), "utf8");
const tema = readFileSync(join(raiz, "node_modules/tailwindcss/theme.css"), "utf8");

/* ----------------------------- cores ---------------------------------- */

function hex(h: string): RGB {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as RGB;
}

function oklch(L: number, C: number, H: number): RGB {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const gama = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return lin.map((v) => Math.min(1, Math.max(0, gama(v)))) as RGB;
}

function parseCor(v: string): RGBA {
  v = v.trim();
  if (v.startsWith("#")) return { c: hex(v), a: 1 };
  const rgba = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (rgba) return { c: [+rgba[1] / 255, +rgba[2] / 255, +rgba[3] / 255], a: rgba[4] ? +rgba[4] : 1 };
  const ok = v.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (ok) return { c: oklch(+ok[1] / 100, +ok[2], +ok[3]), a: 1 };
  throw new Error(`cor não reconhecida: ${v}`);
}

function bloco(seletor: string): Record<string, RGBA> {
  const re = new RegExp(`^${seletor.replace(/\./g, "\\.").replace(/ /g, "\\s+")}\\s*\\{([\\s\\S]*?)^\\}`, "m");
  const m = css.match(re);
  if (!m) throw new Error(`bloco ${seletor} não encontrado no paciente.css`);
  const out: Record<string, RGBA> = {};
  for (const [, nome, valor] of m[1].matchAll(/--(bpp-[\w-]+)\s*:\s*([^;]+);/g)) out[nome] = parseCor(valor);
  return out;
}

const tw = (nome: string): RGB => {
  const m = tema.match(new RegExp(`--color-${nome}:\\s*(oklch\\([^)]*\\))`));
  if (!m) throw new Error(`cor do Tailwind não encontrada: ${nome}`);
  return parseCor(m[1]).c;
};

const mix = (fg: RGB, a: number, bg: RGB): RGB => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) as RGB;
const sobre = (cor: RGBA, bg: RGB): RGB => mix(cor.c, cor.a, bg);
const lum = (c: RGB) => {
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = c.map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razao = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ----------------------------- pares ---------------------------------- */

const BRANCO = hex("#ffffff");
const PRETO = hex("#000000");
const INK = hex("#0a1f44"); // --bion-ink
const PAPER = hex("#f2f6fc"); // --bion-paper
const SEA = hex("#123e7d"); // --bion-sea
const DEEP = hex("#14457f"); // --bion-deep
const TEXTO = 4.5;
const GRAFICO = 3; // títulos grandes, ícones, linhas de gráfico, pontos de navegação

type Par = { modo: string; onde: string; fg: RGB; bg: RGB; min: number };
const pares: Par[] = [];
const par = (modo: string, onde: string, fg: RGB, bg: RGB, min = TEXTO) => pares.push({ modo, onde, fg, bg, min });

for (const modo of ["Clean", "Dark"] as const) {
  const t = modo === "Clean" ? bloco(".bp-app-paciente") : { ...bloco(".bp-app-paciente"), ...bloco(".dark .bp-app-paciente") };
  const c = (n: string) => {
    if (!t[n]) throw new Error(`token --${n} ausente (${modo})`);
    return t[n];
  };
  const cheio = (n: string) => sobre(c(n), PRETO);
  const escuro = modo === "Dark";
  const texto = escuro ? PAPER : INK; // text-bion-ink / dark:text-bion-paper
  const suave = (bg: RGB) => mix(texto, 0.75, bg); // .../75 (também cobre opacity-80)
  const icone = (bg: RGB) => mix(texto, 0.7, bg); // opacity-70 em ícones

  // Fundos soltos onde há texto escuro/claro direto (topo das seções e painéis)
  const fundosTexto: [string, RGB][] = [
    ["seção 1 (topo)", cheio("bpp-s1-topo")],
    ["seção 1 (base)", cheio("bpp-s1-base")],
    ["seção 2 (topo, título)", cheio("bpp-s2-topo")],
    ["seção 2 (45%, subtítulo)", cheio("bpp-s2-meio")],
    ["painel lateral (topo)", cheio("bpp-painel-topo")],
    ["painel lateral (meio)", cheio("bpp-painel-meio")],
    ["painel lateral (base)", cheio("bpp-painel-base")],
  ];
  for (const [onde, bg] of fundosTexto) {
    par(modo, `texto principal · ${onde}`, texto, bg);
    par(modo, `texto secundário /75 · ${onde}`, suave(bg), bg);
  }

  // Cartões de vidro sobre TODOS os fundos por onde podem passar
  const baseCartao: [string, RGB][] = [
    ["seção 1", cheio("bpp-s1-base")],
    ["seção 2 meio", cheio("bpp-s2-meio")],
    ["seção 2 azul", cheio("bpp-s2-azul")],
    ["seção 2 base", cheio("bpp-s2-base")],
    ["painel", cheio("bpp-painel-base")],
    ["painel topo", cheio("bpp-painel-topo")],
  ];
  for (const [onde, fundo] of baseCartao) {
    const g = sobre(c("bpp-vidro"), fundo);
    par(modo, `cartão (vidro sobre ${onde}) · texto`, texto, g);
    par(modo, `cartão (vidro sobre ${onde}) · texto /75`, suave(g), g);
    par(modo, `cartão (vidro sobre ${onde}) · ícone opacity-70`, icone(g), g, GRAFICO);
    // Etiquetas e botões coloridos
    const chip = (nome: string, a: number) => mix(tw(nome), a, g);
    if (escuro) {
      par(modo, `etiqueta verde (${onde})`, tw("emerald-200"), chip("emerald-600", 0.15));
      par(modo, `etiqueta âmbar (${onde})`, tw("amber-200"), chip("amber-500", 0.15));
      par(modo, `etiqueta azul (${onde})`, tw("sky-200"), chip("sky-500", 0.15));
      par(modo, `botão Cancelar (${onde})`, tw("red-300"), chip("red-400", 0.15));
      par(modo, `link Editar / chips sky-300 (${onde})`, tw("sky-300"), g);
      par(modo, `chip neutro white/10 (${onde})`, texto, mix(BRANCO, 0.1, g));
    } else {
      par(modo, `etiqueta verde (${onde})`, tw("emerald-800"), chip("emerald-600", 0.15));
      par(modo, `etiqueta âmbar (${onde})`, tw("amber-800"), chip("amber-500", 0.15));
      par(modo, `etiqueta azul (${onde})`, tw("sky-800"), chip("sky-500", 0.15));
      par(modo, `botão Cancelar (${onde})`, tw("red-800"), chip("red-600", 0.1));
      par(modo, `link Editar / chips bion-sea (${onde})`, SEA, g);
      par(modo, `IMC "Abaixo do peso" sky-800 (${onde})`, tw("sky-800"), g);
      par(modo, `chip neutro bion-ink/8 (${onde})`, texto, mix(INK, 0.08, g));
    }
    par(modo, `gráfico: linha (${onde})`, sobre(c("bpp-grafico-linha"), g), g, GRAFICO);
    par(modo, `gráfico: diastólica (${onde})`, sobre(c("bpp-grafico-alerta"), g), g, GRAFICO);
    par(modo, `gráfico: eixo e rótulos (${onde})`, sobre(c("bpp-grafico-eixo"), g), g, TEXTO);
  }

  // Botão principal e etiqueta "Sala aberta"
  par(modo, "botão principal bp-acao (início do degradê)", BRANCO, SEA);
  par(modo, "botão principal bp-acao (fim do degradê)", BRANCO, INK);
  par(modo, '"Sala aberta" / "Entrar na sala" (emerald-700)', BRANCO, tw("emerald-700"));
  par(modo, "lembrete marcado (emerald-700)", BRANCO, tw("emerald-700"), GRAFICO);

  // Botão Sair e "Tentar de novo" do chat (sobre o painel)
  const painel = cheio("bpp-painel-base");
  par(modo, "botão Sair", escuro ? tw("red-300") : tw("red-700"), painel);
  par(modo, 'chat "Tentar de novo"', escuro ? tw("amber-200") : tw("amber-900"), mix(tw("amber-500"), 0.15, painel));
  par(modo, "chat: status Online", escuro ? tw("emerald-200") : tw("emerald-800"), cheio("bpp-painel-topo"));

  // Placeholder dos campos (bp-entrada: branco 75% no Clean, branco 7% no Dark)
  const entrada = escuro ? mix(BRANCO, 0.07, painel) : mix(BRANCO, 0.75, painel);
  par(modo, "placeholder de campo", sobre(c("bpp-placeholder"), entrada), entrada);

  // Seção 3 (exames): texto branco sobre o azul desde o topo
  const s3: [string, RGB][] = [
    ["topo", cheio("bpp-s3-topo")],
    ["35%", cheio("bpp-s3-meio")],
    ["70%", cheio("bpp-s3-fundo")],
    ["base", cheio("bpp-s3-base")],
  ];
  for (const [onde, bg] of s3) {
    par(modo, `seção 3 (${onde}) · título branco`, BRANCO, bg);
    par(modo, `seção 3 (${onde}) · texto white/80`, mix(BRANCO, 0.8, bg), bg);
    const gm = sobre(c("bpp-vidro-marinho"), bg);
    par(modo, `seção 3 (${onde}) · cartão marinho · texto white/80`, mix(BRANCO, 0.8, gm), gm);
    par(modo, `seção 3 (${onde}) · cartão marinho · fora da referência amber-300`, tw("amber-300"), gm);
    par(modo, `seção 3 (${onde}) · gráfico linha`, sobre(c("bpp-grafico-linha-marinho"), gm), gm, GRAFICO);
    par(modo, `seção 3 (${onde}) · gráfico eixo e rótulos`, sobre(c("bpp-grafico-eixo-marinho"), gm), gm, TEXTO);
  }

  // Cartão da BION IA (degradê deep → sea → ink, texto branco)
  for (const [onde, bg] of [["deep", DEEP], ["sea", SEA], ["ink", INK]] as [string, RGB][]) {
    par(modo, `cartão BION IA (${onde}) · texto white/85`, mix(BRANCO, 0.85, bg), bg);
    par(modo, `cartão BION IA (${onde}) · barra "Pergunte" white/85 sobre white/12`, mix(BRANCO, 0.85, mix(BRANCO, 0.12, bg)), mix(BRANCO, 0.12, bg));
  }
  par(modo, 'cartão BION IA · botão "Agendar" (ink sobre branco)', INK, BRANCO);

  // Pontinhos de navegação: pílula zinc-950/85 sobre o fundo mais claro e o mais escuro
  for (const [onde, fundo] of [["fundo claro", cheio("bpp-s1-topo")], ["fundo escuro", cheio("bpp-s3-base")]] as [string, RGB][]) {
    const pilula = mix(tw("zinc-950"), 0.85, fundo);
    par(modo, `pontinhos (${onde}) · ponto inativo white/70`, mix(BRANCO, 0.7, pilula), pilula, GRAFICO);
    par(modo, `pontinhos (${onde}) · ponto ativo sky-300`, tw("sky-300"), pilula, GRAFICO);
    par(modo, `pontinhos (${onde}) · seta white/70`, mix(BRANCO, 0.7, pilula), pilula, GRAFICO);
  }
}

// Janelas sempre escuras (cancelar/remarcar, reembolso, triagem): zinc-950 e cartões zinc-900
for (const [onde, bg] of [["zinc-950", tw("zinc-950")], ["zinc-900", tw("zinc-900")]] as [string, RGB][]) {
  par("Sempre escuro", `janelas · texto white/60 (${onde})`, mix(BRANCO, 0.6, bg), bg);
  par("Sempre escuro", `janelas · texto white/70 (${onde})`, mix(BRANCO, 0.7, bg), bg);
  par("Sempre escuro", `janelas · placeholder white/60 (${onde})`, mix(BRANCO, 0.6, bg), bg);
  par("Sempre escuro", `janelas · aviso amber-200 (${onde})`, tw("amber-200"), bg);
  par("Sempre escuro", `triagem · ícone white/60 (${onde})`, mix(BRANCO, 0.6, bg), bg, GRAFICO);
  par("Sempre escuro", `triagem · rótulo sky-300 (${onde})`, tw("sky-300"), bg);
}

/* ------------------------- varredura dos .tsx ------------------------- */

const pasta = join(raiz, "src/components/bion/paciente");
const proibidos: [RegExp, string][] = [
  [/text-\[(?:[0-9]|1[01])px\]/g, "texto menor que 12 px"],
  [/(?<![:\w-])text-bion-(?:ink|paper)\/(?:[1-6]\d)\b/g, "texto bion-ink/paper abaixo de /70"],
  [/(?<![:\w-])text-white\/(?:[1-5]\d)\b/g, "texto branco abaixo de /60"],
  [/dark:text-white\/(?:[1-5]\d)\b/g, "texto branco (dark) abaixo de /60"],
  [/(?<![:\w-])opacity-(?:[1-6]0|55|45|35)\b/g, "opacidade de texto abaixo de 70% (use só em disabled:)"],
];
const achados: string[] = [];
for (const arq of readdirSync(pasta).filter((f) => f.endsWith(".tsx"))) {
  const linhas = readFileSync(join(pasta, arq), "utf8").split("\n");
  linhas.forEach((l, i) => {
    for (const [re, motivo] of proibidos) for (const m of l.matchAll(re)) achados.push(`${arq}:${i + 1}  ${m[0]}  (${motivo})`);
  });
}

/* ------------------------------ saída --------------------------------- */

let falhas = 0;
for (const p of pares) {
  const r = razao(p.fg, p.bg);
  const ok = r >= p.min;
  if (!ok) falhas++;
  if (!ok || process.argv.includes("--tudo")) {
    console.log(`${ok ? "ok   " : "FALHA"} ${r.toFixed(2).padStart(5)}:1 (mín ${p.min}) [${p.modo}] ${p.onde}`);
  }
}
const piores = [...pares].map((p) => ({ ...p, r: razao(p.fg, p.bg) })).sort((a, b) => a.r / a.min - b.r / b.min).slice(0, 5);
console.log(`\n${pares.length} pares conferidos, ${falhas} abaixo do mínimo.`);
console.log("Mais justos:");
for (const p of piores) console.log(`  ${p.r.toFixed(2)}:1 (mín ${p.min}) [${p.modo}] ${p.onde}`);
if (achados.length) {
  console.log(`\n${achados.length} classe(s) proibida(s) nos .tsx do paciente:`);
  for (const a of achados) console.log("  " + a);
}
if (falhas || achados.length) process.exit(1);
console.log("\nOK: contraste AA em todos os pares e nenhuma classe proibida.");

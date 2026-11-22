/**
 * VerificaÃ§Ã£o de contraste do app do PACIENTE (WCAG 2.x, AA).
 *
 *   bun scripts/teste_contraste_paciente.ts
 *
 * LÃª as cores reais de:
 *  - src/components/bion/paciente/paciente.css (tokens --bpp-* do Clean e do Dark);
 *  - node_modules/tailwindcss/theme.css (paleta do Tailwind 4, em oklch);
 * e calcula a razÃ£o de contraste dos pares usados nas telas do paciente,
 * compondo transparÃªncias (texto com /75, vidro sobre o degradÃª etc.)
 * sobre o fundo MAIS DESFAVORÃVEL em que o elemento pode aparecer.
 *
 * MÃ­nimos: texto 4,5:1 Â· tÃ­tulos grandes, Ã­cones e linhas de grÃ¡fico 3:1.
 * TambÃ©m falha se aparecer nos .tsx do paciente texto < 12 px
 * (text-[9|10|11px]) ou opacidade de texto abaixo do piso usado aqui.
 * Sai com cÃ³digo 1 se algo falhar.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type RGB = [number, number, number];
type RGBA = { c: RGB; a: number };

const raiz = join(import.meta.dirname ?? (import.meta as { dir?: string }).dir ?? ".", "..");
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
  throw new Error(`cor nÃ£o reconhecida: ${v}`);
}

function bloco(seletor: string): Record<string, RGBA> {
  const re = new RegExp(`^${seletor.replace(/\./g, "\\.").replace(/ /g, "\\s+")}\\s*\\{([\\s\\S]*?)^\\}`, "m");
  const m = css.match(re);
  if (!m) throw new Error(`bloco ${seletor} nÃ£o encontrado no paciente.css`);
  const out: Record<string, RGBA> = {};
  for (const [, nome, valor] of m[1].matchAll(/--(bpp-[\w-]+)\s*:\s*([^;]+);/g)) out[nome] = parseCor(valor);
  return out;
}

const tw = (nome: string): RGB => {
  const m = tema.match(new RegExp(`--color-${nome}:\\s*(oklch\\([^)]*\\))`));
  if (!m) throw new Error(`cor do Tailwind nÃ£o encontrada: ${nome}`);
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
const INK = hex("#1D152D"); // --bion-ink (escopo .bp-app-paciente)
const PAPER = hex("#FBF8F1"); // --bion-paper (escopo .bp-app-paciente)
const SEA = hex("#2E6B47"); // verde escuro para texto sobre superfÃ­cies claras
const DEEP = hex("#543A27"); // inÃ­cio dourado-escuro do cartÃ£o de saÃºde
const FIM = hex("#1D152D");
const CARTAO_MEIO = hex("#1E4030"); // meio verde profundo do cartÃ£o de saÃºde
const LAV = hex("#FFB15C"); // destaque no escuro
const LAV_TEXTO = hex("#B7D9A7"); // texto de etiqueta verde/laranja no escuro
const TEXTO = 4.5;
const GRAFICO = 3; // tÃ­tulos grandes, Ã­cones, linhas de grÃ¡fico, pontos de navegaÃ§Ã£o

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
  const suave = (bg: RGB) => mix(texto, 0.75, bg); // .../75 (tambÃ©m cobre opacity-80)
  const icone = (bg: RGB) => mix(texto, 0.7, bg); // opacity-70 em Ã­cones

  // Fundos soltos onde hÃ¡ texto escuro/claro direto (topo das seÃ§Ãµes e painÃ©is)
  const fundosTexto: [string, RGB][] = [
    ["seÃ§Ã£o 1 (topo)", cheio("bpp-s1-topo")],
    ["seÃ§Ã£o 1 (brilho roxo do canto)", cheio("bpp-s1-brilho")],
    ["seÃ§Ã£o 1 (base)", cheio("bpp-s1-base")],
    ["seÃ§Ã£o 2 (topo, tÃ­tulo)", cheio("bpp-s2-topo")],
    ["seÃ§Ã£o 2 (45%, subtÃ­tulo)", cheio("bpp-s2-meio")],
    ["painel lateral (topo)", cheio("bpp-painel-topo")],
    ["painel lateral (meio)", cheio("bpp-painel-meio")],
    ["painel lateral (base)", cheio("bpp-painel-base")],
  ];
  for (const [onde, bg] of fundosTexto) {
    par(modo, `texto principal Â· ${onde}`, texto, bg);
    par(modo, `texto secundÃ¡rio /75 Â· ${onde}`, suave(bg), bg);
  }

  // CartÃµes de vidro sobre TODOS os fundos por onde podem passar
  const baseCartao: [string, RGB][] = [
    ["seÃ§Ã£o 1", cheio("bpp-s1-base")],
    ["seÃ§Ã£o 1 brilho", cheio("bpp-s1-brilho")],
    ["seÃ§Ã£o 2 meio", cheio("bpp-s2-meio")],
    ["seÃ§Ã£o 2 roxo", cheio("bpp-s2-azul")],
    ["seÃ§Ã£o 2 base", cheio("bpp-s2-base")],
    ["painel", cheio("bpp-painel-base")],
    ["painel topo", cheio("bpp-painel-topo")],
  ];
  for (const [onde, fundo] of baseCartao) {
    const g = sobre(c("bpp-vidro"), fundo);
    par(modo, `cartÃ£o (vidro sobre ${onde}) Â· texto`, texto, g);
    par(modo, `cartÃ£o (vidro sobre ${onde}) Â· texto /75`, suave(g), g);
    par(modo, `cartÃ£o (vidro sobre ${onde}) Â· Ã­cone opacity-70`, icone(g), g, GRAFICO);
    // Etiquetas e botÃµes coloridos
    const chip = (nome: string, a: number) => mix(tw(nome), a, g);
    if (escuro) {
      par(modo, `etiqueta verde (${onde})`, tw("emerald-200"), chip("emerald-600", 0.15));
      par(modo, `etiqueta Ã¢mbar (${onde})`, tw("amber-200"), chip("amber-500", 0.15));
      par(modo, `etiqueta verde/laranja (${onde})`, LAV_TEXTO, mix(LAV, 0.15, g));
      par(modo, `botÃ£o Cancelar (${onde})`, tw("red-300"), chip("red-400", 0.15));
      par(modo, `link Editar / chips laranja (${onde})`, LAV, g);
      par(modo, `chip laranja/10 Â· texto laranja (${onde})`, LAV, mix(LAV, 0.1, g));
      par(modo, `chip neutro white/10 (${onde})`, texto, mix(BRANCO, 0.1, g));
    } else {
      par(modo, `etiqueta verde (${onde})`, tw("emerald-800"), chip("emerald-600", 0.15));
      par(modo, `etiqueta Ã¢mbar (${onde})`, tw("amber-800"), chip("amber-500", 0.15));
      par(modo, `etiqueta verde/laranja (${onde})`, SEA, mix(SEA, 0.12, g));
      par(modo, `botÃ£o Cancelar (${onde})`, tw("red-800"), chip("red-600", 0.1));
      par(modo, `link Editar / chips verde (${onde})`, SEA, g);
      par(modo, `IMC "Abaixo do peso" verde (${onde})`, SEA, g);
      par(modo, `chip verde/10 Â· texto bion-sea (${onde})`, SEA, mix(SEA, 0.1, g));
      par(modo, `chip neutro ink/8 (${onde})`, texto, mix(INK, 0.08, g));
    }
    // AÃ§Ãµes secundÃ¡rias da prÃ³xima consulta (Sala / Remarcar / Cancelar)
    const sec = sobre(c("bpp-sec-fundo"), g);
    par(modo, `aÃ§Ã£o secundÃ¡ria Â· texto (${onde})`, sobre(c("bpp-sec-texto"), sec), sec);
    par(modo, `aÃ§Ã£o secundÃ¡ria Â· borda (${onde})`, sobre(c("bpp-sec-borda"), g), g, 1);
    const canc = sobre(c("bpp-cancelar-fundo"), g);
    par(modo, `aÃ§Ã£o Cancelar Â· texto (${onde})`, sobre(c("bpp-cancelar-texto"), canc), canc);
    par(modo, `aÃ§Ã£o Cancelar Â· Ã­cone (${onde})`, sobre(c("bpp-cancelar-texto"), canc), canc, GRAFICO);
    par(modo, `grÃ¡fico: linha (${onde})`, sobre(c("bpp-grafico-linha"), g), g, GRAFICO);
    par(modo, `grÃ¡fico: diastÃ³lica (${onde})`, sobre(c("bpp-grafico-alerta"), g), g, GRAFICO);
    par(modo, `grÃ¡fico: eixo e rÃ³tulos (${onde})`, sobre(c("bpp-grafico-eixo"), g), g, TEXTO);
  }

  // BotÃ£o principal (.bp-acao no app do paciente): degradÃª da marca
  const acaoIni = cheio("bpp-acao-inicio");
  const acaoFim = cheio("bpp-acao-fim");
  const acaoTexto = sobre(c("bpp-acao-texto"), acaoFim);
  par(modo, "botÃ£o principal bp-acao (inÃ­cio do degradÃª)", sobre(c("bpp-acao-texto"), acaoIni), acaoIni);
  par(modo, "botÃ£o principal bp-acao (fim do degradÃª)", acaoTexto, acaoFim);
  par(modo, '"Sala aberta" / "Entrar na sala" (emerald-700)', BRANCO, tw("emerald-700"));
  par(modo, "lembrete marcado (emerald-700)", BRANCO, tw("emerald-700"), GRAFICO);

  // BotÃ£o Sair e "Tentar de novo" do chat (sobre o painel)
  const painel = cheio("bpp-painel-base");
  par(modo, "botÃ£o Sair", escuro ? tw("red-300") : tw("red-700"), painel);
  par(modo, 'chat "Tentar de novo"', escuro ? tw("amber-200") : tw("amber-900"), mix(tw("amber-500"), 0.15, painel));
  par(modo, "chat: status Online", escuro ? tw("emerald-200") : tw("emerald-800"), cheio("bpp-painel-topo"));

  // Placeholder dos campos (bp-entrada: branco 75% no Clean, branco 7% no Dark)
  const entrada = escuro ? mix(BRANCO, 0.07, painel) : mix(BRANCO, 0.75, painel);
  par(modo, "placeholder de campo", sobre(c("bpp-placeholder"), entrada), entrada);

  // SeÃ§Ã£o 3 (exames): clareada com nuances de degradÃª, texto bion-ink / dark:paper
  const s3: [string, RGB][] = [
    ["topo", cheio("bpp-s3-topo")],
    ["35%", cheio("bpp-s3-meio")],
    ["70%", cheio("bpp-s3-fundo")],
    ["base", cheio("bpp-s3-base")],
  ];
  for (const [onde, bg] of s3) {
    par(modo, `seÃ§Ã£o 3 (${onde}) Â· tÃ­tulo`, texto, bg);
    par(modo, `seÃ§Ã£o 3 (${onde}) Â· texto secundÃ¡rio /75`, suave(bg), bg);
    const g = sobre(c("bpp-vidro"), bg);
    par(modo, `seÃ§Ã£o 3 (${onde}) Â· cartÃ£o vidro Â· texto`, texto, g);
    par(modo, `seÃ§Ã£o 3 (${onde}) Â· cartÃ£o vidro Â· texto /75`, suave(g), g);
    par(modo, `seÃ§Ã£o 3 (${onde}) Â· cartÃ£o vidro Â· fora da referÃªncia`, escuro ? tw("amber-300") : tw("amber-700"), g);
    par(modo, `seÃ§Ã£o 3 (${onde}) Â· grÃ¡fico linha`, sobre(c("bpp-grafico-linha"), g), g, GRAFICO);
    par(modo, `seÃ§Ã£o 3 (${onde}) Â· grÃ¡fico eixo e rÃ³tulos`, sobre(c("bpp-grafico-eixo"), g), g, TEXTO);
  }

  // CartÃ£o da BION IA (degradÃª da marca, texto branco / CTA #24058D no branco)
  const iaStops: [string, RGB][] = [
    ["inÃ­cio", cheio("bpp-ia-fundo-inicio")],
    ["meio", cheio("bpp-ia-fundo-meio")],
    ["fim", cheio("bpp-ia-fundo-fim")],
  ];
  for (const [onde, bg] of iaStops) {
    par(modo, `cartÃ£o BION IA (${onde}) Â· texto white/85`, mix(BRANCO, 0.85, bg), bg);
    par(modo, `cartÃ£o BION IA (${onde}) Â· barra "Pergunte" white/85 sobre white/12`, mix(BRANCO, 0.85, mix(BRANCO, 0.12, bg)), mix(BRANCO, 0.12, bg));
  }
  par(modo, 'cartÃ£o BION IA Â· botÃ£o "Agendar" (marca sobre branco)', sobre(c("bpp-ia-cta-texto"), BRANCO), BRANCO);
  // Reflexo que passa uma vez (white/16) por cima do texto do cartÃ£o
  for (const [onde, bg] of iaStops.slice(0, 2)) {
    const reflexo = mix(BRANCO, 0.16, bg);
    par(modo, `cartÃ£o BION IA (${onde}) Â· texto white/85 sob o reflexo`, mix(BRANCO, 0.85, reflexo), reflexo);
  }

  // Pontinhos de navegaÃ§Ã£o: pÃ­lula zinc-950/85 sobre o fundo mais claro e o mais escuro
  for (const [onde, fundo] of [["fundo claro", cheio("bpp-s1-topo")], ["fundo escuro", cheio("bpp-s3-base")]] as [string, RGB][]) {
    const pilula = mix(tw("zinc-950"), 0.85, fundo);
    par(modo, `pontinhos (${onde}) Â· ponto inativo white/70`, mix(BRANCO, 0.7, pilula), pilula, GRAFICO);
    par(modo, `pontinhos (${onde}) Â· ponto ativo laranja`, LAV, pilula, GRAFICO);
    par(modo, `pontinhos (${onde}) Â· seta white/70`, mix(BRANCO, 0.7, pilula), pilula, GRAFICO);
  }
}

// Fase 3 â€” janelas (cancelar/remarcar, reembolso, triagem, ediÃ§Ã£o do perfil)
// seguem o tema: tokens --bpp-sheet-* no Clean e no Dark.
for (const modo of ["Clean", "Dark"] as const) {
  const t = modo === "Clean" ? bloco(".bp-app-paciente") : { ...bloco(".bp-app-paciente"), ...bloco(".dark .bp-app-paciente") };
  const c = (n: string) => {
    if (!t[n]) throw new Error(`token --${n} ausente (${modo})`);
    return t[n];
  };
  const escuro = modo === "Dark";
  const fundo = sobre(c("bpp-sheet-fundo"), BRANCO);
  const superficies: [string, RGB][] = [
    ["fundo", fundo],
    ["cartÃ£o", sobre(c("bpp-sheet-cartao"), fundo)],
    ["campo", sobre(c("bpp-sheet-campo"), fundo)],
    ["chip", sobre(c("bpp-sheet-chip"), fundo)],
    ["selecionado", sobre(c("bpp-sheet-sel-fundo"), sobre(c("bpp-sheet-cartao"), fundo))],
  ];
  for (const [onde, bg] of superficies) {
    par(modo, `janelas Â· texto (${onde})`, sobre(c("bpp-sheet-texto"), bg), bg);
    par(modo, `janelas Â· texto suave / placeholder (${onde})`, sobre(c("bpp-sheet-suave"), bg), bg);
    par(modo, `janelas Â· aviso Ã¢mbar (${onde})`, escuro ? tw("amber-200") : tw("amber-800"), bg);
    par(modo, `janelas Â· rÃ³tulo da triagem (${onde})`, escuro ? LAV : SEA, bg);
    par(modo, `janelas Â· aviso verde/laranja (${onde})`, escuro ? LAV_TEXTO : SEA, escuro ? mix(LAV, 0.1, bg) : mix(SEA, 0.08, bg));
    par(modo, `janelas Â· erro vermelho (${onde})`, escuro ? tw("red-200") : tw("red-800"), mix(tw("red-500"), 0.1, bg));
    par(modo, `janelas Â· ok verde (${onde})`, escuro ? tw("emerald-100") : tw("emerald-900"), mix(tw("emerald-500"), 0.1, bg));
  }
  par(modo, "janelas Â· botÃ£o principal", sobre(c("bpp-sheet-primario-texto"), sobre(c("bpp-sheet-primario"), fundo)), sobre(c("bpp-sheet-primario"), fundo));
  par(modo, "janelas Â· horÃ¡rio escolhido", sobre(c("bpp-sheet-sel-cheio-texto"), sobre(c("bpp-sheet-sel-cheio"), fundo)), sobre(c("bpp-sheet-sel-cheio"), fundo));
  par(modo, "janelas Â· borda do selecionado", sobre(c("bpp-sheet-sel-borda"), fundo), fundo, GRAFICO);
  par(modo, "janelas Â· Confirmar reembolso (zinc-950 sobre emerald-500)", tw("zinc-950"), tw("emerald-500"));
  par(modo, "janelas Â· Cancelar (branco sobre red-600)", BRANCO, tw("red-600"));
  par(modo, "contador de nÃ£o lidas (branco sobre rose-600)", BRANCO, tw("rose-600"));

  // InÃ­cio: selo da contagem regressiva (sobre o vidro do cartÃ£o, no pior fundo)
  for (const [onde, base] of [["seÃ§Ã£o 1", sobre(c("bpp-s1-base"), PRETO)], ["painel", sobre(c("bpp-painel-base"), PRETO)]] as [string, RGB][]) {
    const g = sobre(c("bpp-vidro"), base);
    const selo = sobre(c("bpp-contagem-fundo"), g);
    par(modo, `contagem regressiva Â· texto (${onde})`, sobre(c("bpp-contagem-texto"), selo), selo);
    par(modo, `contagem regressiva urgente (branco sobre emerald-700)`, BRANCO, tw("emerald-700"));
    par(modo, `aviso de mensagem Â· ponto (${onde})`, sobre(c("bpp-aviso-ponto"), g), g, GRAFICO);
  }
}

// CartÃ£o de saÃºde do Perfil: degradÃª quente â†’ verde â†’ roxo (#543A27 â†’ #1E4030 â†’ #1D152D)
for (const [onde, bg] of [["inÃ­cio", DEEP], ["meio", CARTAO_MEIO], ["fim", FIM]] as [string, RGB][]) {
  const caixa = mix(BRANCO, 0.1, bg);
  par("Ambos", `cartÃ£o de saÃºde (${onde}) Â· texto white/80`, mix(BRANCO, 0.8, bg), bg);
  par("Ambos", `cartÃ£o de saÃºde (${onde}) Â· caixinha white/10 Â· rÃ³tulo white/80`, mix(BRANCO, 0.8, caixa), caixa);
  const alerta = mix(tw("amber-300"), 0.2, bg);
  par("Ambos", `cartÃ£o de saÃºde (${onde}) Â· chip de alergia amber-100`, tw("amber-100"), alerta);
  par("Ambos", `cartÃ£o de saÃºde (${onde}) Â· chip neutro branco sobre white/15`, BRANCO, mix(BRANCO, 0.15, bg));
  // Reflexo laranja do canto (rgba(255, 177, 92, .25)) por cima do degradÃª
  const reflexo = mix(LAV, 0.25, bg);
  par("Ambos", `cartÃ£o de saÃºde (${onde}) Â· texto white/80 sob o reflexo`, mix(BRANCO, 0.8, reflexo), reflexo);
}


// Paleta roxa: foco visÃ­vel e barra de progresso da triagem
for (const modo of ["Clean", "Dark"] as const) {
  const t = modo === "Clean" ? bloco(".bp-app-paciente") : { ...bloco(".bp-app-paciente"), ...bloco(".dark .bp-app-paciente") };
  const realce = sobre(t["bpp-realce"], PRETO);
  for (const [onde, n] of [["seÃ§Ã£o 1", "bpp-s1-base"], ["painel", "bpp-painel-base"], ["janela", "bpp-sheet-fundo"]] as [string, string][]) {
    par(modo, `anel de foco --bpp-realce (${onde})`, realce, sobre(t[n], PRETO), GRAFICO);
  }
}

/* ------------------------- varredura dos .tsx ------------------------- */

const pasta = join(raiz, "src/components/bion/paciente");
const proibidos: [RegExp, string][] = [
  [/text-\[(?:[0-9]|1[01])px\]/g, "texto menor que 12 px"],
  [/(?<![:\w-])text-bion-(?:ink|paper)\/(?:[1-6]\d)\b/g, "texto bion-ink/paper abaixo de /70"],
  [/(?<![:\w-])text-white\/(?:[1-5]\d)\b/g, "texto branco abaixo de /60"],
  [/dark:text-white\/(?:[1-5]\d)\b/g, "texto branco (dark) abaixo de /60"],
  [/(?<![:\w-])opacity-(?:[1-6]0|55|45|35)\b/g, "opacidade de texto abaixo de 70% (use sÃ³ em disabled:)"],
];
const achados: string[] = [];
for (const arq of readdirSync(pasta).filter((f) => f.endsWith(".tsx"))) {
  const linhas = readFileSync(join(pasta, arq), "utf8").split("\n");
  linhas.forEach((l, i) => {
    for (const [re, motivo] of proibidos) for (const m of l.matchAll(re)) achados.push(`${arq}:${i + 1}  ${m[0]}  (${motivo})`);
  });
}

/* ------------------------------ saÃ­da --------------------------------- */

let falhas = 0;
const avatar = css.match(/\.bp-app-paciente \.bpp-avatar-botao\s*\{([^}]+)\}/)?.[1] ?? "";
const avatarDark = css.match(/\.dark \.bp-app-paciente \.bpp-avatar-botao\s*\{([^}]+)\}/)?.[1];
const avatarGradiente = /linear-gradient\(140deg,\s*#FFB15C\s+0%,\s*#469B72\s+100%\)/i.test(avatar);
if (!avatarGradiente || avatarDark) {
  falhas++;
  console.log("FALHA: o cÃ­rculo do avatar deve mostrar o degradÃª #FFB15C â†’ #469B72 nos dois temas.");
} else {
  console.log("OK: o cÃ­rculo do avatar mantÃ©m #FFB15C â†’ #469B72 nos dois temas.");
}
for (const p of pares) {
  const r = razao(p.fg, p.bg);
  const ok = r >= p.min;
  if (!ok) falhas++;
  if (!ok || process.argv.includes("--tudo")) {
    console.log(`${ok ? "ok   " : "FALHA"} ${r.toFixed(2).padStart(5)}:1 (mÃ­n ${p.min}) [${p.modo}] ${p.onde}`);
  }
}
const piores = [...pares].map((p) => ({ ...p, r: razao(p.fg, p.bg) })).sort((a, b) => a.r / a.min - b.r / b.min).slice(0, 5);
console.log(`\n${pares.length} pares conferidos, ${falhas} abaixo do mÃ­nimo.`);
console.log("Mais justos:");
for (const p of piores) console.log(`  ${p.r.toFixed(2)}:1 (mÃ­n ${p.min}) [${p.modo}] ${p.onde}`);
if (achados.length) {
  console.log(`\n${achados.length} classe(s) proibida(s) nos .tsx do paciente:`);
  for (const a of achados) console.log("  " + a);
}
if (falhas || achados.length) process.exit(1);
console.log("\nOK: contraste AA em todos os pares e nenhuma classe proibida.");


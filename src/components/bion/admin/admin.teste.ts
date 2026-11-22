/**
 * Testes da fundação do admin (funções puras + contraste dos tokens).
 * Rodar: bun src/components/bion/admin/admin.teste.ts
 * (também com TZ=UTC e TZ=Asia/Tokyo: o resultado não pode depender do fuso.)
 */
import { readFileSync } from "node:fs";
import {
  brl,
  chaveDia,
  competenciaCurta,
  diasDeDiferenca,
  hora,
  limitesDia,
  relativo,
  rotuloDia,
  saudacao,
} from "./tempo";
import {
  avisosRecebimento,
  estadoChamado,
  estadoConsulta,
  estadoMedico,
  estadoReembolso,
  estadoRepasse,
  estadoSeveridade,
  humanizar,
  maisUrgente,
} from "./rotulos";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}
function verdade(nome: string, v: boolean, detalhe = "") {
  igual(`${nome}${detalhe ? ` (${detalhe})` : ""}`, v, true);
}

const sp = (s: string) => Date.parse(`${s}-03:00`); // horário de parede em São Paulo (sem horário de verão)

/* ---------------- tempo ---------------- */
const agora = sp("2026-10-04T23:30:00"); // domingo 23:30 em SP = segunda 02:30 UTC
igual("chaveDia usa o fuso da clínica (não o UTC)", chaveDia(agora), "2026-10-04");
igual("chaveDia 00:10 SP", chaveDia(sp("2026-10-05T00:10:00")), "2026-10-05");
igual("rotuloDia hoje", rotuloDia(sp("2026-10-04T08:00:00"), agora), "Hoje");
igual("rotuloDia amanhã logo após meia-noite", rotuloDia(sp("2026-10-05T00:10:00"), agora), "Amanhã");
igual("rotuloDia ontem", rotuloDia(sp("2026-10-03T12:00:00"), agora), "Ontem");
igual("rotuloDia semana", rotuloDia(sp("2026-10-06T09:00:00"), agora), "ter, 06/10");
igual("rotuloDia outro ano", rotuloDia(sp("2027-01-04T09:00:00"), agora), "seg, 04/01/2027");
igual("rotuloDia inválido", rotuloDia(NaN, agora), "—");
igual("diasDeDiferenca", diasDeDiferenca(sp("2026-10-11T01:00:00"), agora), 7);
igual("hora SP", hora(sp("2026-10-04T09:05:00")), "09:05");
const lim = limitesDia(agora);
igual("limitesDia início", lim.inicio, sp("2026-10-04T00:00:00"));
igual("limitesDia fim", lim.fim, sp("2026-10-05T00:00:00"));
igual("relativo agora", relativo(agora + 20_000, agora), "agora");
igual("relativo passado min", relativo(agora - 5 * 60_000, agora), "há 5 min");
igual("relativo futuro h", relativo(agora + 2 * 3_600_000, agora), "em 2 h");
igual("relativo 1 dia", relativo(agora - 26 * 3_600_000, agora), "há 1 dia");
igual("relativo dias", relativo(agora - 3 * 86_400_000, agora), "há 3 dias");
igual("competência curta", competenciaCurta("2026-10-03", agora), "03/10");
igual("competência outro ano", competenciaCurta("2025-12-31", agora), "31/12/2025");
igual("competência inválida", competenciaCurta("ontem", agora), "ontem");
igual("saudação noite", saudacao(agora), "Boa noite");
igual("saudação manhã", saudacao(sp("2026-10-04T08:00:00")), "Bom dia");
igual("saudação tarde", saudacao(sp("2026-10-04T13:00:00")), "Boa tarde");
igual("brl centavos", brl(123456).replace(/\s/g, " "), "R$ 1.234,56");
igual("brl zero", brl(0).replace(/\s/g, " "), "R$ 0,00");
igual("brl inválido", brl(NaN), "—");

/* ---------------- rótulos ---------------- */
igual("consulta pendente_anamnese não aparece crua", estadoConsulta("pendente_anamnese"), { rotulo: "Triagem pendente", tom: "sinal" });
igual("consulta em_espera", estadoConsulta("em_espera").rotulo, "Aguardando pagamento");
igual("consulta cancelada é crítica", estadoConsulta("cancelada").tom, "critico");
igual("consulta aguardando_reagendamento", estadoConsulta("aguardando_reagendamento").rotulo, "Aguardando reagendamento");
igual("consulta desconhecida vira texto legível", estadoConsulta("nova_situacao_x"), { rotulo: "Nova situacao x", tom: "neutro" });
igual("médico pendente", estadoMedico("pendente").rotulo, "Em validação");
igual("chamado em_andamento", estadoChamado("em_andamento").rotulo, "Em atendimento");
igual("repasse fechado = a pagar", estadoRepasse("fechado"), { rotulo: "A pagar", tom: "dinheiro" });
igual("repasse pago", estadoRepasse("pago").tom, "ok");
igual("reembolso processado", estadoReembolso("processado").rotulo, "Devolvido");
igual("severidade critical", estadoSeveridade("critical").rotulo, "Crítico");
igual("humanizar vazio", humanizar(""), "—");
igual("sem PIX", avisosRecebimento(null), [{ rotulo: "Sem chave PIX", tom: "critico" }]);
igual(
  "PIX com os dois avisos (CNPJ primeiro)",
  avisosRecebimento({ chaveTrocadaRecente: true, cnpjDivergente: true }).map((e) => e.rotulo),
  ["CNPJ divergente", "Chave trocada < 24 h"],
);
igual("PIX sem avisos", avisosRecebimento({ chaveTrocadaRecente: false, cnpjDivergente: false }), []);
igual("mais urgente", maisUrgente(["ok", "atencao", "dinheiro"]), "atencao");
igual("mais urgente vazio", maisUrgente([]), "neutro");

/* ---------------- contraste AA dos tokens (admin.css) ---------------- */
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
  throw new Error(`cor não reconhecida: ${v}`);
}
const sobre = (c: RGBA, fundo: RGBA): RGBA => [0, 1, 2].map((i) => c[i] * c[3] + fundo[i] * (1 - c[3])).concat(1) as RGBA;
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
  if (!m) throw new Error(`bloco ${seletor} não encontrado`);
  const out: Record<string, string> = {};
  for (const linha of m[2].split(";")) {
    const kv = /(--ba-[a-z0-9-]+)\s*:\s*([^;/]+)/.exec(linha);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}
const css = readFileSync(new URL("./admin.css", import.meta.url), "utf8");
const TEXTOS = ["--ba-texto", "--ba-texto-2", "--ba-texto-3", "--ba-sinal", "--ba-ok", "--ba-atencao", "--ba-critico", "--ba-dinheiro", "--ba-neutro"];
// Pior caso do céu sob o card: as duas pontas do degradê de cada modo.
const CEUS = {
  claro: { vars: bloco(css, ":root"), fundos: ["#ffffff", "#f7f5fc"] },
  escuro: { vars: bloco(css, ".dark"), fundos: ["#000000", "#070414"] },
};
for (const [modo, { vars, fundos }] of Object.entries(CEUS)) {
  for (const f of fundos) {
    const card = sobre(cor(vars["--ba-card"]), cor(f));
    for (const t of TEXTOS) {
      const c = contraste(cor(vars[t]), card);
      verdade(`AA ${modo}: ${t} no card sobre ${f}`, c >= 4.5, c.toFixed(2));
      // Chip: tom a 12% sobre o card
      if (t !== "--ba-texto" && t !== "--ba-texto-2" && t !== "--ba-texto-3") {
        const tom = cor(vars[t]);
        const chip = sobre([tom[0], tom[1], tom[2], 0.12], card);
        const cc = contraste(tom, chip);
        verdade(`AA ${modo}: chip ${t} sobre ${f}`, cc >= 4.5, cc.toFixed(2));
      }
    }
  }
}
// Trilho lateral (vidro sobre o céu): textos de navegação
for (const [modo, { vars, fundos }] of Object.entries(CEUS)) {
  for (const f of fundos) {
    const trilho = sobre(cor(vars["--ba-trilho"]), cor(f));
    for (const t of ["--ba-texto", "--ba-texto-2", "--ba-texto-3"]) {
      const c = contraste(cor(vars[t]), trilho);
      verdade(`AA ${modo}: ${t} no trilho sobre ${f}`, c >= 4.5, c.toFixed(2));
    }
  }
}
// Fundos sólidos do card deslizável: texto branco
for (const f of ["#047857", "#b91c1c", "#92400e", "#24058D", "#334155"]) {
  const c = contraste(cor("#ffffff"), cor(f));
  verdade(`AA texto branco no fundo do gesto ${f}`, c >= 4.5, c.toFixed(2));
}


/* Pílulas discretas: cápsula sem min 2,75 rem; alvo de 44 px no ::before. */
verdade("pílula alvo sem min-width 2.75rem", !/\.ba-pilula-alvo\s*\{[^}]*min-width:\s*2\.75rem/.test(css));
verdade("pílula alvo sem min-height 2.75rem", !/\.ba-pilula-alvo\s*\{[^}]*min-height:\s*2\.75rem/.test(css));
verdade("pílula alvo ::before tem 44px de largura", /\.ba-pilula-alvo::before\s*\{[^}]*width:\s*44px/.test(css));
verdade("pílula alvo ::before tem 44px de altura", /\.ba-pilula-alvo::before\s*\{[^}]*height:\s*44px/.test(css));
verdade("indicador da pílula não usa #24058D", !/\.ba-pilula-indicador\s*\{[^}]*#24058D/i.test(css));
verdade("indicador da pílula usa #96A5FF", /\.ba-pilula-indicador\s*\{[^}]*#96A5FF/i.test(css));

/* Pares fixos da paleta roxa (texto ≥ 4,5:1; indicador na cápsula ≥ 3:1). */
const paresFixos: [string, string, string, number][] = [
  ["botão primário claro: branco em #24058D", "#ffffff", "#24058D", 4.5],
  ["botão primário claro: branco no fim #160347", "#ffffff", "#160347", 4.5],
  ["botão primário escuro: #24058D em #96A5FF", "#24058D", "#96A5FF", 4.5],
  ["aba/filtro claro: branco em #24058D", "#ffffff", "#24058D", 4.5],
  ["aba/filtro escuro: #24058D em #96A5FF", "#24058D", "#96A5FF", 4.5],
  ["indicador da pílula: #96A5FF na cápsula #09090b", "#96A5FF", "#09090b", 3],
  ["bolha do suporte clara: branco em #24058D", "#ffffff", "#24058D", 4.5],
  ["bolha do suporte escura: #24058D em #96A5FF", "#24058D", "#96A5FF", 4.5],
  /* Hero do Centro de Comando (fase 5): degradê fixo da marca nos dois modos.
     Branco total e branco 90% (blend sobre o stop mais claro #3D1AAE). */
  ["hero: branco no topo #3D1AAE", "#ffffff", "#3D1AAE", 4.5],
  ["hero: branco no meio #24058D", "#ffffff", "#24058D", 4.5],
  ["hero: branco no fim #1C0470", "#ffffff", "#1C0470", 4.5],
  ["hero: branco 90% sobre #3D1AAE", "#ECE9F7", "#3D1AAE", 4.5],
  ["hero barra clara: #1a1040 sobre o blend #F5F4FB", "#1a1040", "#F5F4FB", 4.5],
  ["hero barra escura: #ffffff em #1a1430", "#ffffff", "#1a1430", 4.5],
];
for (const [nome, a, b, min] of paresFixos) {
  const c = contraste(cor(a), cor(b));
  verdade(`AA ${nome}`, c >= min, c.toFixed(2));
}

/* Casca do tablet e trilho: cortes distintos da densidade dos módulos.
   Lê o fonte (não importa o módulo "use client", para o teste rodar também
   com --conditions=react-server). */
const prefSrc = readFileSync(new URL("./ui/preferencias.ts", import.meta.url), "utf8");
const num = (nome) => Number((prefSrc.match(new RegExp(`export const ${nome} = (\\d+)`)) || [])[1]);
igual("casca larga a partir de 768", num("LARGURA_CASCA"), 768);
igual("módulos e tabelas continuam em 1024", num("LARGURA_DESKTOP"), 1024);
igual("trilho abre por padrão a partir de 1280", num("LARGURA_TRILHO_ABERTO"), 1280);

const shellSrc = readFileSync(new URL("./AdminShell.tsx", import.meta.url), "utf8");
verdade("casca usa useCascaLarga", /const largo = useCascaLarga\(\)/.test(shellSrc));
{
  const imp = shellSrc.match(/import \{([^}]+)\} from "\.\/ui\/preferencias"/);
  verdade("casca não importa useLargo", !!imp && !/\buseLargo\b/.test(imp[1]));
}
verdade(
  "trilho segue o corte 1280 quando não há preferência",
  /usePreferenciaBool\("bion-admin-trilho", padraoAberto\)/.test(shellSrc)
  && /useMinLargura\(LARGURA_TRILHO_ABERTO\)/.test(shellSrc),
);
verdade("trilho não abre por padrão fixo (true)", !/usePreferenciaBool\("bion-admin-trilho", true\)/.test(shellSrc));

verdade("useLargo ainda mede LARGURA_DESKTOP", /export function useLargo\(\)[\s\S]*LARGURA_DESKTOP/.test(prefSrc));
verdade("useCascaLarga mede LARGURA_CASCA", /export function useCascaLarga\(\)[\s\S]*LARGURA_CASCA/.test(prefSrc));

verdade("grade de cartões auto-fit em 13.75rem (220px)", /\.ba-grade-cartoes\s*\{[^}]*minmax\(min\(100%, 13\.75rem\)/.test(css));

const centroSrc = readFileSync(new URL("./comando/CentroComando.tsx", import.meta.url), "utf8");
verdade("Decisões e Repasses ocupam 1 col no tablet", (centroSrc.match(/col-span-2 md:col-span-1/g) || []).length >= 2);
verdade("agenda e gráfico lado a lado no tablet", /md:grid-cols-3/.test(centroSrc) && /md:col-span-2/.test(centroSrc));


const tabelaSrc = readFileSync(new URL("./ui/TabelaAdmin.tsx", import.meta.url), "utf8");
verdade("coluna secundária some abaixo de 1440", /\.ba-col-secundaria\s*\{[^}]*display:\s*none/.test(css));
verdade("coluna secundária aparece em 1440", /@media \(min-width: 1440px\)/.test(css) && /\.ba-col-secundaria\s*\{[^}]*display:\s*table-cell/.test(css));
verdade("TabelaAdmin não usa o xl (1280) para secundária", !/hidden xl:table-cell/.test(tabelaSrc) && /ba-col-secundaria/.test(tabelaSrc));

const agendaSrc = readFileSync(new URL("./agendamentos/AgendamentosModulo.tsx", import.meta.url), "utf8");
verdade("filtros do celular abrem numa folha", /<SheetAdmin[\s\S]*Filtros da agenda/.test(agendaSrc) && /ListFilter/.test(agendaSrc));
verdade("alvos de toque dos filtros têm 44px", /ba-aba !min-h-11/.test(agendaSrc) && /ba-botao ba-botao-secundario !min-h-11/.test(agendaSrc));
verdade("Status e Pago na mesma coluna da agenda", /id: "status"/.test(agendaSrc) && !/id: "pago"/.test(agendaSrc));
verdade("KPIs da agenda em 2 colunas no celular", /grid grid-cols-2 lg:grid-cols-5/.test(agendaSrc));


const relSrc = readFileSync(new URL("./relatorios/RelatoriosModulo.tsx", import.meta.url), "utf8");
verdade("Relatórios sem texto interno 'como na tela antiga'", !/como na tela antiga/.test(relSrc));
verdade("Relatórios explica o total da plataforma", /total da plataforma/.test(relSrc));

const estadoSrc = readFileSync(new URL("./ui/Estados.tsx", import.meta.url), "utf8");
verdade("EstadoVazio tem altura mínima", /min-h-\[min\(22rem,calc\(100dvh-22rem\)\)\]/.test(estadoSrc));
verdade("céu claro não termina em #24058D", !/\.ba-ceu\s*\{[^}]*#24058D/.test(css));
verdade("céu claro termina em lilás #f7f5fc", /\.ba-ceu\s*\{[^}]*#f7f5fc 100%/.test(css));

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

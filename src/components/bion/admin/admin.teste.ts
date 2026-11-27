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
// Fundos do redesign azul (#EFF3F4 claro / #0E1013 escuro) e superfície dos cards (#FFFFFF / #181B20).
const CEUS = {
  claro: { vars: bloco(css, ":root"), fundos: ["#eff3f4", "#ffffff"] },
  escuro: { vars: bloco(css, ".dark"), fundos: ["#0e1013", "#181b20"] },
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
// Barra lateral (sobre o fundo do app): textos de navegação
for (const [modo, { vars, fundos }] of Object.entries(CEUS)) {
  for (const f of fundos) {
    const trilho = sobre(cor(vars["--ba-trilho"]), cor(f));
    for (const t of ["--ba-texto", "--ba-texto-2", "--ba-texto-3"]) {
      const c = contraste(cor(vars[t]), trilho);
      verdade(`AA ${modo}: ${t} na lateral sobre ${f}`, c >= 4.5, c.toFixed(2));
    }
  }
}
// Fundos sólidos do card deslizável: texto branco
for (const f of ["#1e7a34", "#c42b2b", "#9a3f0a", "#2f62c4", "#525a66"]) {
  const c = contraste(cor("#ffffff"), cor(f));
  verdade(`AA texto branco no fundo do gesto ${f}`, c >= 4.5, c.toFixed(2));
}

/* Redesign azul (alinhado a Médico e Paciente): sem roxo antigo #24058D / #96A5FF. */
verdade("admin.css sem roxo #24058D", !/#24058D/i.test(css));
verdade("admin.css sem lilás antigo #96A5FF", !/#96A5FF/i.test(css));
verdade("admin.css define fundo #eff3f4", /--ba-fundo:\s*#eff3f4/i.test(css));
verdade("admin.css define fundo escuro #0e1013", /--ba-fundo:\s*#0e1013/i.test(css));
verdade("admin.css define azul #76a1f3", /--ba-azul:\s*#76a1f3/i.test(css));
verdade("admin.css inclui barra lateral .ba2-lateral e inferior .ba2-barra", /\.ba2-lateral\b/.test(css) && /\.ba2-barra\b/.test(css));

/* Pares fixos da paleta azul (texto ≥ 4,5:1). */
const paresFixos: [string, string, string, number][] = [
  ["botão primário / aba ativa: #242424 em #76a1f3", "#242424", "#76a1f3", 4.5],
  ["filtro ativo claro: #2f62c4 em #dee8f4", "#2f62c4", "#dee8f4", 4.5],
  ["filtro ativo escuro: #9dbcf7 em #23324a", "#9dbcf7", "#23324a", 4.5],
  ["cartão lavanda: #242424 em #e4dff5", "#242424", "#e4dff5", 4.5],
  ["cartão azul suave: #242424 em #d0e1f5", "#242424", "#d0e1f5", 4.5],
  ["cartão pêssego: #242424 em #fadbca", "#242424", "#fadbca", 4.5],
  ["cartão colorido subtítulo: #636363 em #d0e1f5", "#636363", "#d0e1f5", 4.5],
  ["cartão colorido subtítulo: #636363 em #e4dff5", "#636363", "#e4dff5", 4.5],
  ["seta do recorte claro: branco em #242424", "#ffffff", "#242424", 4.5],
  ["seta do recorte escuro: #111111 em #f2f4f7", "#111111", "#f2f4f7", 4.5],
  ["contador vermelho: branco em #c42b2b", "#ffffff", "#c42b2b", 4.5],
];
for (const [nome, a, b, min] of paresFixos) {
  const c = contraste(cor(a), cor(b));
  verdade(`AA ${nome}`, c >= min, c.toFixed(2));
}

const prefSrc = readFileSync(new URL("./ui/preferencias.ts", import.meta.url), "utf8");
const num = (nome) => Number((prefSrc.match(new RegExp(`export const ${nome} = (\\d+)`)) || [])[1]);
igual("casca larga a partir de 768", num("LARGURA_CASCA"), 768);
igual("módulos e tabelas continuam em 1024", num("LARGURA_DESKTOP"), 1024);
verdade("useLargo ainda mede LARGURA_DESKTOP", /export function useLargo\(\)[\s\S]*LARGURA_DESKTOP/.test(prefSrc));
verdade("useCascaLarga mede LARGURA_CASCA", /export function useCascaLarga\(\)[\s\S]*LARGURA_CASCA/.test(prefSrc));

const shellSrc = readFileSync(new URL("./AdminShell.tsx", import.meta.url), "utf8");
verdade("casca usa barra lateral fixa e barra inferior", /BarraLateralAdmin/.test(shellSrc) && /BarraInferiorAdmin/.test(shellSrc));
verdade("casca aplica poppinsAdmin", /poppinsAdmin\.variable/.test(shellSrc));

verdade("grade de cartões auto-fit em 13.75rem (220px)", /\.ba-grade-cartoes\s*\{[^}]*minmax\(min\(100%, 13\.75rem\)/.test(css));

const centroSrc = readFileSync(new URL("./comando/CentroComando.tsx", import.meta.url), "utf8");
verdade("CentroComando usa grade assimétrica e cartões com recorte", /ba2-grade/.test(centroSrc) && /ba2-recorte/.test(centroSrc));
verdade("CentroComando sem roxo #24058D", !/#24058D/i.test(centroSrc));

const tabelaSrc = readFileSync(new URL("./ui/TabelaAdmin.tsx", import.meta.url), "utf8");
verdade("coluna secundária some abaixo de 1440", /\.ba-col-secundaria\s*\{[^}]*display:\s*none/.test(css));
verdade("coluna secundária aparece em 1440", /@media \(min-width: 1440px\)/.test(css) && /\.ba-col-secundaria\s*\{[^}]*display:\s*table-cell/.test(css));
verdade("TabelaAdmin não usa o xl (1280) para secundária", !/hidden xl:table-cell/.test(tabelaSrc) && /ba-col-secundaria/.test(tabelaSrc));

const agendaSrc = readFileSync(new URL("./agendamentos/AgendamentosModulo.tsx", import.meta.url), "utf8");
verdade("filtros do celular abrem numa folha", /<SheetAdmin[\s\S]*Filtros da agenda/.test(agendaSrc) && /ListFilter/.test(agendaSrc));
verdade("alvos de toque dos filtros têm 44px", /ba-aba !min-h-11/.test(agendaSrc) && /ba-botao ba-botao-secundario !min-h-11/.test(agendaSrc));
verdade("Status e Pago na mesma coluna da agenda", /id: "status"/.test(agendaSrc) && !/id: "pago"/.test(agendaSrc));
verdade("KPIs da agenda em 2 colunas no celular", /grid grid-cols-2 lg:grid-cols-5/.test(agendaSrc));
verdade("busca da agenda mostra a frase inteira", /CampoBusca/.test(agendaSrc) && /Buscar paciente, médico ou especialidade/.test(agendaSrc));
verdade("dica da busca quebra em palavras inteiras", /\.ba-campo-busca-dica\s*\{[^}]*white-space:\s*normal/.test(css));
verdade("filtros da auditoria não rolam cortando o chip", !/lg:flex-nowrap lg:overflow-x-auto/.test(readFileSync(new URL("./auditoria/AuditoriaModulo.tsx", import.meta.url), "utf8")));

const relSrc = readFileSync(new URL("./relatorios/RelatoriosModulo.tsx", import.meta.url), "utf8");
verdade("Relatórios sem texto interno 'como na tela antiga'", !/como na tela antiga/.test(relSrc));
verdade("Relatórios explica o total da plataforma", /total da plataforma/.test(relSrc));

const estadoSrc = readFileSync(new URL("./ui/Estados.tsx", import.meta.url), "utf8");
verdade("vazio do módulo é cartão com a entrada do Início", /className="ba-vazio ba-animar"/.test(estadoSrc));
verdade("faixa alta do vazio fica só na Fila", /if \(faixa\)[\s\S]*min-h-\[min\(22rem,calc\(100dvh-22rem\)\)\]/.test(estadoSrc));
verdade("módulos usam a família do Início", /\.ba-modulo \.ba-card[\s\S]*--ba-lavanda/.test(css) && /\.ba-modulo \.ba-card[\s\S]*--ba-azul-suave/.test(css) && /\.ba-modulo \.ba-card[\s\S]*--ba-pessego/.test(css));
verdade("entrada dos módulos sobe 14px em 0,42s", /ba-subir-suave 0\.42s cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(css));
verdade("menos movimento desliga a entrada dos módulos", /prefers-reduced-motion: reduce[\s\S]*\.ba-modulo \.ba-card/.test(css));
const telaSrc = readFileSync(new URL("./ui/TelaModulo.tsx", import.meta.url), "utf8");
verdade("TelaModulo usa a entrada do Início", /ba-modulo[\s\S]*ba-animar/.test(telaSrc));
verdade("Centro de Comando não recebe a classe dos módulos", !/ba-modulo/.test(centroSrc));

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

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
  claro: { vars: bloco(css, ":root"), fundos: ["#ffffff", "#1d4a8a"] },
  escuro: { vars: bloco(css, ".dark"), fundos: ["#000000", "#0e2d63"] },
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
for (const f of ["#047857", "#b91c1c", "#92400e", "#123e7d", "#334155"]) {
  const c = contraste(cor("#ffffff"), cor(f));
  verdade(`AA texto branco no fundo do gesto ${f}`, c >= 4.5, c.toFixed(2));
}

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

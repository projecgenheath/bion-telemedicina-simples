/**
 * Testes das regras puras do Monitor LLM (Torre BION).
 * Rodar: bun --conditions react-server src/components/bion/admin/llm/llm.teste.ts
 * (também com TZ=UTC e TZ=Asia/Tokyo: o resultado não pode depender do fuso da máquina)
 */
import {
  detalheEvento,
  estadoSaude,
  falhasRecentes,
  falhasSeguidas,
  modeloAtual,
  pontosPolilinha,
  porHora,
  segundos,
  serieLatencia,
  tendencia,
  type EventoLlm,
  type ResumoLlm,
} from "./saude";

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
const sp = (s: string) => Date.parse(`${s}-03:00`);
const agora = sp("2026-10-06T10:20:00");
const MIN = 60_000;

const ev = (ts: number, okk: boolean, ms: number, extra: Partial<EventoLlm> = {}): EventoLlm => ({
  ts,
  ok: okk,
  ms,
  fonte: "gemma",
  modelo: "gemma-3-12b",
  textoLen: okk ? 420 : 0,
  http: okk ? 200 : 503,
  finish: null,
  erro: okk ? null : "timeout",
  ...extra,
});
const resumo = (p: Partial<ResumoLlm>): ResumoLlm => ({ turnos: 20, ok: 20, falhas: 0, taxaOk: 100, msMedia: 1500, msP50: 1200, msP95: 3000, modelos: ["gemma-3-12b"], ...p });

/* ---------------- saúde ---------------- */
igual("sem dados", estadoSaude(null).rotulo, "Sem dados");
igual("sem turnos", estadoSaude(resumo({ turnos: 0 })).tom, "neutro");
igual("saudável", estadoSaude(resumo({})), { tom: "ok", rotulo: "Saudável", texto: "100% de sucesso e p95 de 3,0 s." });
igual("instável (90%)", estadoSaude(resumo({ taxaOk: 90, falhas: 2 })), { tom: "atencao", rotulo: "Instável", texto: "2 falhas em 20 turnos." });
igual("lento (p95 > 12 s)", estadoSaude(resumo({ msP95: 15_000 })).rotulo, "Lento");
igual("crítico (< 80%)", estadoSaude(resumo({ taxaOk: 70, falhas: 6 })), { tom: "critico", rotulo: "Crítico", texto: "Só 70% dos turnos tiveram resposta." });
const tresFalhas = [ev(agora - MIN, false, 30_000), ev(agora - 2 * MIN, false, 30_000), ev(agora - 3 * MIN, false, 30_000), ev(agora - 4 * MIN, true, 900)];
igual("falhas seguidas no topo", falhasSeguidas(tresFalhas), 3);
igual("crítico por 3 falhas seguidas mesmo com taxa boa", estadoSaude(resumo({ taxaOk: 96 }), tresFalhas).texto, "As 3 últimas respostas falharam.");
igual("falhas seguidas ignora ordem de chegada", falhasSeguidas([...tresFalhas].reverse()), 3);

/* ---------------- formatos ---------------- */
igual("ms", segundos(850), "850 ms");
igual("segundos", segundos(12_345), "12,3 s");
igual("segundos redondos", segundos(3000), "3,0 s");
igual("inválido", segundos(NaN), "—");
igual("detalhe OK igual ao antigo", detalheEvento(ev(agora, true, 900)), "420 caracteres");
igual("detalhe falha: erro", detalheEvento(ev(agora, false, 900)), "timeout");
igual("detalhe falha: finish", detalheEvento(ev(agora, false, 900, { erro: null, finish: "SAFETY" })), "SAFETY");
igual("detalhe falha: http", detalheEvento(ev(agora, false, 900, { erro: null, http: null })), "HTTP —");

/* ---------------- tendência ---------------- */
igual("menos de 6 turnos: sem tendência", tendencia(tresFalhas), null);
const piorando = [
  ...[1, 2, 3, 4].map((i) => ev(agora - i * MIN, i % 2 === 0, 4000)), // recentes: 50% ok
  ...[5, 6, 7, 8].map((i) => ev(agora - i * MIN, true, 1000)), // anteriores: 100% ok
];
const t = tendencia(piorando);
igual("tendência piorando", [t?.recente.taxaOk, t?.anterior.taxaOk, t?.deltaTaxa, t?.direcao], [50, 100, -50, "pior"]);
const melhorLatencia = [...[1, 2, 3].map((i) => ev(agora - i * MIN, true, 1000)), ...[4, 5, 6].map((i) => ev(agora - i * MIN, true, 6000))];
igual("tendência melhorando pela latência", tendencia(melhorLatencia)?.direcao, "melhor");
igual("tendência estável", tendencia([1, 2, 3, 4, 5, 6].map((i) => ev(agora - i * MIN, true, 1000)))?.direcao, "estavel");

/* ---------------- por hora (fuso SP) ---------------- */
const eventos = [
  ev(sp("2026-10-06T10:05:00"), true, 1000),
  ev(sp("2026-10-06T10:15:00"), false, 3000),
  ev(sp("2026-10-06T09:59:59"), true, 2000),
  ev(sp("2026-10-05T11:00:00"), true, 500), // primeira hora da janela de 24 h
  ev(sp("2026-10-05T10:59:00"), true, 500), // fora (25 h atrás)
  ev(sp("2026-10-06T11:00:00"), true, 500), // futuro: fora
];
const h = porHora(eventos, agora, 24);
igual("24 baldes", h.length, 24);
igual("primeiro e último balde em hora de SP", [h[0].rotulo, h[23].rotulo], ["11h", "10h"]);
igual("balde atual", [h[23].turnos, h[23].falhas, h[23].msMedio], [2, 1, 2000]);
igual("balde anterior", [h[22].rotulo, h[22].turnos], ["09h", 1]);
igual("borda inicial entra, 25 h fica fora", [h[0].turnos, h.reduce((s, b) => s + b.turnos, 0)], [1, 4]);
igual("chave do balde usa o dia de SP", h[12].chave, "2026-10-05-23");

/* ---------------- séries e falhas ---------------- */
igual("série de latência do mais antigo ao mais recente", serieLatencia(eventos.slice(0, 3), 2).map((s) => s.ms), [1000, 3000]);
igual("polilinha", pontosPolilinha([0, 50, 100], 200, 50), "0,50 100,25 200,0");
igual("polilinha vazia", pontosPolilinha([], 10, 10), "");
igual("falhas recentes", falhasRecentes(eventos).map((e) => e.ms), [3000]);
igual("modelo atual = do turno mais recente", modeloAtual([ev(agora - MIN, true, 1, { modelo: "novo" }), ev(agora - 2 * MIN, true, 1, { modelo: "velho" })]), "novo");
igual("modelo atual cai na fonte", modeloAtual([ev(agora, true, 1, { modelo: null, fonte: "gemini" })]), "gemini");
igual("sem eventos, sem modelo", modeloAtual([]), null);

console.log(`llm: ${ok} ok, ${falhas} falha(s) [TZ=${process.env.TZ ?? "padrão"}]`);
if (falhas) process.exit(1);

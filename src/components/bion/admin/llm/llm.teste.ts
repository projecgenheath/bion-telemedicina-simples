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
import {
  FiltroPensamento,
  motivoFalhaIa,
  nvidiaLiberado,
  paraMensagensOpenAI,
  semPensamento,
  streamNvidia,
  chatNvidia,
} from "@/lib/server/llm-nvidia";
import { linhasNdjson } from "@/lib/bion-ia-cliente";

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

/* ---------------- motor NVIDIA (puro + fetch simulado) ---------------- */
igual("detalhe com requestId e reserva", detalheEvento(ev(agora, true, 900, { requestId: "ia_x_y", fallback: true })), "420 caracteres (reserva) · ia_x_y");
igual("detalhe falha do navegador", detalheEvento(ev(agora, false, 900, { erro: "cliente:nao_json", origem: "cliente" })), "navegador: cliente:nao_json");

igual(
  "instruções viram system e turnos vizinhos se fundem",
  paraMensagensOpenAI([
    { role: "assistant", content: "SYS" },
    { role: "assistant", content: "oi, sou a BION" },
    { role: "user", content: "a" },
    { role: "user", content: "b" },
  ]),
  [
    { role: "system", content: "SYS" },
    { role: "user", content: "(contexto da conversa abaixo)" },
    { role: "assistant", content: "oi, sou a BION" },
    { role: "user", content: "a\n\nb" },
  ],
);
igual("think inline removido", semPensamento("<think>raciocínio</think>Olá!"), "Olá!");
{
  const f = new FiltroPensamento();
  const partes = ["Oi <th", "ink>segredo</thi", "nk> tudo", " bem?"].map((p) => f.empurrar(p)).join("") + f.fechar();
  igual("think partido entre chunks", partes, "Oi  tudo bem?");
}
igual("motivo: sem registros", motivoFalhaIa([]), "A BION IA não está configurada no momento.");
igual("motivo: timeout", motivoFalhaIa([{ status: null, erro: "timeout" }]), "O modelo demorou demais para responder.");
igual("motivo: 429", motivoFalhaIa([{ status: 429, erro: "x" }]), "A cota da IA esgotou neste minuto.");

{
  const env = { ...process.env };
  process.env.VERCEL_ENV = "production";
  delete process.env.BION_LLM_NVIDIA_ATIVO;
  igual("produção sem flag: NVIDIA bloqueado", nvidiaLiberado(), false);
  process.env.BION_LLM_NVIDIA_ATIVO = "true";
  igual("produção com flag: liberado", nvidiaLiberado(), true);
  delete process.env.BION_LLM_NVIDIA_ATIVO;
  process.env.VERCEL_ENV = "preview";
  igual("preview: liberado", nvidiaLiberado(), true);
  process.env.VERCEL_ENV = env.VERCEL_ENV;
  if (env.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  if (env.BION_LLM_NVIDIA_ATIVO !== undefined) process.env.BION_LLM_NVIDIA_ATIVO = env.BION_LLM_NVIDIA_ATIVO;
}

{
  const fetchOriginal = globalThis.fetch;
  const chaveOriginal = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "chave-de-teste";
  let corpoEnviado: { stream?: boolean; chat_template_kwargs?: { enable_thinking?: boolean } } = {};
  const sse = [
    'data: {"choices":[{"delta":{"reasoning_content":"pensando em segredo"}}]}',
    'data: {"choices":[{"delta":{"content":"Boa "}}]}',
    'data: {"choices":[{"delta":{"content":"noite!"}}]}',
    "data: [DONE]",
    "",
  ].join("\n");
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    corpoEnviado = JSON.parse(String(init?.body));
    if (corpoEnviado.stream) return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    return Response.json({ choices: [{ message: { content: "Olá!", reasoning_content: "segredo" } }] });
  }) as typeof fetch;
  const pedacos: string[] = [];
  for await (const p of streamNvidia([{ role: "user", content: "Boa noite" }], { timeoutMs: 5_000 })) pedacos.push(p);
  igual("stream: só conteúdo, sem reasoning_content", pedacos.join(""), "Boa noite!");
  igual("stream: enable_thinking=false", corpoEnviado.chat_template_kwargs?.enable_thinking, false);
  const r = await chatNvidia([{ role: "user", content: "oi" }], { timeoutMs: 5_000 });
  igual("não-stream: só content", r, "Olá!");
  globalThis.fetch = (async () => new Response("<html>504</html>", { status: 504 })) as typeof fetch;
  const regs: { status: number | null; erro: string | null }[] = [];
  const nada: string[] = [];
  for await (const p of streamNvidia([{ role: "user", content: "x" }], { timeoutMs: 5_000, registros: regs as never })) nada.push(p);
  igual("stream 504: nada emitido e status registrado", [nada.length, regs[0]?.status], [0, 504]);
  igual("erro não vaza a chave", JSON.stringify(regs).includes("chave-de-teste"), false);
  globalThis.fetch = fetchOriginal;
  if (chaveOriginal === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = chaveOriginal;
}

{
  const corpo = new Response('{"tipo":"inicio","requestId":"ia_a_b"}\n{"tipo":"delta","texto":"Oi"}\n{"tipo":"fim"}').body!;
  const evs: Record<string, unknown>[] = [];
  for await (const e of linhasNdjson(corpo)) evs.push(e);
  igual("ndjson: 3 eventos", evs.map((e) => e.tipo), ["inicio", "delta", "fim"]);
  let erro = "";
  try {
    for await (const _ of linhasNdjson(new Response("<html>504 Gateway Timeout</html>").body!)) void _;
  } catch (e) {
    erro = (e as { tipo?: string }).tipo ?? "";
  }
  igual("ndjson: HTML vira nao_json", erro, "nao_json");
}

console.log(`llm: ${ok} ok, ${falhas} falha(s) [TZ=${process.env.TZ ?? "padrão"}]`);
if (falhas) process.exit(1);

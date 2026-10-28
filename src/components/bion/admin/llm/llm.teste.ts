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
  LIMITE_RETENCAO,
  encurtarErro,
  MAX_ERRO,
  motivoFalhaIa,
  nvidiaLiberado,
  paraMensagensOpenAI,
  semPensamento,
  streamNvidia,
  chatNvidia,
  nvidiaBaseUrl,
  nvidiaConfig,
  reservaGeminiAtiva,
  modeloReservaGemini,
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
  igual("preview sem flag: bloqueado", nvidiaLiberado(), false);
  process.env.BION_LLM_NVIDIA_ATIVO = "true";
  igual("preview com flag: liberado", nvidiaLiberado(), true);
  delete process.env.BION_LLM_NVIDIA_ATIVO;
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

{
  // configuração do provedor e da reserva por env
  const salvo = { ...process.env };
  const restaurar = () => {
    for (const k of ["BION_LLM_NVIDIA_BASE_URL", "BION_LLM_RESERVA_GEMINI", "BION_LLM_RESERVA_GEMINI_MODEL", "VERCEL_ENV"]) {
      if (salvo[k] === undefined) delete process.env[k];
      else process.env[k] = salvo[k];
    }
  };
  delete process.env.BION_LLM_NVIDIA_BASE_URL;
  igual("base: padrão NVIDIA", nvidiaBaseUrl(), "https://integrate.api.nvidia.com/v1");
  process.env.BION_LLM_NVIDIA_BASE_URL = " https://api.deepinfra.com/v1/openai/ ";
  igual("base: DeepInfra sem barra final", nvidiaBaseUrl(), "https://api.deepinfra.com/v1/openai");
  igual("base: em nvidiaConfig", nvidiaConfig().baseUrl, "https://api.deepinfra.com/v1/openai");
  delete process.env.BION_LLM_RESERVA_GEMINI;
  process.env.VERCEL_ENV = "preview";
  igual("reserva: padrão ligada", reservaGeminiAtiva(), true);
  for (const v of ["0", "false", "FALSE"]) {
    process.env.BION_LLM_RESERVA_GEMINI = v;
    igual(`reserva: '${v}' desliga`, reservaGeminiAtiva(), false);
  }
  process.env.BION_LLM_RESERVA_GEMINI = "1";
  igual("reserva: '1' liga", reservaGeminiAtiva(), true);
  delete process.env.BION_LLM_RESERVA_GEMINI;
  process.env.VERCEL_ENV = "production";
  igual("reserva: padrão DESLIGADA em produção", reservaGeminiAtiva(), false);
  process.env.BION_LLM_RESERVA_GEMINI = "true";
  igual("reserva: 'true' liga em produção", reservaGeminiAtiva(), true);
  delete process.env.BION_LLM_RESERVA_GEMINI_MODEL;
  igual("reserva: modelo vazio", modeloReservaGemini(), null);
  process.env.BION_LLM_RESERVA_GEMINI_MODEL = " gemini-2.5-flash ";
  igual("reserva: modelo escolhido", modeloReservaGemini(), "gemini-2.5-flash");
  restaurar();
}

{
  // fetch vai para a base configurada
  const salvoBase = process.env.BION_LLM_NVIDIA_BASE_URL;
  const salvoChave = process.env.NVIDIA_API_KEY;
  process.env.BION_LLM_NVIDIA_BASE_URL = "https://exemplo.invalid/v1";
  process.env.NVIDIA_API_KEY = "chave-de-teste";
  const fetchOriginal = globalThis.fetch;
  let urlChamada = "";
  globalThis.fetch = (async (u: string | URL | Request) => {
    urlChamada = String(u);
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
  }) as typeof fetch;
  await chatNvidia([{ role: "user", content: "oi" }], { timeoutMs: 2_000 });
  globalThis.fetch = fetchOriginal;
  igual("fetch: usa BION_LLM_NVIDIA_BASE_URL", urlChamada, "https://exemplo.invalid/v1/chat/completions");
  if (salvoBase === undefined) delete process.env.BION_LLM_NVIDIA_BASE_URL;
  else process.env.BION_LLM_NVIDIA_BASE_URL = salvoBase;
  if (salvoChave === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = salvoChave;
}

{
  // vazamento de raciocínio (bloqueio do Médicos)
  igual("think: órfão </think> descarta antes", semPensamento("pensei muito aqui</think>Resposta."), "Resposta.");
  igual("think: maiúsculas", semPensamento("<THINK>x</Think>Oi"), "Oi");
  igual("think: órfão maiúsculo", semPensamento("raciocínio</THINK> Oi"), "Oi");
  igual("think: abertura sem fim descarta", semPensamento("<think>só raciocínio"), "");
  igual("think: texto sem tags intacto", semPensamento("Olá, tudo bem?"), "Olá, tudo bem?");
  const juntar = (pedacos: string[]) => {
    const f = new FiltroPensamento();
    const saidas = pedacos.map((p) => f.empurrar(p));
    return { saidas, total: saidas.join("") + f.fechar() };
  };
  const r1 = juntar(["Vou anali", "sar o caso </th", "ink>Resposta", " final"]);
  igual("stream: órfão partido não vaza", r1.total, "Resposta final");
  igual("stream: nada sai antes do </think>", r1.saidas.slice(0, 2).join(""), "");
  const r2 = juntar(["<Think>a", "b</THINK>", "Oi"]);
  igual("stream: maiúsculas partidas", r2.total, "Oi");
  const longo = "x".repeat(LIMITE_RETENCAO + 1);
  const r3 = juntar(["Oi ", longo]);
  igual("stream: sem tags libera após limite", r3.saidas[1], "Oi " + longo);
  const r4 = juntar(["Oi curto"]);
  igual("stream: curto sai no fechar", r4.total, "Oi curto");
}

{
  // revisão do Admin: erro curto, monitor, stream interrompido
  igual("erro: null fica null", encurtarErro(null), null);
  igual("erro: curto intacto", encurtarErro("HTTP 500"), "HTTP 500");
  igual("erro: longo cortado", encurtarErro("x".repeat(500))!.length, MAX_ERRO);
  const { resumir, chaveEvento } = await import("@/lib/server/llm-monitor");
  const base = { fonte: null, modelo: null, textoLen: 0, http: null, finish: null, erro: null };
  const r = resumir([
    { ...base, ts: 1, ok: true, ms: 100, origem: "servidor" },
    { ...base, ts: 2, ok: false, ms: 200 },
    { ...base, ts: 3, ok: false, ms: 99_000, origem: "cliente" },
  ]);
  igual("monitor: cliente fora dos turnos", [r.turnos, r.falhas, r.falhasCliente], [2, 1, 1]);
  igual("monitor: cliente fora do p95", r.msP95, 100);
  igual(
    "monitor: chave distingue origem",
    chaveEvento({ ts: 5, requestId: "a", origem: "cliente" }) === chaveEvento({ ts: 5, requestId: "a" }),
    false,
  );

  // stream cortado pelo consumidor depois do 1º token
  const salvo = { ...process.env };
  process.env.NVIDIA_API_KEY = "chave-de-teste";
  process.env.BION_LLM_NVIDIA_ATIVO = "true";
  process.env.BION_LLM_RESERVA_GEMINI = "0";
  delete process.env.BION_LLM_NVIDIA_BASE_URL;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      'data: {"choices":[{"delta":{"content":"Olá, aqui é a resposta da BION, que vai ser cortada. ' + "y".repeat(LIMITE_RETENCAO) + '"}}]}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )) as unknown as typeof fetch;
  const { chatStreamComFonte } = await import("@/lib/server/llm");
  const { eventosLlmMemoria } = await import("@/lib/server/llm-monitor");
  const g = chatStreamComFonte([{ role: "user", content: "oi" }], 5_000, { requestId: "ia_teste_cort" });
  const primeiro = await g.next();
  igual("stream: 1º delta chega", (primeiro.value as { tipo?: string })?.tipo, "delta");
  await g.return(undefined);
  const ev = eventosLlmMemoria().find((e) => e.requestId === "ia_teste_cort");
  igual("stream: corte registrado ok=false", [ev?.ok, ev?.erro], [false, "stream_interrompido"]);
  globalThis.fetch = fetchOriginal;
  for (const k of ["NVIDIA_API_KEY", "BION_LLM_NVIDIA_ATIVO", "BION_LLM_RESERVA_GEMINI"]) {
    if (salvo[k] === undefined) delete process.env[k];
    else process.env[k] = salvo[k];
  }
}

console.log(`llm: ${ok} ok, ${falhas} falha(s) [TZ=${process.env.TZ ?? "padrão"}]`);
if (falhas) process.exit(1);

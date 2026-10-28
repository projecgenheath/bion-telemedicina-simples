/**
 * Testes de prazo/nova tentativa/id por pedido da camada llm (Gemini) — fetch
 * FALSO e dados de exemplo; nenhuma chamada real nem gravação em banco.
 * Rodar: env -u DATABASE_URL -u DIRECT_URL BION_LLM_GEMINI_API_KEY=chave-falsa bun --conditions=react-server src/lib/server/llm-timeout.teste.ts
 */
export {};
process.env.BION_LLM_GEMINI_API_KEY ||= "chave-falsa";
process.env.BION_LLM_GEMINI_RESERVA = "";
const { chatComFonte } = await import("./llm");
const { eventosLlmMemoria } = await import("./llm-monitor");

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}

const respostaOk = (texto: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: "STOP" }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const msgs = (t: string) => [
  { role: "assistant" as const, content: "Você é a BION IA." },
  { role: "user" as const, content: t },
];

let chamadas = 0;
let abortados = 0;
const original = globalThis.fetch;

// 1) 1ª chamada trava (abortada pelo AbortSignal), 2ª tentativa responde.
globalThis.fetch = ((_u: unknown, init?: RequestInit) => {
  chamadas++;
  if (chamadas === 1) {
    return new Promise((_, rej) =>
      init?.signal?.addEventListener("abort", () => {
        abortados++;
        rej(init.signal!.reason);
      }),
    );
  }
  return Promise.resolve(respostaOk("Olá! Como posso ajudar você hoje?"));
}) as typeof fetch;
// prazo 13s: 1ª tentativa ~7,8s (60%), sobra > 6s para a nova tentativa.
const r1 = await chatComFonte(msgs("oi"), 13_000, undefined, { somenteGemini: true, retries: 1 });
igual("retry: texto", r1.texto?.startsWith("Olá!"), true);
igual("retry: fetch abortado", abortados, 1);
igual("retry: 2 chamadas", chamadas, 2);
igual("retry: registro timeout", r1.registros?.[0]?.erro, "timeout");
igual("retry: requestId", typeof r1.requestId === "string" && r1.requestId.length >= 32, true);
const ev1 = eventosLlmMemoria()[0];
igual("monitor: requestId", ev1.requestId, r1.requestId);
igual("monitor: tentativas", ev1.tentativas, 2);

// 2) Pedidos SIMULTÂNEOS não misturam registros (antes: _registrosGemini global).
globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
  const corpo = String(init?.body ?? "");
  if (corpo.includes("pedido-A")) {
    await new Promise((r) => setTimeout(r, 30));
    return new Response(JSON.stringify({ error: { message: "cota" } }), { status: 429, headers: { "content-type": "application/json" } });
  }
  return respostaOk("Claro! Posso ajudar com o agendamento da sua consulta.");
}) as typeof fetch;
const [a, b] = await Promise.all([
  chatComFonte(msgs("pedido-A"), 8_000, undefined, { somenteGemini: true, retries: 0 }),
  chatComFonte(msgs("pedido-B"), 8_000, undefined, { somenteGemini: true, retries: 0 }),
]);
igual("concorrência: A falhou", a.texto, null);
igual("concorrência: A status próprio", a.registros?.map((x) => x.status), [429]);
igual("concorrência: B ok", Boolean(b.texto), true);
igual("concorrência: B status próprio", b.registros?.map((x) => x.status), [200]);
igual("concorrência: ids distintos", a.requestId !== b.requestId, true);

// 3) 503 rápido → uma nova tentativa (e só uma).
chamadas = 0;
globalThis.fetch = (async () => {
  chamadas++;
  return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const r3 = await chatComFonte(msgs("oi"), 12_000, undefined, { somenteGemini: true, retries: 1 });
igual("503: sem texto", r3.texto, null);
igual("503: repetiu com folga", chamadas, 2);

// 4) Prazo curto demais para nova tentativa → não repete.
chamadas = 0;
const r4 = await chatComFonte(msgs("oi"), 5_000, undefined, { somenteGemini: true, retries: 1 });
igual("prazo curto: sem texto", r4.texto, null);
igual("prazo curto: 1 chamada", chamadas, 1);

globalThis.fetch = original;
console.log(`llm-timeout: ${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

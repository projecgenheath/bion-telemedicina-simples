/**
 * Testes do cliente da BION IA (lib/bion-ia-cliente.ts) — dados de exemplo.
 * Rodar: bun src/lib/bion-ia-cliente.teste.ts
 */
import { mensagemFalhaIa, postarIa } from "./bion-ia-cliente";

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

const logs: unknown[][] = [];
console.warn = (...a: unknown[]) => void logs.push(a);

const fake = (corpo: string, status: number, tipo: string): typeof fetch =>
  (async () => new Response(corpo, { status, headers: { "content-type": tipo } })) as typeof fetch;

// 504 HTML do gateway → timeout, sem quebrar
const r1 = await postarIa("/api/bion-ia", { body: "{}" }, { fetchImpl: fake("<html>An error occurred</html>", 504, "text/html") });
igual("504 html ok", r1.ok, false);
igual("504 html falha", !r1.ok && r1.falha, "timeout");
igual("504 html status", r1.status, 504);

// 500 HTML → nao-json
const r2 = await postarIa("/api/bion-ia", {}, { fetchImpl: fake("<html>x</html>", 500, "text/html") });
igual("500 html", !r2.ok && r2.falha, "nao-json");

// 503 JSON com erro e requestId
const r3 = await postarIa<{ erro?: string }>("/api/bion-ia", {}, { fetchImpl: fake(JSON.stringify({ erro: "O modelo demorou demais.", requestId: "abc" }), 503, "application/json") });
igual("503 json falha", !r3.ok && r3.falha, "http");
igual("503 json erro", r3.json?.erro, "O modelo demorou demais.");
igual("503 json requestId", r3.requestId, "abc");

// 200 JSON
const r4 = await postarIa<{ resposta: string }>("/api/bion-ia", {}, { fetchImpl: fake(JSON.stringify({ resposta: "Olá!", requestId: "r1" }), 200, "application/json; charset=utf-8") });
igual("200 ok", r4.ok, true);
igual("200 resposta", r4.ok && r4.json.resposta, "Olá!");

// timeout do cliente (AbortSignal)
const lento: typeof fetch = ((_u: unknown, init?: RequestInit) =>
  new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal!.reason)))) as typeof fetch;
const r5 = await postarIa("/api/bion-ia", {}, { fetchImpl: lento, prazoMs: 30 });
igual("timeout cliente", !r5.ok && r5.falha, "timeout");

// rede
const r6 = await postarIa("/api/bion-ia", {}, { fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch });
igual("rede", !r6.ok && r6.falha, "rede");

// log sem PII: corpo enviado e HTML nunca aparecem no log; query some
const r7 = await postarIa("/api/anamnese?consulta=123", { body: JSON.stringify({ mensagem: "Maria Silva CPF 000" }) }, { fetchImpl: fake("<html>Maria</html>", 504, "text/html") });
igual("r7", r7.ok, false);
const textoLogs = JSON.stringify(logs);
igual("log sem corpo", textoLogs.includes("Maria"), false);
igual("log sem query", textoLogs.includes("consulta=123"), false);
igual("log quantidade", logs.length, 6);

igual("msg timeout", mensagemFalhaIa("timeout").includes("demorou"), true);

console.log(`bion-ia-cliente: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

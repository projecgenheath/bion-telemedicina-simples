/** FASE 3 — verificação focada do heartbeat do SSE em produção (somente leitura,
 *  não envia mensagem). Abre o stream e espera até 18s por um ": ping". */
const BASE = "https://bion-telemedicina-simples.vercel.app";

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "marina.silva@email.com", senha: "bion123456" }),
});
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const t0 = Date.now();
const res = await fetch(`${BASE}/api/mensagens/stream`, { headers: { cookie } });
const reader = res.body!.getReader();
const decod = new TextDecoder();
let buffer = "";
while (Date.now() - t0 < 18_000) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decod.decode(value, { stream: true });
  if (buffer.includes(": ping")) break;
}
await reader.cancel().catch(() => {});
const ms = Date.now() - t0;
const ok = buffer.includes(": ping");
console.log(`${ok ? "PASS" : "FAIL"} heartbeat ': ping' em produção (${ms}ms)`);
console.log(`bytes recebidos no período: ${buffer.length}`);
process.exit(ok ? 0 : 1);

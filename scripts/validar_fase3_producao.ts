/** Verificação da FASE 3 em PRODUÇÃO — SSE de mensagens pós-deploy. */
const BASE = "https://bion-telemedicina-simples.vercel.app";

async function login(email: string, senha: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  return {
    res,
    cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
    json: await res.json().catch(() => null),
  };
}

let falhas = 0;
const check = (n: string, ok: boolean, extra = "") =>
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${extra ? ` — ${extra}` : ""}`) ||
  (ok ? 0 : falhas++);

const marina = await login("marina.silva@email.com", "bion123456");
check("login marina (produção)", marina.res.status === 200);

const admin = await login("admin@bion.app", "bion123456");
check("login suporte BION (produção)", admin.res.status === 200);

// 1) Stream sem sessão → 401 (EventSource não reconecta; polling assume)
const r401 = await fetch(`${BASE}/api/mensagens/stream`);
check("stream sem sessão = 401", r401.status === 401, `status=${r401.status}`);

// 2) Abrir o stream da marina e capturar eventos
const reader = await fetch(`${BASE}/api/mensagens/stream`, {
  headers: { cookie: marina.cookie },
}).then((r) => {
  check("stream autenticado abre com text/event-stream",
    r.status === 200 && (r.headers.get("content-type") ?? "").includes("text/event-stream"),
    `status=${r.status} ct=${r.headers.get("content-type")}`);
  return r.body!.getReader();
});

const decod = new TextDecoder();
let buffer = "";
const texto = "Validação automática FASE 3 (SSE em produção) — pode ignorar.";
const idAdmin = (admin.json as { usuario?: { id?: string } })?.usuario?.id ?? "";

// 3) Suporte envia a mensagem enquanto o stream da marina está aberto
const t0 = Date.now();
const envio = await fetch(`${BASE}/api/mensagens`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: admin.cookie },
  body: JSON.stringify({ paraId: (marina.json as { usuario?: { id?: string } }).usuario!.id, texto }),
});
check("POST mensagem do suporte", envio.status === 200, `status=${envio.status}`);

// 4) Esperar o evento chegar pelo stream (teto 10s)
let chegou = false;
let viuPing = false;
while (Date.now() - t0 < 20_000) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decod.decode(value, { stream: true });
  if (buffer.includes(": ping")) viuPing = true;
  if (buffer.includes(texto)) {
    chegou = true;
    break;
  }
}
const ms = Date.now() - t0;
check("mensagem chegou em TEMPO REAL pelo stream", chegou, `${ms}ms após o POST`);
check("heartbeat ': ping' presente", viuPing);

if (chegou) {
  const bloco = buffer.split("\n\n").find((b) => b.includes(texto)) ?? "";
  const linhaDados = bloco.split("\n").find((l) => l.startsWith("data: ")) ?? "";
  try {
    const payload = JSON.parse(linhaDados.slice(6)) as { mensagens?: { texto: string; lida: boolean }[] };
    check("payload do evento tem a forma do GET ?desde=", Array.isArray(payload.mensagens) && payload.mensagens[0]?.texto === texto);
  } catch {
    check("payload do evento tem a forma do GET ?desde=", false, "JSON inválido");
  }
}

// 5) Encerrar o stream do cliente
await reader.cancel().catch(() => {});

console.log(falhas === 0 ? "\nRESULTADO: SSE 100% VALIDADO EM PRODUÇÃO" : `\nRESULTADO: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);

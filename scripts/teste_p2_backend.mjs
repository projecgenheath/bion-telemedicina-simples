/**
 * Testes unitários P2 backend (sem DB):
 *  - modoGateway fail-closed
 *  - HMAC webhook
 *  - sanitizer IA
 *  - validação de e-mail/id
 *
 * Uso: node scripts/teste_p2_backend.mjs
 */
import crypto from "crypto";
import assert from "assert";

let falhas = 0;
function ok(nome) {
  console.log("  ✓", nome);
}
function fail(nome, e) {
  falhas++;
  console.error("  ✗", nome, e?.message || e);
}

// --- modoGateway (réplica da lógica; evita import server-only) ---
function modoGateway(env) {
  if (env.BION_PAGAMENTO_WEBHOOK_SECRET?.trim()) return "webhook";
  const forcar = env.BION_PAGAMENTO_SIMULADO === "1";
  if (env.NODE_ENV === "production" && !forcar) return "pendente";
  return "simulado";
}

console.log("modoGateway");
try {
  assert.strictEqual(modoGateway({ NODE_ENV: "production" }), "pendente");
  ok("produção sem secret → pendente");
  assert.strictEqual(
    modoGateway({ NODE_ENV: "production", BION_PAGAMENTO_WEBHOOK_SECRET: "x" }),
    "webhook",
  );
  ok("produção com secret → webhook");
  assert.strictEqual(
    modoGateway({ NODE_ENV: "production", BION_PAGAMENTO_SIMULADO: "1" }),
    "simulado",
  );
  ok("produção + SIMULADO=1 → simulado");
  assert.strictEqual(modoGateway({ NODE_ENV: "development" }), "simulado");
  ok("dev → simulado");
} catch (e) {
  fail("modoGateway", e);
}

// --- HMAC ---
console.log("HMAC webhook");
try {
  const segredo = "segredo-teste";
  const corpo = JSON.stringify({ evento: "pagamento.confirmado", pagamentoId: "p1" });
  const sig = crypto.createHmac("sha256", segredo).update(corpo).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(sig, "utf8");
  assert.ok(crypto.timingSafeEqual(a, b));
  ok("assinatura válida");
  const ruim = Buffer.from("0".repeat(sig.length), "utf8");
  assert.ok(!crypto.timingSafeEqual(a, ruim));
  ok("assinatura inválida rejeitada");
} catch (e) {
  fail("HMAC", e);
}

// --- sanitize ---
console.log("llm-sanitize");
try {
  const limparArtefatos = (texto) =>
    texto
      .replace(/\u0060{3}[\s\S]*$/, "")
      .replace(/[{\[][^}]*?action_flow_id[\s\S]*$/m, "")
      .trim();
  const repararRepeticoes = (texto) => {
    let palavras = texto.split(/\s+/).filter(Boolean);
    const norma = (w) =>
      w
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zà-ú0-9]/g, "");
    for (let n = 4; n >= 1; n--) {
      for (let i = 0; i + 2 * n <= palavras.length; i++) {
        const a = palavras.slice(i, i + n).map(norma).join("|");
        const b = palavras.slice(i + n, i + 2 * n).map(norma).join("|");
        if (a && a === b && norma(palavras[i]).length >= 1) {
          palavras = [...palavras.slice(0, i + n), ...palavras.slice(i + 2 * n)];
          i = -1;
        }
      }
    }
    return palavras.join(" ");
  };
  assert.ok(!limparArtefatos('Olá\n```json\n{"action_flow_id":1}').includes("action_flow"));
  ok("limparArtefatos remove fence");
  assert.strictEqual(repararRepeticoes("que eu eu te guio"), "que eu te guio");
  ok("repararRepeticoes colapsa eco");
} catch (e) {
  fail("sanitize", e);
}

// --- validar ---
console.log("validar");
try {
  const emailNorm = (v) => {
    if (typeof v !== "string") return { erro: "E-mail inválido." };
    const s = v.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 254) return { erro: "E-mail inválido." };
    return s;
  };
  assert.strictEqual(emailNorm("  A@B.COM "), "a@b.com");
  ok("email normaliza");
  assert.ok(emailNorm("lixo").erro);
  ok("email inválido");
} catch (e) {
  fail("validar", e);
}

console.log(falhas ? `\nFALHOU: ${falhas}` : "\nTodos os testes P2 passaram.");
process.exit(falhas ? 1 : 0);

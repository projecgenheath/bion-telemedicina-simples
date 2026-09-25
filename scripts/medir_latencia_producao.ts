/**
 * MEDIDOR DE LATÊNCIA EM PRODUÇÃO — localizar a demora que o dono relatou.
 *
 * Mede, em sequência (mesmo fluxo do app no Chrome):
 *  1. POST /api/auth/login        → login
 *  2. GET  /api/bootstrap         → "Carregando BION..." (abertura do app)
 *  3. POST /api/bion-ia (2x)      → resposta da IA no chat
 *
 * Uso: bunx tsx scripts/medir_latencia_producao.ts
 */
const BASE = "https://bion-telemedicina-simples.vercel.app";
const SENHA = "bion123456";

async function cronometrar(nome: string, fn: () => Promise<number | string>) {
  const t0 = Date.now();
  try {
    const extra = await fn();
    console.log(`${String(Date.now() - t0).padStart(6)} ms  ${nome}${extra ? `  → ${extra}` : ""}`);
  } catch (e) {
    console.log(`${String(Date.now() - t0).padStart(6)} ms  ${nome}  → ERRO: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  let cookie = "";
  await cronometrar("POST /api/auth/login", async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "marina.silva@email.com", senha: SENHA }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
    return `HTTP ${r.status}`;
  });

  await cronometrar("GET  /api/bootstrap", async () => {
    const r = await fetch(`${BASE}/api/bootstrap`, { headers: { cookie } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { colecoes?: Record<string, unknown[]> };
    const n = j.colecoes ? Object.keys(j.colecoes).length : 0;
    return `HTTP ${r.status}, ${n} coleções`;
  });

  for (let i = 1; i <= 2; i++) {
    await cronometrar(`POST /api/bion-ia (msg ${i})`, async () => {
      const r = await fetch(`${BASE}/api/bion-ia`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({
          mensagens: [
            { remetente: "usuario", texto: "quero renovar minha receita, não tenho sintomas" },
          ],
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { resposta?: string; fonte?: string; modelo?: string };
      return `fonte=${j.fonte} modelo=${j.modelo ?? "—"} "${(j.resposta ?? "").slice(0, 70).replace(/\n/g, " ")}"`;
    });
  }
}

main();

/** Captura o DESPEJO BRUTO do Gemma em produção (via diagnóstico admin). Uso: bunx tsx scripts/ver_dump_gemma.ts */
const BASE = "https://bion-telemedicina-simples.vercel.app";
const SENHA = "bion123456";

async function login(email: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha: SENHA }),
  });
  if (!r.ok) throw new Error(`login: HTTP ${r.status}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}

async function main() {
  const admin = await login("admin@bion.app");
  const r = await fetch(`${BASE}/api/bion-ia/diagnostico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: admin },
    body: JSON.stringify({
      modelo: "gemma-4-26b-a4b-it",
      mensagens: [
        { role: "assistant", content: "Você é a BION IA, assistente virtual da BION Telemedicina. Responda em português do Brasil, direto, no máximo 5 linhas." },
        { role: "user", content: "Olá! Quero renovar minha receita de remédio de uso contínuo. Não tenho sintoma nenhum." },
      ],
    }),
  });
  const j = (await r.json()) as { texto?: string | null; registros?: unknown[] };
  console.log("=== TEXTO (bruto se insanitizável) ===");
  console.log(j.texto ?? "(null)");
  console.log("=== REGISTROS ===");
  for (const rg of j.registros ?? []) console.log(JSON.stringify(rg));
}

main().catch((e) => {
  console.error("FALHA:", e instanceof Error ? e.message : e);
  process.exit(1);
});

/** Diagnóstico multi-turno em produção (cenário [3] da validação). Uso: bunx tsx scripts/diag_multiturno.ts */
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
      mensagens: [
        { role: "assistant", content: "Você é a BION IA, assistente virtual da BION Telemedicina (plataforma brasileira de telemedicina).\n\nUsuário atual: Marina Silva (papel: PACIENTE).\n\nESTILO (obrigatório):\n- Português do Brasil, acolhedor e DIRETO: a primeira linha já responde ao que foi pedido. No máximo 5 linhas.\n\nPOLÍTICA DE INTENÇÃO (obrigatória):\n- Renovação de receita: explique que a receita é emitida pelo médico em uma **teleconsulta de reavaliação** e convide a agendar. Se a pessoa disser que NÃO tem sintomas, NÃO pergunte sintomas." },
        { role: "user", content: "Olá! Quero renovar minha receita de remédio de uso contínuo. Não tenho sintoma nenhum." },
        { role: "model", content: "Claro! A receita é emitida pelo médico em uma teleconsulta de reavaliação — é rápida e você não precisa estar com sintomas. Toque em Agendar consulta aqui embaixo que eu te guio no resto." },
        { role: "user", content: "Beleza, mas não quero marcar consulta agora. Então só confirma pra mim que minha Losartana está em uso no meu perfil?" },
      ],
    }),
  });
  const j = (await r.json()) as { texto?: string | null; registros?: unknown[] };
  console.log("=== TEXTO ===");
  console.log(j.texto ?? "(null)");
  console.log("=== REGISTROS ===");
  for (const rg of j.registros ?? []) console.log(JSON.stringify(rg));
}

main().catch((e) => {
  console.error("FALHA:", e instanceof Error ? e.message : e);
  process.exit(1);
});

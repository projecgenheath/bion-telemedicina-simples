/**
 * Diagnóstico em PRODUÇÃO do BION IA (rota /api/bion-ia).
 *
 * 1. Login admin → GET diagnóstico (estado dos canais/modelos configurados).
 * 2. POST diagnóstico reproduzindo o chat real com a mensagem da reclamação
 *    ("quero renovar receita, não tenho sintomas") na cadeia configurada.
 * 3. Login marina → POST /api/bion-ia (caminho REAL do paciente) com a mesma
 *    mensagem — mede latência ponta a ponta, resposta e fonte.
 *
 * Uso: bunx tsx scripts/diag_bion_ia_producao.ts
 */
const BASE = "https://bion-telemedicina-simples.vercel.app";
const SENHA = "bion123456";

function carimbo(): string {
  return new Date().toISOString().slice(11, 23);
}

async function login(email: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha: SENHA }),
  });
  const bruto = r.headers.get("set-cookie") ?? "";
  if (!r.ok) throw new Error(`login ${email}: HTTP ${r.status}`);
  const cookie = bruto.split(";")[0];
  return cookie;
}

const MSG_RENOVACAO = "Olá! Quero renovar minha receita de remédio de uso contínuo. Não tenho sintoma nenhum.";

async function chatPaciente(cookie: string) {
  const inicio = Date.now();
  const r = await fetch(`${BASE}/api/bion-ia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      mensagens: [
        { remetente: "usuario", texto: MSG_RENOVACAO },
      ],
    }),
  });
  const ms = Date.now() - inicio;
  const json = (await r.json().catch(() => ({}))) as { resposta?: string; fonte?: string; erro?: string };
  return { status: r.status, ms, resposta: json.resposta ?? json.erro ?? "(sem corpo)", fonte: json.fonte ?? "(—)" };
}

async function diagCadeia(adminCookie: string, modelo?: string) {
  const inicio = Date.now();
  const r = await fetch(`${BASE}/api/bion-ia/diagnostico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      modelo,
      mensagens: [
        {
          role: "assistant",
          content:
            'Você é o assistente virtual da BION Telemedicina, uma plataforma brasileira de telemedicina. Atende pelo nome "BION IA".\n\nUsuário atual: Marina Silva (papel: PACIENTE).\n\nDiretrizes obrigatórias:\n- Responda SEMPRE em português do Brasil, com linguagem acolhedora e objetiva.\n- Você NÃO prescreve, não altera doses e não faz diagnósticos fechados.',
        },
        { role: "user", content: MSG_RENOVACAO },
      ],
    }),
  });
  const ms = Date.now() - inicio;
  const json = (await r.json().catch(() => ({}))) as {
    texto?: string | null;
    registros?: { rotulo: string; status: number | null; finish: string | null; block: string | null; ms: number; textoLen: number; erro: string | null }[];
    erro?: string;
  };
  return { status: r.status, ms, json };
}

async function main() {
  console.log(`[${carimbo()}] === Diagnóstico BION IA em produção ===`);

  const admin = await login("admin@bion.app");
  const st = await fetch(`${BASE}/api/bion-ia/diagnostico`, { headers: { cookie: admin } });
  const estado = (await st.json().catch(() => ({}))) as { canais?: { gemini?: { configurado: boolean; modelo: string; reserva: string[] } } };
  console.log(`[${carimbo()}] Canais:`, JSON.stringify(estado.canais?.gemini));

  console.log(`[${carimbo()}] --- Chat real (paciente) com mensagem da reclamação ---`);
  const marina = await login("marina.silva@email.com");
  const ida = await chatPaciente(marina);
  console.log(`[${carimbo()}] Paciente: HTTP ${ida.status} · ${ida.ms}ms · fonte=${ida.fonte}`);
  console.log(`[${carimbo()}] Resposta (500 primeiros chars):\n${ida.resposta.slice(0, 500)}`);

  console.log(`[${carimbo()}] --- Diagnóstico: cadeia configurada ---`);
  const d1 = await diagCadeia(admin);
  console.log(`[${carimbo()}] HTTP ${d1.status} · ${d1.ms}ms · textoLen=${d1.json.textoLen ?? "—"} · texto=${(d1.json.texto ?? "(null)").slice(0, 200).replace(/\n/g, " ⏎ ")}`);
  for (const rg of d1.json.registros ?? []) {
    console.log(`   [${rg.rotulo}] status=${rg.status} finish=${rg.finish} block=${rg.block} ${rg.ms}ms len=${rg.textoLen} erro=${rg.erro?.slice(0, 80) ?? "—"}`);
  }

  console.log(`[${carimbo()}] --- Diagnóstico: gemma-4-26b-a4b-it isolado ---`);
  const d2 = await diagCadeia(admin, "gemma-4-26b-a4b-it");
  console.log(`[${carimbo()}] HTTP ${d2.status} · ${d2.ms}ms · textoLen=${d2.json.textoLen ?? "—"} · texto=${(d2.json.texto ?? "(null)").slice(0, 200).replace(/\n/g, " ⏎ ")}`);
  for (const rg of d2.json.registros ?? []) {
    console.log(`   [${rg.rotulo}] status=${rg.status} finish=${rg.finish} block=${rg.block} ${rg.ms}ms len=${rg.textoLen} erro=${rg.erro?.slice(0, 80) ?? "—"}`);
  }
}

main().catch((e) => {
  console.error("FALHA:", e instanceof Error ? e.message : e);
  process.exit(1);
});

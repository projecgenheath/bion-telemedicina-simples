/**
 * VALIDAÇÃO EM PRODUÇÃO — Gemma 4 26B A4B único + anti-anamnese.
 *
 * Cenários:
 *  1. GET diagnóstico: modelo efetivo = gemma-4-26b-a4b-it, reserva vazia.
 *  2. Chat REAL (paciente marina): "quero renovar receita, não tenho sintomas"
 *     → mede latência, fonte, modelo e QUALIDADE (não pode abrir anamnese /
 *     perguntar sintomas; deve guiar para teleconsulta/agendamento).
 *  3. Segunda mensagem (multi-turno): continua sem interrogar sintomas.
 *  4. Diagnóstico gemma isolado: telemetria por tentativa (limpo vs eco
 *     sanitizado), para enxergar o comportamento do modelo hospedado.
 *
 * Uso: bunx tsx scripts/validar_gemma_producao.ts
 */
const BASE = "https://bion-telemedicina-simples.vercel.app";
const SENHA = "bion123456";

let passou = 0;
let falhou = 0;
function verificar(nome: string, cond: boolean, detalhe?: string) {
  if (cond) {
    passou++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhou++;
    console.log(`  FAIL  ${nome}${detalhe ? ` → ${detalhe}` : ""}`);
  }
}

async function login(email: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha: SENHA }),
  });
  if (!r.ok) throw new Error(`login ${email}: HTTP ${r.status}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}

/** Resposta de anamnese = pergunta sobre sintomas quando a paciente disse que não tem. */
const RE_ANAMNESE_INDEVIDA =
  /(est[áa] sentindo|algum sintoma|quais sintomas|intensidade da dor|h[áa] quanto tempo (est[áa]|estou)|me conte (mais )?sobre|descreva (o que|os sintomas)|est[áa] tomando algum|algum outro (sintoma|medicamento))/i;
const RE_CAMINHO_CERTO =
  /(teleconsulta|reavalia|agend|consulta|m[eé]dico|receita)/i;

async function chatPaciente(cookie: string, mensagens: { remetente: string; texto: string }[]) {
  const inicio = Date.now();
  const r = await fetch(`${BASE}/api/bion-ia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ mensagens }),
  });
  const ms = Date.now() - inicio;
  const json = (await r.json().catch(() => ({}))) as {
    resposta?: string;
    fonte?: string;
    modelo?: string;
    erro?: string;
  };
  return { status: r.status, ms, ...json };
}

async function main() {
  console.log(`=== Validação Gemma 4 26B único — ${BASE} ===`);

  // 1) Estado dos canais
  const admin = await login("admin@bion.app");
  const st = (await (
    await fetch(`${BASE}/api/bion-ia/diagnostico`, { headers: { cookie: admin } })
  ).json()) as { canais?: { gemini?: { configurado: boolean; modelo: string; reserva: string[] } } };
  const gem = st.canais?.gemini;
  console.log(`\n[1] Canais: modelo=${gem?.modelo} reserva=[${(gem?.reserva ?? []).join(", ")}]`);
  verificar("modelo efetivo = gemma-4-26b-a4b-it", gem?.modelo === "gemma-4-26b-a4b-it", `got: ${gem?.modelo}`);
  verificar("reserva vazia (somente ele)", (gem?.reserva ?? []).length === 0, `got: ${gem?.reserva?.join(",")}`);

  // 2) Chat real — mensagem exata da reclamação
  const marina = await login("marina.silva@email.com");
  const MSG = "Olá! Quero renovar minha receita de remédio de uso contínuo. Não tenho sintoma nenhum.";
  const r1 = await chatPaciente(marina, [{ remetente: "usuario", texto: MSG }]);
  console.log(`\n[2] 1ª mensagem: HTTP ${r1.status} · ${r1.ms}ms · fonte=${r1.fonte} · modelo=${r1.modelo ?? "—"}`);
  console.log(`Resposta: ${r1.resposta?.slice(0, 400).replace(/\n+/g, " ⏎ ")}`);
  verificar("HTTP 200", r1.status === 200);
  verificar("fonte = gemini (canal Gemini API)", r1.fonte === "gemini", `got: ${r1.fonte}`);
  verificar("modelo = gemma-4-26b-a4b-it", r1.modelo === "gemma-4-26b-a4b-it", `got: ${r1.modelo}`);
  verificar("SEM anamnese interrogatória", !RE_ANAMNESE_INDEVIDA.test(r1.resposta ?? ""), `caiu no regex de perguntas de sintoma`);
  verificar("segue o caminho certo (teleconsulta/agendar)", RE_CAMINHO_CERTO.test(r1.resposta ?? ""));
  verificar("resposta enxuta (≤ 700 chars)", (r1.resposta?.length ?? 9999) <= 700, `len=${r1.resposta?.length}`);

  // 3) Multi-turno — insistência da paciente
  const r2 = await chatPaciente(marina, [
    { remetente: "usuario", texto: MSG },
    { remetente: "ia", texto: (r1.resposta ?? "").replace(/\*\*/g, "").slice(0, 500) },
    { remetente: "usuario", texto: "Beleza, mas não quero marcar consulta agora. Então só confirma pra mim que minha Losartana está em uso no meu perfil?" },
  ]);
  console.log(`\n[3] 2ª mensagem: HTTP ${r2.status} · ${r2.ms}ms · fonte=${r2.fonte} · modelo=${r2.modelo ?? "—"}`);
  console.log(`Resposta: ${r2.resposta?.slice(0, 300).replace(/\n+/g, " ⏎ ")}`);
  verificar("HTTP 200 (multi-turno)", r2.status === 200);
  verificar("multi-turno SEM interrogatório", !RE_ANAMNESE_INDEVIDA.test(r2.resposta ?? ""));

  // 4) Telemetria do Gemma isolado (enxerga despejo real, se houver)
  const dr = await (
    await fetch(`${BASE}/api/bion-ia/diagnostico`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: admin },
      body: JSON.stringify({
        modelo: "gemma-4-26b-a4b-it",
        mensagens: [
          { role: "assistant", content: "Você é a BION IA, assistente virtual da BION Telemedicina. Responda em português do Brasil, direto, no máximo 5 linhas." },
          { role: "user", content: MSG },
        ],
      }),
    })
  ).json() as { texto?: string | null; registros?: { rotulo: string; status: number | null; finish: string | null; ms: number; textoLen: number; erro: string | null }[]; erro?: string };
  console.log(`\n[4] Gemma isolado: textoLen=${dr.textoLen ?? "null"} · texto="${(dr.texto ?? "(null)").slice(0, 150).replace(/\n+/g, " ⏎ ")}"`);
  for (const rg of dr.registros ?? []) {
    console.log(`    [${rg.rotulo}] status=${rg.status} finish=${rg.finish} ${rg.ms}ms len=${rg.textoLen} erro=${rg.erro?.slice(0, 60) ?? "—"}`);
  }
  verificar("gemma respondeu (texto não nulo)", !!dr.texto);

  console.log(`\n=== RESULTADO: ${passou} PASS / ${falhou} FAIL ===`);
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => {
  console.error("FALHA:", e instanceof Error ? e.message : e);
  process.exit(1);
});

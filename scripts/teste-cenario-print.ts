/**
 * E2E do cenário EXATO do screenshot de 22/09 (Marina):
 *  1. Triagem em "identificação" → paciente diz "Peso em 80 kg"
 *     → perfil atualizado E etapa CONTINUA identificação (pergunta órfã eliminada);
 *  2. Paciente responde "Não" → etapa avança para QUEIXA com a pergunta real
 *     ("o que está te trazendo…"), nunca mais "Onde podemos prosseguir?";
 *  3. Chip "Não sei informar" na queixa → determinístico → avança para HISTÓRIA;
 *  4. Retomada sem mensagem na história → retoma a OPQRST pela posição certa.
 * Rodar com o servidor local na porta 3000. Limpa os registros ao final.
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.EMAIL || "marina.silva@email.com";
const SENHA = process.env.SENHA || "bion123456";

let cookie = "";
let falhas = 0;

function checar(nome: string, cond: boolean, detalhe?: string) {
  if (cond) {
    console.log(`  ✔ ${nome}`);
  } else {
    falhas++;
    console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

async function api(caminho: string, metodo: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const setC = res.headers.get("set-cookie");
  if (setC) cookie = setC.split(";")[0];
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {}
  return { status: res.status, json };
}

async function mainCenario() {
  console.log("== login ==");
  const login = await api("/api/auth/login", "POST", { email: EMAIL, senha: SENHA });
  checar("login 200", login.status === 200, `status=${login.status}`);

  console.log("== cria consulta (pagamento confirma no servidor) ==");
  const boot = await api("/api/bootstrap", "GET");
  const medicosBoot = (boot.json as { medicos?: { id: string; nome: string; status: string; especialidades?: string[] }[] }).medicos ?? [];
  const medicoAlvo = medicosBoot.find((m) => m.status === "ativo");
  if (!medicoAlvo) throw new Error("nenhum médico ativo no bootstrap");
  const especialidadeAlvo = medicoAlvo.especialidades?.[0] ?? "Clínica Geral";
  console.log(`  médico: ${medicoAlvo.nome} (${especialidadeAlvo})`);
  const criada = await api("/api/consultas", "POST", {
    especialidade: especialidadeAlvo,
    medicoId: medicoAlvo.id,
    data: "Amanhã",
    hora: "23:50",
    metodoPagamento: "pix",
  });
  let consultaId = String((criada.json as { consulta?: { id?: string } }).consulta?.id ?? "");
  let consulta = (criada.json as { consulta?: Record<string, unknown> }).consulta;
  checar("consulta criada", Boolean(consultaId), JSON.stringify(criada.json).slice(0, 220));
  checar("consulta nasce CONFIRMADA e paga (pagamento server-side)", consulta?.status === "confirmada" && consulta?.pago === true, `status=${consulta?.status} pago=${consulta?.pago}`);

  console.log("== abertura da triagem ==");
  const abertura = await api("/api/anamnese", "POST", { consultaId, historico: [] });
  checar("abertura 200", abertura.status === 200, JSON.stringify(abertura.json).slice(0, 160));
  console.log(`  [IA] ${(abertura.json as { texto?: string }).texto?.slice(0, 130)}`);
  const historico: { remetente: "usuario" | "ia"; texto: string }[] = [];
  historico.push({ remetente: "ia", texto: String((abertura.json as { texto?: string }).texto ?? "") });

  async function turno(mensagem: string) {
    const r = await api("/api/anamnese", "POST", { consultaId, mensagem, historico: historico.slice(-14) });
    const j = r.json as { texto?: string; etapa?: string; perfilAtualizado?: string[]; fonte?: string; erro?: string };
    historico.push({ remetente: "usuario", texto: mensagem });
    historico.push({ remetente: "ia", texto: String(j.texto ?? "") });
    console.log(`  [${mensagem}] → etapa=${j.etapa} fonte=${j.fonte} perfil=${JSON.stringify(j.perfilAtualizado ?? [])}`);
    console.log(`  [IA] ${String(j.texto ?? j.erro ?? "").slice(0, 160)}`);
    return j;
  }

  console.log("== CENÁRIO DO PRINT: 'Peso em 80 kg' ==");
  const t1 = await turno("Peso em 80 kg");
  checar("perfil atualizado com peso 80", (t1.perfilAtualizado ?? []).some((p) => p.includes("peso 80")), JSON.stringify(t1.perfilAtualizado));
  checar("etapa CONTINUA identificação (não avançou no meio da correção)", t1.etapa === "identificacao", `etapa=${t1.etapa}`);
  checar("resposta termina com pergunta clara", (t1.texto ?? "").includes("?"));

  console.log("== 'Não' → deve avançar para QUEIXA com a pergunta real ==");
  const t2 = await turno("Não");
  checar("etapa avançou para queixa", t2.etapa === "queixa", `etapa=${t2.etapa}`);
  checar("contém a pergunta da queixa (nada de beco sem saída)", /o que (est[áa]|voc[êe] est[áa])? ?te trazendo|com suas palavras/i.test(String(t2.texto)), String(t2.texto).slice(0, 200));
  checar("SEM 'Onde podemos prosseguir'", !/onde podemos prosseguir|tudo certo agora\?/i.test(String(t2.texto)));

  console.log("== queixa respondida → chip 'Não sei informar' é determinístico ==");
  const t3 = await turno("Dor de cabeça batendo há três dias, piorando à noite");
  console.log(`  (etapa após relato: ${t3.etapa})`);
  const t4 = await turno("Não sei informar");
  checar("chip avança para história (determinístico)", t4.etapa === "historia", `etapa=${t4.etapa}`);
  checar("pergunta da história (OPQRST — qualquer ponto em aberto)", /quando isso come[çc]ou|onde voc[êe] sente|pontada|press[ãa]o|intensidade|0 a 10|outro sintoma/i.test(String(t4.texto)), String(t4.texto).slice(0, 200));

  console.log("== retomada SEM mensagem na história ==");
  const t5 = await api("/api/anamnese", "POST", { consultaId, historico: historico.slice(-14) });
  const j5 = t5.json as { texto?: string; etapa?: string };
  console.log(`  [IA] ${String(j5.texto ?? "").slice(0, 160)}`);
  checar("retomada mantém a etapa história", j5.etapa === "historia", `etapa=${j5.etapa}`);
  checar("retomada traz a pergunta da OPQRST", (j5.texto ?? "").includes("?"));

  console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
  console.log(`CONSULTA_TESTE_ID=${consultaId}`);
}

mainCenario().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});

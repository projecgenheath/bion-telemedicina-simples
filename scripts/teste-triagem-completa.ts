/**
 * Regressão da TRIAGEM COMPLETA (11 etapas até concluir) — ADAPTATIVA:
 * lê a etapa atual a cada turno e responde o mapa certo (a sequência fixa
 * desalinhava quando o motor varia o pacing). Valida: todo turno 200, toda
 * resposta com pergunta clara, passagem pelas 11 etapas e conclusão.
 */
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const EMAIL = "marina.silva@email.com";
const SENHA = "bion123";

let cookie = "";
let falhas = 0;

function checar(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✔ ${nome}`);
  else {
    falhas++;
    console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

async function api(caminho: string, metodo: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(90_000),
  });
  const setC = res.headers.get("set-cookie");
  if (setC) cookie = setC.split(";")[0];
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const RESPOSTA_POR_ETAPA: Record<string, string | string[]> = {
  identificacao: ["Está certo", "Está certo"],
  queixa: "Dor de cabeça forte há três dias, piorando à noite",
  historia: [
    "Começou há três dias, de forma aos poucos",
    "Do lado direito, é uma pressão",
    "Um 8, piora com a luz forte",
    "Tomei dipirona e aliviou um pouco, e fiquei com enjoo leve",
    "Só a dor de cabeça mesmo, nada mais",
    "Não melhorou nada além da dipirona",
  ],
  sistemas: "Não, tudo normal pelo corpo",
  antecedentes: "Nenhuma cirurgia, nenhuma alergia importante",
  familia: "Meu pai tem diabetes",
  habitos: "Não fumo, não bebo, sono razoável",
  gineco: "Ciclo regular, sem gestações, uso pílula",
  psicossocial: "Estou ansiosa, mas a rotina segue normal",
  medicamentos: "Só a pílula e um complexo B",
  documentos: "Não tenho documentos para anexar",
  fechamento: "Está tudo correto, é isso",
};

async function main() {
  console.log("== login + consulta nova ==");
  checar("login 200", (await api("/api/auth/login", "POST", { email: EMAIL, senha: SENHA })).status === 200);
  const boot = await api("/api/bootstrap", "GET");
  const medicos = (boot.json as { medicos?: { id: string; nome: string; status: string; especialidades?: string[] }[] }).medicos ?? [];
  const medico = medicos.find((m) => m.status === "ativo");
  if (!medico) throw new Error("sem médico");
  const criada = await api("/api/consultas", "POST", {
    especialidade: (medico as { especialidade?: string }).especialidade ?? "Clínica Geral",
    medicoId: medico.id,
    data: "Amanhã",
    hora: "23:50",
    metodoPagamento: "pix",
  });
  const cid = (criada.json as { consulta?: { id: string } }).consulta?.id;
  checar("consulta criada e paga (confirmada)", !!cid);

  const abertura = await api("/api/anamnese", "POST", { consultaId: cid });
  const etapasVistas = new Set<string>([String(abertura.json.etapa)]);
  console.log(`  abertura: etapa=${abertura.json.etapa} fonte=${abertura.json.fonte}`);

  let ultimo = abertura.json;
  let etapaAtual = String(abertura.json.etapa);
  const historico: { remetente: string; texto: string }[] = [
    { remetente: "ia", texto: String(abertura.json.texto ?? "") },
  ];
  const indicePorEtapa: Record<string, number> = {};
  const MAX_TURNOS = 40;

  for (let i = 0; i < MAX_TURNOS && etapaAtual !== "concluida"; i++) {
    const mapa = RESPOSTA_POR_ETAPA[etapaAtual] ?? "Está tudo certo";
    const resposta = Array.isArray(mapa) ? (mapa[Math.min(indicePorEtapa[etapaAtual] ?? 0, mapa.length - 1)] ?? "Não sei informar") : mapa;
    if (Array.isArray(mapa)) indicePorEtapa[etapaAtual] = (indicePorEtapa[etapaAtual] ?? 0) + 1;

    const turno = await api("/api/anamnese", "POST", { consultaId: cid, mensagem: resposta, historico });
    if (turno.status !== 200) {
      checar(`turno ${i + 1} (${etapaAtual})`, false, `status=${turno.status} ${JSON.stringify(turno.json).slice(0, 120)}`);
      break;
    }
    ultimo = turno.json;
    etapaAtual = String(ultimo.etapa ?? etapaAtual);
    etapasVistas.add(etapaAtual);
    historico.push({ remetente: "usuario", texto: resposta });
    historico.push({ remetente: "ia", texto: String(ultimo.texto ?? "") });
    const temPergunta = String(ultimo.texto ?? "").includes("?");
    console.log(`  [${i + 1}] ${etapaAtual} ← "${resposta.slice(0, 30)}…" ${temPergunta ? "" : "(SEM PERGUNTA!)"} · ${String(ultimo.texto ?? "").slice(0, 80).replace(/\n/g, " | ")}`);
    if (!temPergunta && etapaAtual !== "fechamento") checar(`pergunta clara no turno ${i + 1}`, false, String(ultimo.texto ?? "").slice(0, 100));
    if (etapasVistas.size >= 12 && etapaAtual === "fechamento") {
      // fechamento pede confirmação final; uma resposta e a conversa encerra
      if ((indicePorEtapa["fechamento"] ?? 0) >= 1) break;
      indicePorEtapa["fechamento"] = 1;
    }
  }

  console.log(`  etapas visitadas (${etapasVistas.size}): ${[...etapasVistas].join(", ")}`);
  checar("fluxo passou por TODAS as 11 etapas do rito", etapasVistas.size >= 11, String(etapasVistas.size));
  checar("chegou ao fechamento", String(ultimo.etapa) === "fechamento", String(ultimo.etapa));

  const concluir = await api("/api/anamnese", "PATCH", { consultaId: cid, acao: "concluir" });
  checar("triagem concluída (PATCH 200)", concluir.status === 200);
  const boot2 = await api("/api/bootstrap", "GET");
  checar("anamnese concluída no estado", JSON.stringify(boot2.json).includes('"status":"concluida"'));

  console.log(falhas === 0 ? "\nREGRESSÃO COMPLETA OK" : `\n${falhas} CHECK(S) FALHARAM`);
  if (cid) console.log(`CONSULTA_TESTE_ID=${cid}`);
  if (falhas > 0) process.exit(1);
}

void main();

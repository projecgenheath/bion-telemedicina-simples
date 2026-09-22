/**
 * Testa se o caminho LLM da triagem funciona em produção quando NÃO há
 * cooldown: consulta nova → abertura (motor, sem LLM) → aguarda 65s →
 * UM turno "Peso em 80 kg" → a fonte deve ser publico (ou outro canal).
 */
const BASE = process.env.BASE_URL || "https://bion-telemedicina-simples.vercel.app";
const EMAIL = process.env.EMAIL || "marina.silva@email.com";
const SENHA = process.env.SENHA || "bion123";

let cookie = "";

async function api(caminho: string, metodo: string, corpo?: unknown) {
  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(90_000),
  });
  const setC = res.headers.get("set-cookie");
  if (setC) cookie = setC.split(";")[0];
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function main() {
  const login = await api("/api/auth/login", "POST", { email: EMAIL, senha: SENHA });
  console.log("login:", login.status);

  const boot = await api("/api/bootstrap", "GET");
  const medicos = (boot.json as { medicos?: { id: string; nome: string; status: string; especialidades?: string[] }[] }).medicos ?? [];
  const medico = medicos.find((m) => m.status === "ativo");
  if (!medico) throw new Error("sem médico ativo");

  const criada = await api("/api/consultas", "POST", {
    especialidade: medico.especialidades?.[0] ?? "Clínica Geral",
    medicoId: medico.id,
    data: "Amanhã",
    hora: "23:40",
    metodoPagamento: "pix",
  });
  const consultaId = (criada.json as { consulta?: { id?: string } })?.consulta?.id
    ?? (criada.json as { consultaCriada?: { id?: string } })?.consultaCriada?.id;
  console.log("consulta:", criada.status, consultaId);

  const abertura = await api("/api/anamnese", "POST", { consultaId });
  console.log("abertura:", abertura.status, "fonte:", abertura.json.fonte, "etapa:", abertura.json.etapa);

  console.log("aguardando 65s para expirar cooldown do canal público...");
  await new Promise((r) => setTimeout(r, 65_000));

  const turno = await api("/api/anamnese", "POST", { consultaId, mensagem: "Peso em 80 kg" });
  console.log("turno peso:", turno.status, "fonte:", turno.json.fonte, "etapa:", turno.json.etapa);
  console.log("texto:", String(turno.json.texto ?? "").slice(0, 200).replace(/\n/g, " | "));
  console.log("perfilAtualizado:", JSON.stringify(turno.json.perfilAtualizado));

  console.log("aguardando 65s novamente...");
  await new Promise((r) => setTimeout(r, 65_000));

  const turno2 = await api("/api/anamnese", "POST", { consultaId, mensagem: "Não" });
  console.log("turno 'Não':", turno2.status, "fonte:", turno2.json.fonte, "etapa:", turno2.json.etapa);
  console.log("texto:", String(turno2.json.texto ?? "").slice(0, 200).replace(/\n/g, " | "));
}

void main();

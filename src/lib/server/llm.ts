import ZAI from "z-ai-web-dev-sdk";

/**
 * Camada única de acesso à IA GENERATIVA para as rotas da BION IA.
 *
 * Cadeia de disponibilidade (na ordem):
 *  1. Credenciais próprias (env BION_LLM_BASE_URL + BION_LLM_API_KEY, API
 *     compatível com OpenAI) — canal confiável, dados completos;
 *  2. Endpoint público sem chave (Pollinations, OpenAI-compatible) — canal
 *     aberto usado por padrão na Vercel. POR SEGURANÇA (LGPD), os NOMES
 *     passados em `anon` são removidos das mensagens antes do envio;
 *  3. SDK do sandbox (internal-api.z.ai) — só existe dentro da rede do
 *     sandbox; sonda curta com resultado memorizado por instância.
 *
 * `chatCompleto()` devolve string | null e `chatComFonte()` também informa
 * a fonte ("env" | "publico" | "sdk"). As rotas usam null como sinal para
 * acionar os motores locais determinísticos — a BION IA nunca fica muda.
 */

export type Msg = { role: "user" | "assistant"; content: string };

export type AnonNomes = { nome: string; substituto: string }[];

export type FonteLlm = "env" | "publico" | "sdk";

type ClienteEnv = { tipo: "env"; baseUrl: string; apiKey: string; model?: string };
type ClienteSdk = { tipo: "sdk"; zai: Awaited<ReturnType<typeof ZAI.create>> };
type Cliente = ClienteEnv | ClienteSdk;

type Resultado = { texto: string | null; fonte: FonteLlm | null };

const SONDA_TIMEOUT_MS = 6_000;
const COOLDOWN_PUBLICO_MS = 60_000;
const PUBLICO_URL_PADRAO = "https://text.pollinations.ai/openai";
const PUBLICO_MODEL_PADRAO = "openai-fast";

let _sdk: { cliente: ClienteSdk | null; verificado: boolean } = { cliente: null, verificado: false };
let _publicoFalhaEm = 0;

const publicoHabilitado = () => process.env.BION_LLM_PUBLICO !== "0";
const publicoEmCooldown = () => Date.now() - _publicoFalhaEm < COOLDOWN_PUBLICO_MS;

function escapeRegExp(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove os nomes informados (paciente, médicos…) das mensagens — usado no canal público. */
export function anonimizarMensagens(mensagens: Msg[], anon?: AnonNomes): Msg[] {
  const pares = (anon ?? [])
    .map((n) => ({ nome: (n.nome ?? "").trim(), sub: (n.substituto ?? "").trim() }))
    .filter((n) => n.nome.length >= 3 && n.sub)
    .sort((a, b) => b.nome.length - a.nome.length)
    .map((n) => ({ re: new RegExp(escapeRegExp(n.nome), "gi"), sub: n.sub }));
  if (!pares.length) return mensagens;
  return mensagens.map((m) => {
    let conteudo = m.content;
    for (const p of pares) conteudo = conteudo.replace(p.re, p.sub);
    return { ...m, content: conteudo };
  });
}

function restante(prazo: number) {
  return prazo - Date.now();
}

async function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T | null> {
  try {
    return (await Promise.race([
      promessa,
      new Promise<null>((_, rejeita) => setTimeout(() => rejeita(new Error("timeout")), ms)),
    ])) as T;
  } catch {
    return null;
  }
}

/* ------------------------------- canal env ------------------------------- */

function clienteEnv(): ClienteEnv | null {
  const baseUrl = (process.env.BION_LLM_BASE_URL || "").trim();
  const apiKey = (process.env.BION_LLM_API_KEY || "").trim();
  if (!baseUrl || !apiKey) return null;
  return {
    tipo: "env",
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    model: process.env.BION_LLM_MODEL?.trim() || undefined,
  };
}

async function chamarEnv(c: ClienteEnv, mensagens: Msg[], prazo: number): Promise<string | null> {
  const corpo = {
    messages: mensagens,
    thinking: { type: "disabled" },
    ...(c.model ? { model: c.model } : {}),
  };
  const bruto = await comPrazo(
    fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify(corpo),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
      return r.json();
    }),
    restante(prazo),
  ) as { choices?: { message?: { content?: string } }[] } | null;
  return bruto?.choices?.[0]?.message?.content?.trim() || null;
}

/* ----------------------------- canal público ----------------------------- */

async function chamarPublico(mensagens: Msg[], prazo: number): Promise<string | null> {
  const url = (process.env.BION_LLM_PUBLICO_URL || PUBLICO_URL_PADRAO).trim();
  const model = (process.env.BION_LLM_PUBLICO_MODEL || PUBLICO_MODEL_PADRAO).trim();
  const bruto = await comPrazo(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: mensagens }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`publico HTTP ${r.status}`);
      return r.json();
    }),
    restante(prazo),
  ) as { choices?: { message?: { content?: string } }[] } | null;
  return bruto?.choices?.[0]?.message?.content?.trim() || null;
}

/* ------------------------------- canal sdk ------------------------------- */

async function tentarSdk(): Promise<ClienteSdk | null> {
  if (_sdk.verificado) return _sdk.cliente;
  try {
    const zai = await ZAI.create();
    const sonda = await comPrazo(
      zai.chat.completions.create({
        messages: [{ role: "user", content: "Responda apenas: ok" }],
        thinking: { type: "disabled" },
      }),
      SONDA_TIMEOUT_MS,
    ) as Awaited<ReturnType<typeof zai.chat.completions.create>> | null;
    _sdk = { cliente: sonda?.choices?.[0]?.message?.content ? { tipo: "sdk", zai } : null, verificado: true };
  } catch {
    _sdk = { cliente: null, verificado: true };
  }
  if (!_sdk.cliente) {
    console.warn("[llm] SDK do sandbox indisponível neste ambiente.");
  }
  return _sdk.cliente;
}

async function chamarSdk(c: ClienteSdk, mensagens: Msg[], prazo: number): Promise<string | null> {
  const bruto = await comPrazo(
    c.zai.chat.completions.create({
      messages: mensagens,
      thinking: { type: "disabled" },
    } as Parameters<typeof c.zai.chat.completions.create>[0]),
    restante(prazo),
  ) as { choices?: { message?: { content?: string } }[] } | null;
  return bruto?.choices?.[0]?.message?.content?.trim() || null;
}

/* ------------------------------ cadeia final ----------------------------- */

/**
 * Um turno de IA generativa. Tenta env → público (anonimizado) → SDK e
 * devolve texto + fonte; texto null quando nenhum canal respondeu.
 */
export async function chatComFonte(mensagens: Msg[], timeoutMs: number, anon?: AnonNomes): Promise<Resultado> {
  const prazo = Date.now() + Math.max(timeoutMs, 5_000);

  // 1) credenciais próprias — confiável, sem anonimização
  const env = clienteEnv();
  if (env) {
    const texto = await chamarEnv(env, mensagens, prazo);
    if (texto) return { texto, fonte: "env" };
  }

  // 2) endpoint público sem chave — anonimiza nomes antes de enviar
  if (publicoHabilitado() && process.env.BION_LLM_FORCAR_SDK !== "1" && !publicoEmCooldown()) {
    const texto = await chamarPublico(anonimizarMensagens(mensagens, anon), prazo);
    if (texto) return { texto, fonte: "publico" };
    _publicoFalhaEm = Date.now();
  }

  // 3) SDK do sandbox (sonda memorizada por instância)
  const sdk = await tentarSdk();
  if (sdk) {
    const texto = await chamarSdk(sdk, mensagens, prazo);
    if (texto) return { texto, fonte: "sdk" };
  }

  return { texto: null, fonte: null };
}

/** Compatibilidade: só o texto (ou null). */
export async function chatCompleto(mensagens: Msg[], timeoutMs: number, anon?: AnonNomes): Promise<string | null> {
  return (await chatComFonte(mensagens, timeoutMs, anon)).texto;
}

/** Cliente para chamadas de VISÃO (createVision) — env ou SDK do sandbox. */
export async function obterLLM(): Promise<ClienteEnv | ClienteSdk | null> {
  const env = clienteEnv();
  if (env) return env;
  return tentarSdk();
}

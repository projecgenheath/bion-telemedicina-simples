import ZAI from "z-ai-web-dev-sdk";

/**
 * Camada única de acesso ao LLM para as rotas da BION IA.
 *
 * Por que existe: o endpoint do SDK (internal-api.z.ai) só é alcançável de
 * dentro da rede do sandbox — na Vercel ele resolve para IP privado e TODA
 * chamada falha. Esta camada:
 *  1. Prioriza credenciais externas opcionais (env BION_LLM_BASE_URL +
 *     BION_LLM_API_KEY, compatível com APIs tipo OpenAI) — permite plugar um
 *     LLM público na Vercel sem mudar código;
 *  2. Tenta o SDK do sandbox com uma sonda curta e memoriza o resultado
 *     (disponível/indisponível) por instância de função — evita pagar o custo
 *     de uma chamada fadigada a cada request;
 *  3. Expõe `chatCompleto()` que devolve string | null — nunca lança. As
 *     rotas usam null como sinal para acionar o motor determinístico local.
 */

type Msg = { role: "user" | "assistant"; content: string };

type Cliente =
  | { tipo: "env"; baseUrl: string; apiKey: string; model?: string }
  | { tipo: "sdk"; zai: Awaited<ReturnType<typeof ZAI.create>> };

let _cache: { cliente: Cliente | null; verificado: boolean } = { cliente: null, verificado: false };

const SONDA_TIMEOUT_MS = 6_000;

async function tentarEnv(): Promise<Cliente | null> {
  const baseUrl = (process.env.BION_LLM_BASE_URL || "").trim();
  const apiKey = (process.env.BION_LLM_API_KEY || "").trim();
  if (!baseUrl || !apiKey) return null;
  return { tipo: "env", baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model: process.env.BION_LLM_MODEL?.trim() || undefined };
}

async function tentarSdk(): Promise<Cliente | null> {
  try {
    const zai = await ZAI.create();
    // Sonda barata: confirma que o endpoint responde DESTE ambiente.
    const sonda = (await Promise.race([
      zai.chat.completions.create({
        messages: [{ role: "user", content: "Responda apenas: ok" }],
        thinking: { type: "disabled" },
      }),
      new Promise<null>((_, rejeita) => setTimeout(() => rejeita(new Error("sonda-timeout")), SONDA_TIMEOUT_MS)),
    ])) as Awaited<ReturnType<typeof zai.chat.completions.create>> | null;

    if (sonda?.choices?.[0]?.message?.content) return { tipo: "sdk", zai };
    return null;
  } catch {
    return null;
  }
}

/** Cliente LLM deste ambiente, ou null quando indisponível (resultado memorizado). */
export async function obterLLM(): Promise<Cliente | null> {
  if (_cache.verificado) return _cache.cliente;
  const cliente = (await tentarEnv()) ?? (await tentarSdk());
  _cache = { cliente, verificado: true };
  if (!cliente) {
    console.warn("[llm] Nenhum LLM acessível neste ambiente — rotas usarão o motor local.");
  }
  return cliente;
}

/** Um turno de chat. Devolve o texto da resposta ou null se falhou/indisponível. */
export async function chatCompleto(
  mensagens: Msg[],
  timeoutMs: number,
): Promise<string | null> {
  const cliente = await obterLLM();
  if (!cliente) return null;

  const corpo = {
    messages: mensagens,
    thinking: { type: "disabled" },
    ...(cliente.tipo === "env" && cliente.model ? { model: cliente.model } : {}),
  };

  try {
    const bruto = (await Promise.race([
      cliente.tipo === "sdk"
        ? cliente.zai.chat.completions.create(corpo as Parameters<typeof cliente.zai.chat.completions.create>[0])
        : fetch(`${cliente.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cliente.apiKey}`,
            },
            body: JSON.stringify(corpo),
          }).then(async (r) => {
            if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
            return r.json();
          }),
      new Promise<null>((_, rejeita) => setTimeout(() => rejeita(new Error("timeout")), timeoutMs)),
    ])) as { choices?: { message?: { content?: string } }[] } | null;

    return bruto?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

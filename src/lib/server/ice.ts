import "server-only";

/**
 * Configuração ICE da sala de teleconsulta — montada NO SERVIDOR.
 *
 * Entregue por GET /api/telemedicina/[consultaId]/ice, só ao médico e ao
 * paciente da consulta. Credenciais de TURN nunca vão no bundle do cliente.
 *
 * Composição (ordem de prioridade):
 *  1. Cloudflare Realtime TURN (CLOUDFLARE_TURN_KEY_ID +
 *     CLOUDFLARE_TURN_KEY_API_TOKEN): credenciais CURTAS geradas a cada
 *     pedido (POST .../credentials/generate-ice-servers, ttl 4 h). A
 *     resposta já traz o STUN da Cloudflare; as URLs da porta 53 saem (o
 *     navegador bloqueia e a tentativa só atrasa o ICE).
 *  2. TURN próprio estático (BION_TURN_URLS, BION_TURN_USERNAME,
 *     BION_TURN_CREDENTIAL), se a Cloudflare não estiver configurada ou falhar.
 *  3. Só STUN público (Google e Cloudflare). O OpenRelay (usuário e senha
 *     fixos, públicos) saiu: as credenciais deixaram de funcionar e um TURN
 *     anônimo compartilhado não é aceitável para dado de saúde.
 */

export type IceServerConfig = { urls: string[]; username?: string; credential?: string };

export type ResultadoIce = {
  iceServers: IceServerConfig[];
  /** Quando as credenciais expiram (ms desde a época). O cliente renova antes disso. */
  expiraEm: number;
  fonte: "cloudflare" | "turn_proprio" | "stun";
};

export const STUN_PUBLICO: IceServerConfig[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/** Validade pedida à Cloudflare (s): maior que a consulta mais longa (a sala fica aberta 2 h 30). */
export const TTL_CLOUDFLARE_S = 14_400;
/** Sem credencial que expira (STUN / TURN estático): o cliente só reconsulta depois de 6 h. */
const VALIDADE_ESTATICA_MS = 6 * 3_600_000;
const TEMPO_LIMITE_CLOUDFLARE_MS = 4_000;

type Ambiente = Record<string, string | undefined>;

/** Tira URLs da porta 53 (bloqueada pelos navegadores) e servidores que ficaram sem URL. */
export function filtrarPorta53(lista: IceServerConfig[]): IceServerConfig[] {
  return lista
    .map((s) => ({ ...s, urls: s.urls.filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length > 0);
}

/** Normaliza um item vindo de fora (urls string | string[]). Devolve null se inválido. */
function normalizar(item: unknown): IceServerConfig | null {
  if (!item || typeof item !== "object") return null;
  const o = item as { urls?: unknown; username?: unknown; credential?: unknown };
  const urls = (Array.isArray(o.urls) ? o.urls : [o.urls]).filter(
    (u): u is string => typeof u === "string" && /^(stun|turns?):/.test(u),
  );
  if (urls.length === 0) return null;
  return {
    urls,
    ...(typeof o.username === "string" ? { username: o.username } : {}),
    ...(typeof o.credential === "string" ? { credential: o.credential } : {}),
  };
}

/** Lista sem Cloudflare: STUN público + TURN estático (se houver). Pura. */
export function iceServersEstaticos(env: Ambiente): ResultadoIce {
  const urls = (env.BION_TURN_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const username = env.BION_TURN_USERNAME?.trim();
  const credential = env.BION_TURN_CREDENTIAL?.trim();
  const lista: IceServerConfig[] = STUN_PUBLICO.map((s) => ({ ...s, urls: [...s.urls] }));
  if (urls.length > 0) {
    lista.push({ urls, ...(username ? { username } : {}), ...(credential ? { credential } : {}) });
  }
  return { iceServers: lista, expiraEm: Date.now() + VALIDADE_ESTATICA_MS, fonte: urls.length > 0 ? "turn_proprio" : "stun" };
}

/** A Cloudflare está configurada (as duas variáveis presentes)? */
export function cloudflareConfigurada(env: Ambiente): boolean {
  return !!env.CLOUDFLARE_TURN_KEY_ID?.trim() && !!env.CLOUDFLARE_TURN_KEY_API_TOKEN?.trim();
}

/**
 * Gera a lista de ICE servers. Com a Cloudflare configurada, pede credenciais
 * novas; se a chamada falhar (rede, 4xx/5xx, resposta sem TURN), registra o
 * erro e cai na lista estática — a sala nunca fica sem configuração.
 * `fetchImpl` e `agora` são injetáveis para teste.
 */
export async function gerarIceServers(
  env: Ambiente = process.env,
  fetchImpl: typeof fetch = fetch,
  agora: () => number = Date.now,
): Promise<ResultadoIce> {
  if (!cloudflareConfigurada(env)) return iceServersEstaticos(env);

  const keyId = env.CLOUDFLARE_TURN_KEY_ID!.trim();
  const token = env.CLOUDFLARE_TURN_KEY_API_TOKEN!.trim();
  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TTL_CLOUDFLARE_S }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_CLOUDFLARE_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      throw new Error(`Cloudflare TURN respondeu ${res.status}: ${corpo.slice(0, 200)}`);
    }
    const json = (await res.json()) as { iceServers?: unknown };
    const brutos = Array.isArray(json.iceServers) ? json.iceServers : json.iceServers ? [json.iceServers] : [];
    const lista = filtrarPorta53(brutos.map(normalizar).filter((s): s is IceServerConfig => s !== null));
    const temTurn = lista.some((s) => s.urls.some((u) => u.startsWith("turn")) && s.username && s.credential);
    if (!temTurn) throw new Error("Cloudflare TURN respondeu sem servidor TURN com credencial.");
    // STUN do Google como reserva extra de descoberta (a Cloudflare já manda o dela).
    lista.push({ urls: ["stun:stun.l.google.com:19302"] });
    return { iceServers: lista, expiraEm: agora() + TTL_CLOUDFLARE_S * 1000, fonte: "cloudflare" };
  } catch (e) {
    console.error("[ice] falha ao gerar credenciais da Cloudflare; usando a lista estática", e);
    return iceServersEstaticos(env);
  }
}

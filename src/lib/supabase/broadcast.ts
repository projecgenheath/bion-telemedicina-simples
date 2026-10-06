import "server-only";
import { supabaseConfigurado, supabaseServiceRoleKey, supabaseUrl } from "@/lib/supabase/env";

const TEMPO_LIMITE_MS = 3_000;

/**
 * Envia um broadcast Realtime pelo endpoint REST do Supabase
 * (POST /realtime/v1/api/broadcast, com a service role), SEM abrir WebSocket
 * por envio. Antes: subscribe → send → removeChannel a cada sinal (um socket
 * novo e ~300–800 ms por mensagem).
 *
 * - `privado: true` publica no canal PRIVADO (RLS em realtime.messages): a
 *   service role ignora o RLS para enviar; só recebe quem passa na policy.
 * - Best-effort: nunca lança; falhas vão para o log com contexto. Nas rotas,
 *   chame dentro de `after()` do next/server para a resposta não esperar.
 */
export async function broadcastCanal(
  canal: string,
  event: string,
  payload: Record<string, unknown>,
  opcoes: { privado?: boolean } = {},
): Promise<void> {
  const key = supabaseServiceRoleKey();
  if (!key || !supabaseConfigurado()) return;
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  // Chave legada (JWT service_role) também vai no Authorization; a chave nova
  // (sb_secret_…) vai só no apikey, que o gateway troca pelo papel service_role.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  try {
    const res = await fetch(`${supabaseUrl()}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ topic: canal, event, payload, private: opcoes.privado === true }] }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      console.error("[Realtime] broadcast recusado", { canal: rotulo(canal), event, status: res.status, corpo: corpo.slice(0, 200) });
    }
  } catch (e) {
    console.error("[Realtime] falha no broadcast", { canal: rotulo(canal), event, erro: e instanceof Error ? e.message : String(e) });
  }
}

/** Nome do canal para o log sem o sufixo secreto (canal da sala: sala:consulta:<id>:<hmac>). */
function rotulo(canal: string) {
  const partes = canal.split(":");
  return partes.length > 3 ? `${partes.slice(0, 3).join(":")}:…` : canal;
}

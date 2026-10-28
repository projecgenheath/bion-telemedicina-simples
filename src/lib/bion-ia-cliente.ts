/**
 * Cliente das rotas da BION IA (chat, triagem e leitura de exame).
 *
 * Problema real (2026-10): quando a função da Vercel estoura o tempo, a
 * resposta é um 504 em HTML ("An error occurred…"), não JSON. O `res.json()`
 * quebrava e o paciente via uma mensagem genérica de "rede", sem nenhum
 * registro do que aconteceu. Aqui:
 *  • o fetch tem prazo próprio (AbortSignal) um pouco acima do maxDuration;
 *  • resposta não-JSON (504 HTML, página de erro) vira falha tipada;
 *  • cada falha gera UM log sem PII (rota, status, tipo, ms, requestId) —
 *    nunca o texto digitado, nome, e-mail ou corpo da resposta.
 */

export type TipoFalhaIa = "timeout" | "rede" | "nao-json" | "http";

export type RespostaIa<T> =
  | { ok: true; status: number; json: T; requestId?: string }
  | { ok: false; status: number | null; json: T | null; falha: TipoFalhaIa; requestId?: string };

/** Prazo do cliente: maxDuration da rota (60s) + folga de rede. */
export const PRAZO_CLIENTE_IA_MS = 65_000;

function ehJson(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
}

function requestIdDe(json: unknown): string | undefined {
  if (json && typeof json === "object" && "requestId" in json) {
    const v = (json as { requestId?: unknown }).requestId;
    return typeof v === "string" ? v.slice(0, 64) : undefined;
  }
  return undefined;
}

/** Log de falha SEM dados pessoais — só metadados técnicos. */
export function logFalhaIa(info: { rota: string; status: number | null; falha: TipoFalhaIa; ms: number; requestId?: string }) {
  // Rota sem query string (nada de ids na URL vai para o log).
  const rota = info.rota.split("?")[0];
  console.warn("[bion-ia] falha", { rota, status: info.status, falha: info.falha, ms: info.ms, requestId: info.requestId ?? null });
}

export async function postarIa<T>(
  rota: string,
  init: RequestInit,
  opcoes?: { prazoMs?: number; fetchImpl?: typeof fetch },
): Promise<RespostaIa<T>> {
  const inicio = Date.now();
  const f = opcoes?.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(rota, { ...init, method: init.method ?? "POST", signal: AbortSignal.timeout(opcoes?.prazoMs ?? PRAZO_CLIENTE_IA_MS) });
  } catch (e) {
    const falha: TipoFalhaIa = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "rede";
    logFalhaIa({ rota, status: null, falha, ms: Date.now() - inicio });
    return { ok: false, status: null, json: null, falha };
  }
  let json: T | null = null;
  if (ehJson(res)) {
    json = (await res.json().catch(() => null)) as T | null;
  } else {
    await res.text().catch(() => ""); // descarta o HTML sem guardar
  }
  const requestId = requestIdDe(json);
  if (json === null) {
    // 504 HTML do gateway = a função estourou o tempo.
    const falha: TipoFalhaIa = res.status === 504 || res.status === 408 ? "timeout" : "nao-json";
    logFalhaIa({ rota, status: res.status, falha, ms: Date.now() - inicio });
    return { ok: false, status: res.status, json: null, falha };
  }
  if (!res.ok) {
    logFalhaIa({ rota, status: res.status, falha: "http", ms: Date.now() - inicio, requestId });
    return { ok: false, status: res.status, json, falha: "http", requestId };
  }
  return { ok: true, status: res.status, json, requestId };
}

/** Mensagem amigável para o paciente/médico quando não há `erro` do servidor. */
export function mensagemFalhaIa(falha: TipoFalhaIa): string {
  switch (falha) {
    case "timeout":
      return "A BION IA demorou mais que o normal para responder. Tente de novo em alguns segundos.";
    case "rede":
      return "Não consegui falar com a BION IA agora (conexão). Verifique a internet e tente de novo.";
    case "nao-json":
    case "http":
    default:
      return "A BION IA está instável neste momento. Tente de novo em alguns segundos.";
  }
}

import { MSG_CONSENTIMENTO_IA_PENDENTE, VERSAO_CONSENTIMENTO_IA, ehConsentimentoIaPendente } from "@/lib/consentimento-ia";
/**
 * Cliente da BION IA (navegador) — usado por ChatBion (paciente) e BionIA
 * (Copilot do médico). Pede `stream: true` e lê NDJSON de /api/bion-ia.
 *
 * - AbortController: timeout do cliente (padrão 45 s) e cancelamento.
 * - Resposta não-JSON (ex.: página HTML 504 da Vercel) vira mensagem amigável.
 * - Falhas do lado do cliente vão para o monitor LLM (/api/bion-ia/falha-cliente)
 *   só com requestId, tipo e status — sem texto da conversa (sem PII).
 * - O raciocínio do modelo chega em canal próprio (`raciocinio`), nunca
 *   misturado ao texto final.
 */

export type MsgBionIa = { remetente: "usuario" | "ia"; texto: string };
/** `texto` = só a resposta final (é o que se copia/insere). `raciocinio` vem à parte. */
export type RespostaBionIa = {
  texto: string;
  raciocinio: string;
  fonte: string | null;
  modelo: string | null;
  requestId: string | null;
};

/** Aviso mostrado na resposta e no bloco "ver como a IA pensou". */
export const AVISO_IA = "Conteúdo gerado por IA, não substitui avaliação médica.";
export type TipoFalhaCliente = "timeout" | "nao_json" | "rede" | "http" | "stream_interrompido";

export class ErroBionIa extends Error {
  constructor(
    mensagem: string,
    public tipo: TipoFalhaCliente | "servidor" | "consentimento" | "pausada",
    public parcial = "",
  ) {
    super(mensagem);
  }
}

export const MSG_TIMEOUT = "A BION IA demorou demais para responder. Toque em Tentar de novo.";
export const MSG_NAO_JSON = "O servidor da BION IA não respondeu direito agora. Tente de novo em alguns segundos.";
export const MSG_REDE = "Não consegui falar com a BION IA agora (rede). Tente novamente em instantes.";

export function reportarFalhaCliente(tipo: TipoFalhaCliente, extra: { requestId?: string | null; http?: number; ms?: number }) {
  try {
    void fetch("/api/bion-ia/falha-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, requestId: extra.requestId ?? undefined, http: extra.http, ms: extra.ms }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // telemetria nunca atrapalha o chat
  }
}

/** Lê linhas NDJSON de um stream de bytes. Exportado para teste. */
export async function* linhasNdjson(corpo: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const leitor = corpo.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!l) continue;
      try {
        yield JSON.parse(l) as Record<string, unknown>;
      } catch {
        throw new ErroBionIa(MSG_NAO_JSON, "nao_json");
      }
    }
  }
  const resto = buf.trim();
  if (resto) {
    try {
      yield JSON.parse(resto) as Record<string, unknown>;
    } catch {
      throw new ErroBionIa(MSG_NAO_JSON, "nao_json");
    }
  }
}

export async function perguntarBionIa(
  mensagens: MsgBionIa[],
  opcoes: {
    onDelta?: (textoAcumulado: string) => void;
    /** Raciocínio acumulado (canal separado; nunca entra em `texto`). */
    onRaciocinio?: (raciocinioAcumulado: string) => void;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<RespostaBionIa> {
  const inicio = Date.now();
  const ctrl = new AbortController();
  let porTimeout = false;
  const t = setTimeout(() => {
    porTimeout = true;
    ctrl.abort();
  }, opcoes.timeoutMs ?? 45_000);
  opcoes.signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  let requestId: string | null = null;
  let texto = "";
  let raciocinio = "";
  const falhar = (tipo: TipoFalhaCliente, msg: string, http?: number): never => {
    reportarFalhaCliente(tipo, { requestId, http, ms: Date.now() - inicio });
    throw new ErroBionIa(msg, tipo, texto);
  };
  try {
    let res: Response;
    try {
      res = await fetch("/api/bion-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ mensagens, stream: true }),
        signal: ctrl.signal,
      });
    } catch {
      if (opcoes.signal?.aborted && !porTimeout) throw new ErroBionIa("Cancelado.", "rede");
      return falhar(porTimeout ? "timeout" : "rede", porTimeout ? MSG_TIMEOUT : MSG_REDE);
    }
    requestId = res.headers.get("X-Request-Id");
    const tipoConteudo = res.headers.get("Content-Type") ?? "";

    if (!tipoConteudo.includes("ndjson")) {
      // JSON de erro (401/503/…) ou página HTML (504 da Vercel).
      const bruto = await res.text().catch(() => "");
      let j: { resposta?: string; raciocinio?: string | null; erro?: string; mensagem?: string; fonte?: string; modelo?: string; requestId?: string } | null = null;
      try {
        j = JSON.parse(bruto);
      } catch {
        j = null;
      }
      // Pausa da BION IA (opt-in): 503 bion_ia_pausada → aviso amigável.
      if (res.status === 503 && j?.erro === "bion_ia_pausada")
        throw new ErroBionIa(j.mensagem || "A BION IA volta em breve.", "pausada");
      // Portão jurídico: aceite da nova versão (NVIDIA) pendente → tela de aceite.
      if (ehConsentimentoIaPendente(res.status, j)) throw new ErroBionIa(MSG_CONSENTIMENTO_IA_PENDENTE, "consentimento");
      if (!j) return falhar(res.status === 504 ? "timeout" : "nao_json", res.status === 504 ? MSG_TIMEOUT : MSG_NAO_JSON, res.status);
      requestId = j.requestId ?? requestId;
      if (res.ok && j.resposta)
        return { texto: j.resposta, raciocinio: j.raciocinio ?? "", fonte: j.fonte ?? null, modelo: j.modelo ?? null, requestId };
      throw new ErroBionIa(j.erro || "A BION IA não respondeu agora. Toque em Tentar de novo.", "servidor");
    }
    if (!res.body) return falhar("nao_json", MSG_NAO_JSON, res.status);

    let fonte: string | null = null;
    let modelo: string | null = null;
    let terminou = false;
    try {
      for await (const ev of linhasNdjson(res.body)) {
        if (ev.tipo === "inicio" && typeof ev.requestId === "string") requestId = ev.requestId;
        else if (ev.tipo === "delta" && typeof ev.texto === "string") {
          texto += ev.texto;
          opcoes.onDelta?.(texto);
        } else if (ev.tipo === "raciocinio" && typeof ev.texto === "string") {
          raciocinio += ev.texto;
          opcoes.onRaciocinio?.(raciocinio);
        } else if (ev.tipo === "fim") {
          fonte = typeof ev.fonte === "string" ? ev.fonte : null;
          modelo = typeof ev.modelo === "string" ? ev.modelo : null;
          terminou = true;
        } else if (ev.tipo === "erro") {
          throw new ErroBionIa(typeof ev.erro === "string" ? ev.erro : "A BION IA não respondeu agora.", "servidor", texto);
        }
      }
    } catch (e) {
      if (e instanceof ErroBionIa && e.tipo === "servidor") throw e;
      if (e instanceof ErroBionIa) return falhar(e.tipo as TipoFalhaCliente, e.message, res.status);
      return falhar(porTimeout ? "timeout" : "stream_interrompido", porTimeout ? MSG_TIMEOUT : MSG_REDE, res.status);
    }
    if (!terminou || !texto.trim()) {
      if (texto.trim()) return { texto, raciocinio, fonte, modelo, requestId }; // parcial útil
      return falhar("stream_interrompido", MSG_REDE, res.status);
    }
    return { texto, raciocinio, fonte, modelo, requestId };
  } finally {
    clearTimeout(t);
  }
}

/** Registra o aceite da versão atual da BION IA (NVIDIA). true = aceito. */
export async function aceitarConsentimentoIa(): Promise<boolean> {
  try {
    const r = await fetch("/api/paciente/consentimento-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versao: VERSAO_CONSENTIMENTO_IA }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** O que o botão copiar/inserir usa: SÓ a resposta final, nunca o raciocínio. */
export function textoParaCopiar(msg: { texto: string; raciocinio?: string | null }): string {
  return msg.texto;
}

import {
  MSG_ACEITE_COPILOT_MEDICO_PENDENTE,
  VERSAO_ACEITE_COPILOT_MEDICO,
  ehAceiteCopilotMedicoPendente,
} from "@/lib/aceite-copilot-medico";
import type { AcaoBionIa } from "@/lib/bion-ia-acao";
import { aceiteTermosPayload } from "@/lib/aceite-termos";
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
  /** Ação sugerida pela IA (ex.: card "Agendar consulta"). */
  acao?: AcaoBionIa | null;
};

function lerAcao(v: unknown): AcaoBionIa | null {
  const a = v as { tipo?: unknown; especialidade?: unknown; medicoId?: unknown; medico?: unknown } | null;
  if (!a || a.tipo !== "agendar") return null;
  const txt = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  return { tipo: "agendar", especialidade: txt(a.especialidade), medicoId: txt(a.medicoId), medico: txt(a.medico) };
}

/** Aviso mostrado na resposta e no bloco "ver como a IA pensou". */
export const AVISO_IA = "Conteúdo gerado por IA, não substitui avaliação médica.";
export type TipoFalhaCliente = "timeout" | "nao_json" | "rede" | "http" | "stream_interrompido";

export class ErroBionIa extends Error {
  constructor(
    mensagem: string,
    public tipo: TipoFalhaCliente | "servidor" | "consentimento" | "pausada" | "aceite_copilot",
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
        // Teto de 12 mensagens (o servidor também corta).
        body: JSON.stringify({ mensagens: mensagens.slice(-12), stream: true }),
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
      let j: { acao?: unknown; resposta?: string; raciocinio?: string | null; erro?: string; mensagem?: string; fonte?: string; modelo?: string; requestId?: string } | null = null;
      try {
        j = JSON.parse(bruto);
      } catch {
        j = null;
      }
      // Pausa da BION IA (opt-in): 503 bion_ia_pausada → aviso amigável.
      if (res.status === 503 && j?.erro === "bion_ia_pausada")
        throw new ErroBionIa(j.mensagem || "A BION IA volta em breve.", "pausada");
      // Portão jurídico: aceite da nova versão (NVIDIA) pendente → tela de aceite.
      // LGPD: médico sem o aceite do Copilot → caixa de aceite (nada foi à IA).
      if (ehAceiteCopilotMedicoPendente(res.status, j))
        throw new ErroBionIa(MSG_ACEITE_COPILOT_MEDICO_PENDENTE, "aceite_copilot");
      if (ehConsentimentoIaPendente(res.status, j)) throw new ErroBionIa(MSG_CONSENTIMENTO_IA_PENDENTE, "consentimento");
      if (!j) return falhar(res.status === 504 ? "timeout" : "nao_json", res.status === 504 ? MSG_TIMEOUT : MSG_NAO_JSON, res.status);
      requestId = j.requestId ?? requestId;
      if (res.ok && j.resposta)
        return { texto: j.resposta, raciocinio: j.raciocinio ?? "", fonte: j.fonte ?? null, modelo: j.modelo ?? null, requestId, acao: lerAcao(j.acao) };
      throw new ErroBionIa(j.erro || "A BION IA não respondeu agora. Toque em Tentar de novo.", "servidor");
    }
    if (!res.body) return falhar("nao_json", MSG_NAO_JSON, res.status);

    let fonte: string | null = null;
    let modelo: string | null = null;
    let acao: AcaoBionIa | null = null;
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
        } else if (ev.tipo === "acao") {
          acao = lerAcao(ev.acao);
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
      if (texto.trim()) return { texto, raciocinio, fonte, modelo, requestId, acao }; // parcial útil
      return falhar("stream_interrompido", MSG_REDE, res.status);
    }
    return { texto, raciocinio, fonte, modelo, requestId, acao };
  } finally {
    clearTimeout(t);
  }
}

/** Estado do portão da IA: consentimento da IA e Termos/Política, separados. */
export type EstadoPortaoIa = { ia: boolean; termos: boolean };

/**
 * Estado atual (falha de rede ou resposta inesperada = false nos dois: falha
 * fechada, mostra o card de consentimento).
 */
export async function consultarEstadoIa(): Promise<EstadoPortaoIa> {
  try {
    const [ia, termos] = await Promise.all([
      fetch("/api/paciente/consentimento-ia", { cache: "no-store" }),
      fetch("/api/paciente/aceite-termos", { cache: "no-store" }),
    ]);
    const j = ia.ok ? ((await ia.json().catch(() => null)) as { vigente?: unknown; versao?: unknown } | null) : null;
    const t = termos.ok ? ((await termos.json().catch(() => null)) as { pendente?: unknown } | null) : null;
    return { ia: j?.vigente === true && j.versao === VERSAO_CONSENTIMENTO_IA, termos: t?.pendente === false };
  } catch {
    return { ia: false, termos: false };
  }
}

/** A IA está liberada (consentimento da IA vigente E Termos vigentes)? */
export async function consultarConsentimentoIa(): Promise<boolean> {
  const e = await consultarEstadoIa();
  return e.ia && e.termos;
}

/**
 * Registra o consentimento da IA (versão atual). Os Termos/Política só são
 * aceitos quando a paciente marcou a caixa PRÓPRIA deles (`aceitarTermos`):
 * são dois aceites separados, cada um com seu registro. true = tudo gravado.
 */
export async function aceitarConsentimentoIa(opcoes: { aceitarTermos?: boolean } = {}): Promise<boolean> {
  try {
    if (opcoes.aceitarTermos) {
      const termos = await fetch("/api/paciente/aceite-termos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aceiteTermosPayload("PACIENTE")),
      });
      if (!termos.ok) return false;
    }
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

/** Grava só o aceite dos Termos/Política vigentes (mesmo endpoint de sempre). */
export async function aceitarTermosVigentes(): Promise<boolean> {
  try {
    const r = await fetch("/api/paciente/aceite-termos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aceiteTermosPayload("PACIENTE")),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * "Usar o app sem a IA": a IA é recusada (nada é gravado para ela); se a
 * paciente marcou a caixa dos Termos, o aceite deles é gravado. true = pode fechar.
 */
export async function recusarIaGuardandoTermos(op: { termosPendentes: boolean; marcouTermos: boolean }): Promise<boolean> {
  if (!op.termosPendentes || !op.marcouTermos) return true;
  return aceitarTermosVigentes();
}

/** Revoga o consentimento da IA (Perfil > Privacidade). true = revogado. */
export async function revogarConsentimentoIa(): Promise<boolean> {
  try {
    const r = await fetch("/api/paciente/consentimento-ia", { method: "DELETE" });
    return r.ok;
  } catch {
    return false;
  }
}

/** O que o botão copiar/inserir usa: SÓ a resposta final, nunca o raciocínio. */
export function textoParaCopiar(msg: { texto: string; raciocinio?: string | null }): string {
  return msg.texto;
}

/** O médico já aceitou a versão atual do aviso do Copilot? Falha = false (fechada). */
export async function consultarAceiteCopilotMedico(): Promise<boolean> {
  try {
    const r = await fetch("/api/medico/copilot-aceite", { cache: "no-store" });
    if (!r.ok) return false;
    const j = (await r.json().catch(() => null)) as { vigente?: unknown; versao?: unknown } | null;
    return j?.vigente === true && j.versao === VERSAO_ACEITE_COPILOT_MEDICO;
  } catch {
    return false;
  }
}

/** Registra o aceite do Copilot do médico. true = aceito. */
export async function aceitarCopilotMedico(): Promise<boolean> {
  try {
    const r = await fetch("/api/medico/copilot-aceite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versao: VERSAO_ACEITE_COPILOT_MEDICO }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Revoga o aceite do Copilot do médico. true = revogado. */
export async function revogarCopilotMedico(): Promise<boolean> {
  try {
    const r = await fetch("/api/medico/copilot-aceite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aceito: false }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

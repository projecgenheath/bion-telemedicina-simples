/**
 * Canal NVIDIA (API compatível com OpenAI) — motor primário da BION IA.
 *
 * - Base: env BION_LLM_NVIDIA_BASE_URL (padrão https://integrate.api.nvidia.com/v1;
 *   qualquer provedor compatível com OpenAI, ex.: DeepInfra, troca só URL + chave)
 * - Chave: env NVIDIA_API_KEY (NUNCA no código, nunca em log). Sem chave, o
 *   canal é pulado em silêncio e a cadeia segue para o Gemini.
 * - Modelo: env BION_LLM_NVIDIA_MODEL (padrão nvidia/nemotron-3.5-super-vl-120b-a12b).
 * - Raciocínio: enable_thinking=false no chat (latência). Mesmo assim,
 *   `reasoning_content` e blocos <think>…</think> são DESCARTADOS aqui:
 *   o raciocínio nunca chega ao paciente nem ao médico.
 * - Fetch direto (sem SDK novo): a API é OpenAI-compatível e o streaming é
 *   SSE simples; todo request tem AbortSignal (timeout de verdade, sem
 *   requisição órfã consumindo cota).
 */

import { limparArtefatos, repararRepeticoes } from "@/lib/server/llm-sanitize";

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_MODELO_PADRAO = "nvidia/nemotron-3.5-super-vl-120b-a12b";

export type MsgNv = { role: "system" | "user" | "assistant"; content: string };
export type MsgEntradaNv = { role: "user" | "assistant" | "system"; content: string };

export type RegistroNvidia = {
  rotulo: string;
  status: number | null;
  ms: number;
  textoLen: number;
  erro: string | null;
};

export function nvidiaConfig() {
  // chave só lida do ambiente; nunca registrada
  const apiKey = (process.env.NVIDIA_API_KEY || "").trim();
  const model = (process.env.BION_LLM_NVIDIA_MODEL || NVIDIA_MODELO_PADRAO).trim();
  const baseUrl = nvidiaBaseUrl();
  return { apiKey, model, baseUrl };
}

/** Base OpenAI-compatível (sem barra final). Troca de provedor = URL + chave. */
export function nvidiaBaseUrl(): string {
  const v = (process.env.BION_LLM_NVIDIA_BASE_URL || "").trim().replace(/\/+$/, "");
  return v || NVIDIA_BASE;
}

/**
 * Reserva no Gemini quando o NVIDIA falha. BION_LLM_RESERVA_GEMINI="0"/"false"
 * desliga: a cadeia vira NVIDIA → erro amigável (sem Gemini).
 */
export function reservaGeminiAtiva(): boolean {
  const v = (process.env.BION_LLM_RESERVA_GEMINI || "").trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  return true;
}

/** Modelo do Gemini usado como reserva (opcional; vazio = configuração atual). */
export function modeloReservaGemini(): string | null {
  return (process.env.BION_LLM_RESERVA_GEMINI_MODEL || "").trim() || null;
}

/**
 * PORTÃO JURÍDICO: em produção o NVIDIA só roda com BION_LLM_NVIDIA_ATIVO=true
 * (depois do ok do Jurídico sobre os termos da API e da nova Política de
 * Privacidade / consentimento de IA). Fora de produção (preview/dev) roda
 * sempre que houver chave — testar só com dados de exemplo.
 */
export function nvidiaLiberado(): boolean {
  // Exigido em TODOS os ambientes (produção, preview e dev).
  return (process.env.BION_LLM_NVIDIA_ATIVO || "").trim().toLowerCase() === "true";
}

export const nvidiaConfigurado = () =>
  process.env.BION_LLM_NVIDIA !== "0" && nvidiaLiberado() && !!nvidiaConfig().apiKey;

/** Visão no NVIDIA só com flag explícita (o consentimento atual cita só o Google). */
export const nvidiaVisaoHabilitada = () => nvidiaConfigurado() && process.env.BION_LLM_NVIDIA_VISAO === "1";

/** Remove qualquer ocorrência da chave de um texto de erro. */
function limparSegredo(texto: string, segredo: string): string {
  const t = texto.slice(0, 300);
  return segredo ? t.split(segredo).join("[chave]") : t;
}

/**
 * Converte o formato interno (1ª mensagem "assistant" = instruções) para
 * OpenAI: instruções viram "system"; turnos vizinhos do mesmo papel são
 * fundidos; o histórico começa em "user".
 */
export function paraMensagensOpenAI(mensagens: MsgEntradaNv[]): MsgNv[] {
  const out: MsgNv[] = [];
  let resto = mensagens;
  if (mensagens[0] && mensagens[0].role !== "user") {
    out.push({ role: "system", content: mensagens[0].content });
    resto = mensagens.slice(1);
  }
  const turnos: MsgNv[] = [];
  for (const m of resto) {
    const role = m.role === "user" ? "user" : "assistant";
    const ant = turnos[turnos.length - 1];
    if (ant && ant.role === role) ant.content += `\n\n${m.content}`;
    else turnos.push({ role, content: m.content });
  }
  if (turnos[0]?.role === "assistant") turnos.unshift({ role: "user", content: "(contexto da conversa abaixo)" });
  return [...out, ...turnos];
}

/**
 * Filtro incremental de <think>…</think> no CONTEÚDO (alguns templates
 * devolvem o raciocínio inline mesmo com enable_thinking=false).
 *
 * Regras (sem vazar raciocínio):
 *  - tags sem diferenciar maiúsculas (<THINK>, </Think>);
 *  - `</think>` órfão (sem abertura) = fim do raciocínio: tudo ANTES é descartado;
 *  - no começo do stream a saída fica retida até aparecer `</think>` ou até
 *    passar LIMITE_RETENCAO caracteres sem nenhuma tag (aí é liberada).
 */
export const LIMITE_RETENCAO = 400;
const RE_ABRE = /<think>/i;
const RE_FECHA = /<\/think>/i;
const RE_TAG_PARCIAL = /<\/?t?h?i?n?k?$/i;

export class FiltroPensamento {
  private decidindo = true;
  private dentro = false;
  private buffer = "";
  private pendente = "";
  empurrar(pedaco: string): string {
    if (this.decidindo) {
      this.buffer += pedaco;
      const fecha = RE_FECHA.exec(this.buffer);
      const abre = RE_ABRE.exec(this.buffer);
      if (fecha && abre && abre.index < fecha.index) {
        // bloco bem formado: texto antes de <think> é visível
        const tudo = this.buffer;
        this.buffer = "";
        this.decidindo = false;
        return this.normal(tudo);
      }
      if (fecha) {
        const resto = this.buffer.slice(fecha.index + fecha[0].length);
        this.buffer = "";
        this.decidindo = false;
        return this.normal(resto);
      }
      if (RE_ABRE.test(this.buffer) || this.buffer.length <= LIMITE_RETENCAO) return "";
      const tudo = this.buffer;
      this.buffer = "";
      this.decidindo = false;
      return this.normal(tudo);
    }
    return this.normal(pedaco);
  }
  private normal(pedaco: string): string {
    let s = this.pendente + pedaco;
    this.pendente = "";
    let saida = "";
    while (s.length) {
      if (this.dentro) {
        const fim = RE_FECHA.exec(s);
        if (!fim) {
          this.pendente = s.slice(-7); // possível "</think" partido
          return saida;
        }
        s = s.slice(fim.index + fim[0].length);
        this.dentro = false;
      } else {
        const ini = RE_ABRE.exec(s);
        const fimOrfao = RE_FECHA.exec(s);
        if (fimOrfao && (!ini || fimOrfao.index < ini.index)) {
          // órfão depois de já liberar texto: descarta só o trecho deste pedaço
          saida = "";
          s = s.slice(fimOrfao.index + fimOrfao[0].length);
          continue;
        }
        if (!ini) {
          const parcial = RE_TAG_PARCIAL.exec(s);
          if (parcial && parcial[0].length > 0) {
            this.pendente = s.slice(parcial.index);
            return saida + s.slice(0, parcial.index);
          }
          return saida + s;
        }
        saida += s.slice(0, ini.index);
        s = s.slice(ini.index + ini[0].length);
        this.dentro = true;
      }
    }
    return saida;
  }
  /** Fim do stream: libera só texto que comprovadamente não é raciocínio. */
  fechar(): string {
    if (this.decidindo) {
      const b = this.buffer;
      this.buffer = "";
      this.decidindo = false;
      if (RE_ABRE.test(b)) return b.slice(0, RE_ABRE.exec(b)!.index); // raciocínio sem fim: descarta
      return this.normal(b) + this.fecharNormal();
    }
    return this.fecharNormal();
  }
  private fecharNormal(): string {
    const p = this.dentro ? "" : this.pendente;
    this.pendente = "";
    return p;
  }
}

/** Mesma higiene do texto do Gemini (artefatos e repetições). */
export function limparNvidia(texto: string): string {
  return texto ? repararRepeticoes(limparArtefatos(texto)).trim() : texto;
}

/** Limpeza final (não-stream): remove <think> e espaços. */
export function semPensamento(texto: string): string {
  const f = new FiltroPensamento();
  return (f.empurrar(texto) + f.fechar()).trim();
}

type OpcoesNv = {
  timeoutMs: number;
  /** Prazo para o 1º token do stream (fallback rápido quando o modelo trava). */
  primeiroTokenMs?: number;
  thinking?: boolean;
  maxTokens?: number;
  temperatura?: number;
  registros?: RegistroNvidia[];
  rotulo?: string;
};

function corpoChat(mensagens: unknown[], model: string, o: OpcoesNv, stream: boolean) {
  return {
    model,
    messages: mensagens,
    temperature: o.temperatura ?? 0.6,
    top_p: 0.95,
    max_tokens: o.maxTokens ?? 1024,
    stream,
    chat_template_kwargs: { enable_thinking: o.thinking === true },
  };
}

function registrar(o: OpcoesNv, r: Omit<RegistroNvidia, "rotulo">) {
  o.registros?.push({ rotulo: o.rotulo ?? "nvidia", ...r });
}

/** Chamada NÃO-stream. Devolve só o conteúdo final (sem raciocínio). */
export async function chatNvidia(mensagens: MsgEntradaNv[], o: OpcoesNv): Promise<string | null> {
  return completarNvidia(paraMensagensOpenAI(mensagens), o);
}

async function completarNvidia(mensagens: unknown[], o: OpcoesNv): Promise<string | null> {
  const { apiKey, model } = nvidiaConfig();
  if (!apiKey) return null;
  const inicio = Date.now();
  try {
    const r = await fetch(`${nvidiaBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      body: JSON.stringify(corpoChat(mensagens, model, o, false)),
      signal: AbortSignal.timeout(Math.max(o.timeoutMs, 1_000)),
    });
    const j = (await r.json().catch(() => null)) as
      | { choices?: { message?: { content?: string | null } }[]; error?: { message?: string } | string; detail?: string }
      | null;
    if (!r.ok) {
      const msg = typeof j?.error === "string" ? j.error : j?.error?.message ?? j?.detail ?? `HTTP ${r.status}`;
      registrar(o, { status: r.status, ms: Date.now() - inicio, textoLen: 0, erro: limparSegredo(String(msg), apiKey) });
      return null;
    }
    const texto = limparNvidia(semPensamento(j?.choices?.[0]?.message?.content ?? ""));
    registrar(o, { status: r.status, ms: Date.now() - inicio, textoLen: texto.length, erro: texto ? null : "sem texto" });
    return texto || null;
  } catch (e) {
    registrar(o, { status: null, ms: Date.now() - inicio, textoLen: 0, erro: erroDeFetch(e, apiKey) });
    return null;
  }
}

function erroDeFetch(e: unknown, apiKey: string): string {
  const nome = (e as { name?: string })?.name;
  if (nome === "TimeoutError" || nome === "AbortError") return "timeout";
  return limparSegredo(e instanceof Error ? e.message : String(e), apiKey);
}

/**
 * Chamada em STREAM (SSE). Gera só pedaços de CONTEÚDO visível:
 * `reasoning_content` é ignorado e <think> é filtrado.
 * Se nenhum token visível chegar em `primeiroTokenMs`, aborta (o chamador
 * cai no Gemini). Erro antes do 1º token → o gerador termina sem emitir.
 */
export async function* streamNvidia(mensagens: MsgEntradaNv[], o: OpcoesNv): AsyncGenerator<string> {
  const { apiKey, model } = nvidiaConfig();
  if (!apiKey) return;
  const inicio = Date.now();
  const ctrl = new AbortController();
  const total = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), Math.max(o.timeoutMs, 1_000));
  const primeiro = o.primeiroTokenMs
    ? setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), o.primeiroTokenMs)
    : null;
  let status: number | null = null;
  let len = 0;
  let erro: string | null = null;
  try {
    const r = await fetch(`${nvidiaBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, Accept: "text/event-stream" },
      body: JSON.stringify(corpoChat(paraMensagensOpenAI(mensagens), model, o, true)),
      signal: ctrl.signal,
    });
    status = r.status;
    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => "");
      erro = limparSegredo(t || `HTTP ${r.status}`, apiKey);
      return;
    }
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    const filtro = new FiltroPensamento();
    let buf = "";
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const linha = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!linha.startsWith("data:")) continue;
        const dado = linha.slice(5).trim();
        if (dado === "[DONE]") continue;
        let j: { choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[] } | null = null;
        try {
          j = JSON.parse(dado);
        } catch {
          continue;
        }
        // reasoning_content: DESCARTADO por construção (nunca lido).
        const c = j?.choices?.[0]?.delta?.content;
        if (!c) continue;
        const visivel = filtro.empurrar(c);
        if (visivel) {
          if (primeiro && len === 0) clearTimeout(primeiro);
          len += visivel.length;
          yield visivel;
        }
      }
    }
    const resto = filtro.fechar();
    if (resto) {
      len += resto.length;
      yield resto;
    }
    if (!len) erro = "sem texto";
  } catch (e) {
    erro = erroDeFetch(e, apiKey);
  } finally {
    clearTimeout(total);
    if (primeiro) clearTimeout(primeiro);
    // gerador abandonado pelo consumidor → cancela a requisição
    if (!ctrl.signal.aborted) ctrl.abort();
    registrar(o, { status, ms: Date.now() - inicio, textoLen: len, erro });
  }
}

/** Visão (imagem) no NVIDIA. PDFs NÃO passam aqui (seguem no Gemini). */
export async function visaoNvidia(
  mime: string,
  base64: string,
  prompt: string,
  o: OpcoesNv,
): Promise<string | null> {
  if (!mime.startsWith("image/")) return null;
  return completarNvidia(
    [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ],
    { temperatura: 0.1, maxTokens: 4096, ...o, thinking: false },
  );
}

/**
 * Mensagem amigável a partir das tentativas DESTA chamada (não de um estado
 * global). Nunca expõe chave nem detalhes internos.
 */
export function motivoFalhaIa(registros: { status: number | null; erro: string | null }[] | undefined): string {
  const lista = registros ?? [];
  const ultimo = lista.at(-1);
  if (!lista.length) return "A BION IA não está configurada no momento.";
  if (lista.some((r) => r.erro === "timeout") && (!ultimo?.status || ultimo.erro === "timeout"))
    return "O modelo demorou demais para responder.";
  if (ultimo?.status === 429) return "A cota da IA esgotou neste minuto.";
  if (ultimo?.status === 401 || ultimo?.status === 403) return "A chave da IA foi recusada.";
  if (ultimo?.status && ultimo.status >= 400) return `A IA devolveu HTTP ${ultimo.status}.`;
  return "A IA não devolveu texto utilizável.";
}


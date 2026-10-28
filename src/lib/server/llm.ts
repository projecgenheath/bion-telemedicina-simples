import { limparArtefatos, repararRepeticoes } from "@/lib/server/llm-sanitize";
import { registrarTurnoLlm } from "@/lib/server/llm-monitor";
import ZAI from "z-ai-web-dev-sdk";
import {
  chatNvidiaComRaciocinio,
  nvidiaConfig,
  nvidiaConfigurado,
  nvidiaLiberado,
  nvidiaVisaoHabilitada,
  streamNvidia,
  visaoNvidia,
  type RegistroNvidia,
  modeloReservaGemini,
  reservaGeminiAtiva,
} from "@/lib/server/llm-nvidia";

/**
 * Camada única de acesso à IA GENERATIVA para as rotas da BION IA.
 *
 * DECISÃO DO DONO (2026-09-24): o CHAT da BION IA usa SOMENTE o
 * GEMMA 4 26B A4B (MoE ~26B totais / ~4B ativos) — sem Gemini flash na
 * cadeia. Para viabilizar o modelo único:
 *  • o despejo de raciocínio (eco) não é mais descartado: o SANITIZADOR
 *    (extrairRespostaFinal) recupera a resposta final embutida no despejo;
 *  • prompt do sistema curto e direto + temperatura 0.4 (menos divagação,
 *    menos despejo, respostas mais rápidas);
 *  • o disjuntor de eco só pula o Gemma quando HÁ reserva na cadeia
 *    (BION_LLM_GEMINI_RESERVA) — com modelo único, pular = cair no motor
 *    local, que é sempre pior do que tentar o Gemma de novo.
 *
 * Cadeia de disponibilidade do CHAT (na ordem):
 *  1. GOOGLE GEMINI API — modelo gemma-4-26b-a4b-it (chave via env
 *     BION_LLM_GEMINI_API_KEY; dados completos, sem anonimização);
 *  2. Credenciais próprias genéricas (env BION_LLM_BASE_URL + BION_LLM_API_KEY);
 *  3. SDK do sandbox (só existe dentro da rede do sandbox).
 *  (O antigo canal público sem chave foi REMOVIDO em 2026-10 — LGPD: dados de
 *  saúde não vão para provedor público sem contrato de operador.)
 *  Nenhum canal respondendo → motores locais determinísticos por rota.
 *
 * A LEITURA DE LAUDOS (visão, fotos/PDFs) segue nos modelos Gemini flash
 * (MODELOS_VISAO): extração estruturada de documentos não é o chat do
 * paciente e não pode herdar o despejo de raciocínio do Gemma.
 *
 * `chatCompleto()` devolve string | null e `chatComFonte()` também informa
 * a fonte ("gemini" | "env" | "sdk") e o modelo exato que
 * respondeu. As rotas usam null como sinal para acionar os motores locais
 * determinísticos — a BION IA nunca fica muda.
 */

export type Msg = { role: "user" | "assistant"; content: string };

export type AnonNomes = { nome: string; substituto: string }[];

export type FonteLlm = "nvidia" | "gemini" | "env" | "sdk";

type ClienteEnv = { tipo: "env"; baseUrl: string; apiKey: string; model?: string };
type ClienteSdk = { tipo: "sdk"; zai: Awaited<ReturnType<typeof ZAI.create>> };
type Cliente = ClienteEnv | ClienteSdk | { tipo: "gemini" };

type Resultado = {
  texto: string | null;
  fonte: FonteLlm | null;
  modelo?: string | null;
  /** id desta chamada (auditoria no monitor LLM). */
  requestId?: string;
  /** tentativas DESTA chamada (sem estado global entre requisições). */
  registros?: RegistroGemini[];
  /** Raciocínio do modelo (canal separado; nunca vai a monitor/log). */
  raciocinio?: string;
};

const SONDA_TIMEOUT_MS = 4_000;
const COOLDOWN_FALHA_MS = 12_000;

/* --------------------------- GOOGLE GEMINI --------------------------- */

/**
 * Canal Gemini — API própria do projeto. A chave NUNCA vai no código
 * (repositório público + push protection do GitHub): ela é lida da
 * variável de ambiente BION_LLM_GEMINI_API_KEY, configurada na Vercel
 * (Settings → Environment Variables) com override local via .env.
 */
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Histórico do primário: o dono pediu GEMMA 4 (31B, depois 26B A4B — MoE
 * ~26B totais / ~4B ativos, confirmado na ListModels desta chave em 2026-09).
 * Houve um período com o Gemini flash como primário (o Gemma despejava
 * raciocínio e a quarentena descartava a resposta inteira, custando ~15s por
 * instância fria). Em 2026-09-24 o dono CONFIRMOU o Gemma 26B A4B como
 * modelo ÚNICO do chat; o despejo passou a ser tratado pelo sanitizador
 * (extrairRespostaFinal) e a quarentena só rejeita despejo insanitizável.
 */
// Primário do CHAT: gemma-4-26b-a4b-it — decisão explícita do dono
// (2026-09-24): "quero que use somente ele". O despejo de raciocínio do
// Gemma hospedado é tratado pelo sanitizador (extrairRespostaFinal) em vez
// de descartar a resposta inteira; o modelo flash saiu da cadeia do chat.
const GEMINI_MODEL_PADRAO = "gemma-4-26b-a4b-it";

/**
 * Cadeia da VISÃO (leitura de laudos em foto/PDF) — mantém os Gemini flash:
 * extração estruturada de documentos exige resposta limpa e rápida; o Gemma
 * despeja raciocínio no texto e destruiria a extração.
 */
const MODELOS_VISAO = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-flash-lite-latest"];

let _sdk: { cliente: ClienteSdk | null; verificado: boolean } = { cliente: null, verificado: false };
let _geminiFalhaEm = 0;

/**
 * DISJUNTOR DE ECO (família Gemma): o despejo de raciocínio é um comportamento
 * PERSISTENTE do modelo hospedado (medido em produção em dias seguidos), não
 * um erro transitório — cada tentativa custa ~9s de geração que a quarantena
 * descarta, e o paciente esperaria esse tempo extra em TODA mensagem. Depois
 * de um despejo confirmado, os modelos Gemma saem da cadeia por um ciclo;
 * a primeira tentativa seguinte reavalia e, se a Google tiver corrigido, o
 * Gemma volta a servir sozinho (sem mudança de código).
 */
const GEMMA_ECO_LIMITE = 1;
const GEMMA_ECO_COOLDOWN_MS = 2 * 60_000;
let _gemmaEcoSeguidos = 0;
let _gemmaPuladoAte = 0;


const geminiHabilitado = () => process.env.BION_LLM_GEMINI !== "0";
const geminiEmCooldown = () => Date.now() - _geminiFalhaEm < COOLDOWN_FALHA_MS;

function geminiConfig() {
  const apiKey = (process.env.BION_LLM_GEMINI_API_KEY || "").trim();
  // Override via env BION_LLM_GEMINI_MODEL: se houver um valor antigo na
  // Vercel (ex.: gemini-3.6-flash), ele VENCE o padrão do código — o painel
  // de diagnóstico (/api/bion-ia/diagnostico GET) mostra o modelo efetivo.
  // BION_LLM_RESERVA_GEMINI_MODEL (opcional) escolhe o modelo da reserva.
  const model = (modeloReservaGemini() || process.env.BION_LLM_GEMINI_MODEL || GEMINI_MODEL_PADRAO).trim();
  return { apiKey, model };
}

/**
 * Reserva de MODELOS dentro do canal Gemini: o alias "latest" satura em picos
 * de demanda (503 "high demand") e o free-tier sofre 429 de cota por modelo.
 * Se o modelo configurado não responder, tentamos os reservas na sequência —
 * 503/429 falham em ~250ms, então o custo é mínimo; o primeiro que responder
 * vence. Override via env BION_LLM_GEMINI_RESERVA="modelo-a,modelo-b".
 */
// Reserva do CHAT: VAZIA por decisão do dono ("use somente ele") — o chat
// roda só no gemma-4-26b-a4b-it. Se um dia o Gemma ficar indisponível
// (cota/saturação), a resposta cai para o motor local da rota. Para voltar a
// ter reservas sem mexer no código: BION_LLM_GEMINI_RESERVA="modelo-a,modelo-b".
const MODELOS_RESERVA_PADRAO: string[] = [];

function modelosReserva(): string[] {
  const extra = (process.env.BION_LLM_GEMINI_RESERVA || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return extra.length ? extra : MODELOS_RESERVA_PADRAO;
}

/** Cadeia completa: modelo configurado primeiro, depois os reservas (sem duplicatas). */
function cadeiaModelos(): string[] {
  const { model } = geminiConfig();
  return [model, ...modelosReserva().filter((m) => m !== model)];
}

function escapeRegExp(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove os nomes informados (paciente, médicos…) das mensagens. */
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

function ehTimeout(e: unknown): boolean {
  const nome = (e as { name?: string })?.name;
  return nome === "TimeoutError" || nome === "AbortError" || (e instanceof Error && e.message === "timeout");
}

/** Id curto por chamada — correlaciona servidor, cliente e monitor (sem PII). */
export function novoRequestId(): string {
  return `ia_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

type GeminiParte = { text?: string } | { inline_data: { mime_type: string; data: string } };

type GeminiCorpo = {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: GeminiParte[] }[];
  generationConfig?: Record<string, unknown>;
};

type GeminiResposta = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

/**
 * Extrai texto ÚTIL da resposta Gemini/Gemma.
 * Gemma 4 devolve partes com thought:true (raciocínio interno) — se juntarmos
 * essas partes, o sanitizador vê só eco em inglês e a BION IA "não funciona".
 * Preferimos partes NÃO-thought; se só houver thought, tentamos a última
 * sentença em português embutida no raciocínio.
 */
function falaEmPortugues(texto: string): string {
  const limpo = texto.replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
  const frases = limpo.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 8);
  const pt = frases.filter((s) =>
    /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|\b(você|seu|sua|olá|oi|boa|noite|dia|tarde|posso|vamos|consulta|médico|triagem)\b/i.test(s)
    && !/constraint|user says|the system|option \d/i.test(s),
  );
  if (pt.length) return pt.slice(-2).join(" ").trim();
  return "";
}

function textoGemini(bruto: GeminiResposta | null): string {
  const partes = bruto?.candidates?.[0]?.content?.parts ?? [];
  const uteis = partes.filter((p) => !p.thought && (p.text ?? "").trim());
  if (uteis.length) {
    const textos = uteis.map((p) => (p.text ?? "").trim()).filter(Boolean);
    const visivel = (textos[textos.length - 1] ?? "").trim();
    if (visivel.length >= 2) return visivel;
  }
  const pensamento = partes.map((p) => p.text ?? "").join("\n");
  const aspas = [...pensamento.matchAll(/"([^"]{8,400})"/g)].map((m) => m[1]);
  const candidatos = aspas.filter((s) => /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|você|olá|oi|boa /i.test(s));
  if (candidatos.length) return candidatos[candidatos.length - 1].trim();
  return falaEmPortugues(pensamento);
}

/* ---- telemetria de tentativas (mesma requisição; usada pelo diagnóstico) ---- */

export type RegistroGemini = {
  rotulo: string;
  status: number | null;
  finish: string | null;
  block: string | null;
  ms: number;
  textoLen: number;
  erro: string | null;
};

// Cada chamada carrega o PRÓPRIO array de registros (antes era um array
// global do módulo: requisições simultâneas na mesma instância liam o status
// uma da outra e o paciente recebia a mensagem de erro errada).

/** POST genérico ao generateContent; repetição sem thinkingConfig em 400. */
async function geminiPost(
  model: string,
  apiKey: string,
  corpo: GeminiCorpo,
  prazo: number,
  rotulo = "gemini",
  registros: RegistroGemini[] = [],
): Promise<string | null> {
  const url = `${GEMINI_BASE}/${model}:generateContent`;
  const chamar = async (c: GeminiCorpo, rotuloTurno: string): Promise<GeminiResposta | null> => {
    const inicio = Date.now();
    try {
      const bruto = (await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
          body: JSON.stringify(c),
          // timeout REAL: aborta o fetch (antes o Promise.race deixava a
          // requisição viva consumindo cota depois do "timeout").
          signal: AbortSignal.timeout(Math.max(restante(prazo), 1)),
        }).then(async (r) => {
          const j = (await r.json().catch(() => null)) as (GeminiResposta & { error?: { message?: string } }) | null;
          registros.push({
            rotulo: rotuloTurno,
            status: r.status,
            finish: j?.candidates?.[0]?.finishReason ?? null,
            block: j?.promptFeedback?.blockReason ?? null,
            ms: Date.now() - inicio,
            textoLen: r.ok ? textoGemini(j).length : 0,
            erro: r.ok ? null : limpar(j?.error?.message ?? `HTTP ${r.status}`, apiKey),
          });
          if (!r.ok) throw new Error(`gemini HTTP ${r.status}`);
          return j as GeminiResposta;
        })) as GeminiResposta | null;
      return bruto;
    } catch (e) {
      // registro ausente = falha antes da resposta HTTP (timeout / rede)
      const registrado = registros.some((rg) => rg.rotulo === rotuloTurno);
      if (!registrado) {
        registros.push({
          rotulo: rotuloTurno,
          status: null,
          finish: null,
          block: null,
          ms: Date.now() - inicio,
          textoLen: 0,
          erro: ehTimeout(e) ? "timeout" : limpar(e instanceof Error ? e.message : String(e), apiKey),
        });
      }
      return null;
    }
  };

  if (restante(prazo) <= 0) return null;
  let bruto = await chamar(corpo, rotulo);
  if (!bruto && corpo.generationConfig?.thinkingConfig) {
    const sem = { ...corpo, generationConfig: { ...corpo.generationConfig } };
    delete sem.generationConfig.thinkingConfig;
    // Modelos "thinking" gastam do teto com raciocínio interno: o retry sem
    // thinkingConfig precisa de fôlego extra ou volta vazio (MAX_TOKENS).
    const teto = sem.generationConfig.maxOutputTokens;
    sem.generationConfig.maxOutputTokens = typeof teto === "number" ? Math.max(teto, 8192) : 8192;
    bruto = await chamar(sem, `${rotulo}-sem-thinking`);
  }
  return textoGemini(bruto) || null;
}

/* ----------------------------- canal gemini ----------------------------- */

/**
 * Um turno de TEXTO no Gemini/Gemma (mensagens[0] "assistant" vira
 * systemInstruction). Devolve texto + o modelo que de fato respondeu (a UI
 * exibe com transparência).
 */
async function chamarGemini(
  mensagens: Msg[],
  prazo: number,
  modeloOverride?: string,
  opcoes?: { ignorarDisjuntor?: boolean; bruto?: boolean },
  registros: RegistroGemini[] = [],
): Promise<{ texto: string | null; modelo: string | null }> {
  const { apiKey } = geminiConfig();
  const sys = mensagens[0]?.role === "assistant" ? mensagens[0].content : null;
  const resto = (sys ? mensagens.slice(1) : mensagens).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));

  // O histórico do cliente pode trazer turnos CONSECUTIVOS do mesmo lado
  // (ex.: duas falas da IA em sequência no fluxo de agendamento). O Gemini
  // rejeita contents sem alternância user/model (HTTP 400) e exige que
  // comecem em "user": mesclamos turnos vizinhos do mesmo papel e inserimos
  // um turno inicial neutro quando o histórico abre com "model".
  const conteudos: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const turno of resto) {
    const anterior = conteudos[conteudos.length - 1];
    if (anterior && anterior.role === turno.role) {
      anterior.parts.push({ text: `\n\n${turno.parts[0].text}` });
    } else {
      conteudos.push({ ...turno, parts: [...turno.parts] });
    }
  }
  if (conteudos.length && conteudos[0].role === "model") {
    conteudos.unshift({ role: "user", parts: [{ text: "(contexto da conversa abaixo)" }] });
  }
  if (!conteudos.length) return { texto: null, modelo: null };

  // GEMMA: a família Gemma na API do Gemini NÃO aceita systemInstruction nem
  // thinkingConfig — o prompt de sistema é fundido no primeiro turno "user",
  // com ordem explícita de resposta direta (o Gemma 4 tende a ecoar o
  // raciocínio — "The user wants..." — quando a instrução não é enfática).
  // O EXEMPLO de 1 turno âncora o formato (dumps medidos em produção mesmo
  // com a diretiva verbal) e o teto de linhas acelera a resposta.
  const DIRETIVA_GEMMA =
    "\nResponda já na primeira linha, PT-BR, no máximo 4 frases. Sem raciocínio em inglês.\n";

/**
 * PREFILL (velocidade): a chamada à API termina com um turno "model" já
 * iniciando a fala ("Claro!") e o modelo apenas CONTINUA a frase — despejo
 * antes do início da resposta fica impossível. Se o prefill for rejeitado
 * pela API, a resposta vem inteira do modelo e o prefixo não é re-aplicado.
 */
const PREFILL_GEMMA = "Claro!";

/**
 * STOP SEQUENCES do prefill (velocidade, medido em produção 2026-09-25): com
 * o prefill, a resposta é o INÍCIO da continuação — mas o Gemma segue gerando
 * DEPOIS dela (rambla, réplicas, despejo de raciocínio, JSON de ação), e esse
 * excesso é puro tempo de geração (3.681 chars gerados para 477 de resposta
 * = 20,7s). Cortar a continuação nesses marcadores mata o excesso na fonte.
 * Só valem em INÍCIO de linha/parágrafo — prosa legítima (pt-BR, bullets "•",
 * negrito inline) nunca contém esses padrões; e como a resposta já veio
 * antes, o corte da cauda não perde conteúdo. Aplicado SOMENTE na chamada
 * com prefill: no retry sem prefill o texto inteiro é necessário para o
 * sanitizador achar a resposta embutida no despejo.
 */
const PREFILL_STOPS = ["\n\n*", "\n*", "\n\n```", "\n\nUser", "\n\nDraft"];

/** Remonta a fala da BION IA a partir da continuação do modelo. */
function comporFala(continuacao: string, comPrefill: boolean): string {
  const c = continuacao.trim();
  if (!comPrefill || !c) return c;
  if (/^(claro|ol[áa]|oi|sim)\b/i.test(c)) return c;
  const maiuscula = c.charAt(0).toUpperCase() + c.slice(1);
  return `${PREFILL_GEMMA} ${maiuscula}`;
}

  const conteudosGemma = sys
    ? conteudos.map((t, i) =>
        i === 0 ? { role: t.role, parts: [{ text: `${sys}${DIRETIVA_GEMMA}\n\n---\n\n${t.parts[0].text}` }] } : t,
      )
    : conteudos.map((t, i) =>
        i === 0 ? { role: t.role, parts: [{ text: `${DIRETIVA_GEMMA.trim()}\n\n${t.parts[0].text}` }] } : t,
      );

  // Cadeia de modelos: o configurado (ou o modelo do diagnóstico) primeiro;
  // 503 "high demand"/429 de cota falham em ~250ms, então percorrer os reservas
  // é quase grátis. O primeiro modelo que devolver texto vence.
  const cadeia = modeloOverride
    ? [modeloOverride, ...cadeiaModelos().filter((m) => m !== modeloOverride)]
    : cadeiaModelos();
  const ignorarDisjuntor = opcoes?.ignorarDisjuntor === true;
  // Modo diagnóstico: devolve o BRUTO quando o despejo é insanitizável, para
  // o painel admin mostrar EXATAMENTE o que o modelo produziu (calibragem
  // do sanitizador). Nunca usado no caminho do paciente.
  const modoBruto = opcoes?.bruto === true;
  for (const modelo of cadeia) {
    if (restante(prazo) <= 0) break;
    const ehGemma = /gemma/i.test(modelo);
    // Disjuntor de eco: só pula o Gemma quando HÁ outro modelo na cadeia —
    // com modelo único (padrão atual), pular = cair no motor local, que é
    // sempre pior do que tentar o Gemma (o sanitizador recupera o despejo).
    if (ehGemma && !ignorarDisjuntor && Date.now() < _gemmaPuladoAte && cadeia.length > 1) continue;
    const conteudosDoModelo = ehGemma ? conteudosGemma : conteudos;

    const corpo: GeminiCorpo = ehGemma
      ? {
          // Gemma: a API devolve 400 em thinkingConfig ("Thinking budget is
          // not supported for this model" — medido em produção), então o corpo
          // vai DIRETO sem thinkingConfig (economiza um round-trip de 400 por
          // mensagem) e com teto 8192 (o Gemma 4 consome tokens com
          // raciocínio interno). Temperatura 0.4: menos divagação → menos
          // despejo e resposta mais curta (e mais rápida). O eco que escapar
          // passa pelo sanitizador antes de descartar.
          contents: conteudosDoModelo,
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }
      : {
          ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
          contents: conteudosDoModelo,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
          },
        };

    // T1 (thinkingBudget 0) fica limitada a ~55% do prazo restante; Gemma
    // (sem systemInstruction) recebe ~85% — com despejo, o 26B A4B demora
    // 10-25s no free tier (o despejo É a latência).
    const subprazo = Date.now() + Math.max(Math.round(restante(prazo) * (ehGemma ? 0.85 : 0.55)), 6_000);

    if (!ehGemma) {
      const texto1 = await geminiPost(modelo, apiKey, corpo, Math.min(prazo, subprazo), modelo, registros);
      if (texto1 && !textoComEcoRaciocinio(texto1)) return { texto: texto1, modelo };
    } else {
      // Sem prefill: o "Claro!" + 2ª geração colava duas falas e atrasava.
      // Uma chamada, teto baixo, stop no início de rascunho.
      let texto1 = await geminiPost(
        modelo,
        apiKey,
        {
          contents: conteudosDoModelo,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        },
        Math.min(prazo, subprazo),
        modelo,
        registros,
      );
      const comPrefill = false;
      if (texto1) {
        texto1 = limparArtefatos(texto1) || null;
        if (texto1 && texto1.length < 8) texto1 = null;
      }
      if (texto1 && !textoComEcoRaciocinio(texto1)) {
        // Gemma limpo: desarma o disjuntor (a Google corrigiu o despejo).
        _gemmaEcoSeguidos = 0;
        _gemmaPuladoAte = 0;
        return { texto: repararRepeticoes(comporFala(texto1, comPrefill)), modelo };
      }
      if (texto1) {
        // Despejo de raciocínio confirmado → SANITIZA em vez de descartar:
        // a resposta final do Gemma vem embutida no despejo (medido em
        // produção: 2632 chars de despejo com a resposta correta dentro).
        const limpo = extrairRespostaFinal(texto1);
        if (limpo) {
          _gemmaEcoSeguidos = 0;
          _gemmaPuladoAte = 0;
          return { texto: repararRepeticoes(comporFala(limpo, comPrefill)), modelo };
        }
        // Despejo insanitizável → arma o disjuntor (só tem efeito quando
        // há reserva na cadeia; ver condição do continue acima).
        _gemmaEcoSeguidos += 1;
        if (_gemmaEcoSeguidos >= GEMMA_ECO_LIMITE) {
          _gemmaPuladoAte = Date.now() + GEMMA_ECO_COOLDOWN_MS;
          _gemmaEcoSeguidos = 0;
        }
        if (modoBruto) return { texto: texto1, modelo }; // diagnóstico: ver o despejo cru
      }
      // Gemma: o T1 JÁ é o caminho sem thinking (o 400 do thinkingConfig é
      // evitado por construção) e um T2 idêntico só repetiria o mesmo despejo —
      // próximo modelo da cadeia.
      continue;
    }

    const sem: GeminiCorpo = {
      ...(sys && !ehGemma ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
      contents: conteudosDoModelo,
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    };
    const texto2 = await geminiPost(modelo, apiKey, sem, prazo, `${modelo}-sem-thinking`, registros);
    if (texto2 && !textoComEcoRaciocinio(texto2)) return { texto: texto2, modelo };
  }
  return { texto: null, modelo: null };
}

/**
 * VISÃO (foto ou PDF de laudo) no Gemini — devolve o texto extraído ou null.
 * Usa MODELOS_VISAO (família flash) e NÃO a cadeia do chat: extração de
 * documentos exige resposta limpa e estruturada, e o Gemma despeja
 * raciocínio no texto.
 */
export async function visaoGemini(
  mime: string,
  base64: string,
  prompt: string,
  timeoutMs: number,
): Promise<string | null> {
  const prazo = Date.now() + Math.max(timeoutMs, 5_000);
  // NVIDIA primeiro para IMAGENS (PDF segue no Gemini). Atrás da flag
  // BION_LLM_NVIDIA_VISAO=1 até o consentimento citar a NVIDIA.
  if (mime.startsWith("image/") && nvidiaVisaoHabilitada()) {
    const t = await visaoNvidia(mime, base64, prompt, { timeoutMs: Math.round(restante(prazo) * 0.75) }); // visão medida ~32 s
    if (t) return t;
  }
  // Reserva desligada: laudo NÃO vai ao Gemini (só NVIDIA, se liberado acima).
  if (!reservaGeminiAtiva() || !geminiHabilitado()) return null;
  const { apiKey } = geminiConfig();
  for (const modelo of MODELOS_VISAO) {
    if (restante(prazo) <= 0) break;
    // Gemma rejeita thinkingConfig (400 medido em produção) — vai direto sem
    // o flag; os Gemini mantêm thinkingBudget 0 (resposta limpa de uma vez).
    const ehGemma = /gemma/i.test(modelo);
    if (ehGemma && Date.now() < _gemmaPuladoAte) continue; // disjuntor de eco
    const texto = await geminiPost(
      modelo,
      apiKey,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          ...(ehGemma ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
        },
      },
      prazo,
      modelo,
      [],
    );
    if (texto) return texto;
  }
  return null;
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
  if (restante(prazo) <= 0) return null;
  const bruto = (await fetch(`${c.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(Math.max(restante(prazo), 1)),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
      return r.json();
    })
    .catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  return bruto?.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * ECO DE RACIOCÍNIO (família Gemma 4): o modelo despeja a análise inteira no
 * texto ("* User's input...", "*   User prompt: ...", rascunhos "*Draft 1:",
 * "*Refining...", checklists "Portuguese? Yes") com a resposta final embutida
 * no meio — a API NÃO permite desligar isso (thinkingBudget devolve 400 "not
 * supported for this model") e a diretiva de prompt não contém o eco. O 26B
 * A4B usa variantes novas do despejo (User prompt / Draft / Refining / Persona
 * constraints) que ESCAPAVAM do regex original e chegaram ao paciente.
 * Isso NUNCA pode chegar ao paciente: tratamos como falha do modelo e a
 * cadeia cai para o próximo. Quando a Google
 * servir o Gemma 4 sem o despejo, ele volta a passar automaticamente.
 */
const RE_ECO_RACIOCINIO =
  /(\*\s*User'?s?\s*Input|User'?s?\s*input:|\*\s*Input:|User\s+prompt\b|Draft\s*\d|Refining\b|Persona\s+constraints?|meta-commentary|Constraint Check|\*\s*Wait\b|\*\s*Acknowledge|\*\s*Constraint|Let me analyze|Let'?s\s+(?:refine|ensure|draft|write|check|make|create|start|craft|finalize|adjust|polish)\b|Self[-\s]?correction|\(this\s+is\s+\d+\s+lines?\)|The\s+user\s+(wants?|is|asked?|asks?|said\b|needs?|provided?))/i;

/**
 * Linha de SCAFFOLDING do despejo (rotulada em inglês, com bullets "*"/"-",
 * às vezes aninhados como "*   *Draft 1:*" — o prefixo [\*\->\s]* come o run
 * inteiro de marcadores). Despejo REAL de 2026-09-24 (capturado via
 * diagnóstico admin): "User persona:", "Constraint 1:", "Input:", "The user
 * wants...", "*Draft 1:*", "Check constraints:", "Directly addressing...",
 * "Max 5 lines? Yes", "Language: PT-BR", "Lines: 3." — resposta final no fim.
 */
const RE_LINHA_DESPEJO =
  /^\s*[\*\->\s]*(?:\*\*)?\s*(?:user'?s?\s*(?:input|prompt|request|persona)|user\s+persona|input\s*:|user\s+prompt|prompt\s*:|prompt\s+analysis|draft\s*\d|draft\s+(?:the|a|an|my|final|short|new)\b|refining\b|refined\b|persona\s+constraint|constraint\s+check|constraint\s*\d?\s*:|confidence\s+score|final\s+(?:answer|response|draft|version|polish|review|pass|output|check|touch|text)|refined\s+(?:response|answer|version)|answer\s*:|response\s*:|best\s+response|check\s+constraints?|directly\s+addressing|first\s+line\s+is|no\s+meta-talk|no\s+repetition|max\s+\d+\s+lines|language\s*:|tone\s*:|style\s*:|lines\s*:\s*\d|word\s+count|wait\b|acknowledge\b|let\s+me\b|let'?s\s+(?:refine|ensure|draft|write|check|make|create|start|craft|finalize|adjust|polish)|self[-\s]?correction|\(this\s+is\s+\d+\s+lines?\)|the\s+user\s+said|i\s+(?:will|'ll|should|need|can|must)\b|the\s+user\b|analy(?:ze|zing|sis)\b|checklist|step\s*\d|thought\b|thinking\b|note\s*:|goal\s*:|context\s*:|key\s+points?|plan\s*:|version\s*\d|option\s*\d|revision\b|evaluat|reviewing|first\s+draft|next\s+step|paraphras|clarif|format\s*:|requirements?\s*:|[^?\n]{2,60}\?\s*yes\b)/i;

/**
 * Marcadores de RESPOSTA FINAL dentro do despejo — o corte é feito no ÚLTIMO
 * deles (o Gemma refina em rascunhos: Draft 1 → Refining → Final Answer).
 */
const RE_MARCADOR_FINAL =
  /(?:final\s+(?:answer|response|draft|version)|refined\s+(?:response|answer|version)|resposta\s+final|vers[\u00e3o]\s+final|best\s+response)\s*[:\-]?\s*/gi;

/**
 * Detecta a MELHOR colagem em t: (1) exata X+X — menor ponto de repetição a
 * partir da metade; (2) quase idêntica X+Y — compara metades em fronteiras de
 * frase (". ", ".Maiúscula" e ".\"Maiúscula", o formato real do Gemma:
 * resposta citada + resposta solta grudadas). Devolve o corte (fim da 1ª
 * cópia, inclusivo) e a similaridade Jaccard das partes.
 */
function melhorCola(t: string): { corte: number; sim: number } | null {
  if (t.length < 40) return null;
  for (let i = Math.ceil(t.length / 2); i <= t.length - 20; i++) {
    if (t.startsWith(t.slice(i))) return { corte: i, sim: 1 };
  }
  if (t.length < 200) return null;
  let melhor: { corte: number; sim: number } | null = null;
  const de = Math.floor(t.length * 0.35);
  const ate = Math.floor(t.length * 0.85);
  for (let s = de; s <= ate; s++) {
    // fronteira de frase: "." "!" ou "?" (real 2026-09-24: "…disposição!Sim, …")
    const pont = t[s - 1];
    if (pont !== "." && pont !== "!" && pont !== "?") continue;
    // depois: pula espaços/aspas de fechamento; precisa vir maiúscula
    let j = s;
    while (j < t.length && (t[j] === " " || t[j] === '"' || t[j] === "\u201d" || t[j] === "\u201c")) j++;
    if (!/[A-ZÀ-Ú]/.test(t[j] ?? "")) continue;
    const a = t.slice(0, s); // inclui a pontuação final
    const b = t.slice(j);
    if (a.length < 80 || b.length < 80) continue;
    // Corte seguro: a 2ª metade precisa ser quase CONTIDA na 1ª (con ≥ 0.75)
    // E haver sobreposição real (jac ≥ 0.4) — intro+bullets legítimos têm
    // continência baixa e ficam protegidos.
    const { jac, con } = statsPalavras(a, b);
    if (con >= 0.75 && jac >= 0.4 && (!melhor || jac > melhor.sim)) {
      melhor = { corte: s, sim: jac };
    }
  }
  return melhor;
}

/** A um texto contém resposta colada/duplicada nela mesma? (sinal de despejo) */
function temColagem(t: string): boolean {
  return melhorCola(t.trim()) !== null;
}

/**
 * Deduplica uma linha/bloco: se o texto contém resposta colada nela mesma
 * (X+X ou X+Y quase idênticas), mantém só a primeira cópia.
 */
function desduplicar(v: string): string {
  const t = v
    .trim()
    .replace(/^["\u201c]+/, "")
    .replace(/["\u201d]+$/, "")
    .trim();
  const melhor = melhorCola(t);
  if (melhor) {
    return t
      .slice(0, melhor.corte)
      .replace(/["\u201d]+$/, "")
      .trim();
  }
  return t;
}

/** Métricas de sobreposição de palavras de conteúdo (≥ 4 letras, sem acento). */
function statsPalavras(a: string, b: string): { jac: number; con: number } {
  const palavras = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const sa = palavras(a);
  const sb = palavras(b);
  if (!sa.size || !sb.size) return { jac: 0, con: 0 };
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return {
    jac: inter / (sa.size + sb.size - inter),
    con: inter / Math.min(sa.size, sb.size),
  };
}

/** @deprecated importar de llm-sanitize — reexport para compat */
export { limparArtefatos, repararRepeticoes } from "@/lib/server/llm-sanitize";



/**
 * SANITIZADOR DE ECO (família Gemma): o modelo despeja o raciocínio e embute
 * a resposta final no meio/fim. Em vez de descartar a resposta inteira
 * (quarantena antiga — desperdiçava ~13s de geração por mensagem), extrai a
 * parte que é de fato a fala da BION IA. Devolve null quando o texto não
 * pode ser limpo com segurança (a cadeia então segue adiante).
 */
export function extrairRespostaFinal(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const bruto = texto.trim();
  if (!bruto) return null;
  // Suspeita de despejo: marcadores clássicos de eco OU colagem da resposta
  // nela mesma (X+Y — real 2026-09-24: "Final Polish:" + resposta citada e
  // solta idênticas grudadas, sem nenhum marcador inglês). Resposta legítima
  // da BION IA nunca se repete colada nela mesma.
  if (!textoComEcoRaciocinio(bruto) && !temColagem(bruto)) return bruto;

  // 0) Padrão REAL do despejo (2026-09-24): a resposta final é o BLOCO de
  //    linhas no FIM (às vezes com a cauda duplicada colada). Caminha de
  //    trás para frente enquanto as linhas forem conteúdo de resposta e
  //    para no primeiro scaffolding/eco.
  const linhas = bruto.split("\n").map((l) => l.trim()).filter(Boolean);
  const bloco: string[] = [];
  for (let i = linhas.length - 1; i >= 0 && bloco.length < 12; i--) {
    const nua = linhas[i]
      .replace(/^[\*\->\s]+/, "")
      .replace(/^["\u201c]|["\u201d]$/g, "")
      .trim();
    if (!nua) continue;
    if (RE_LINHA_DESPEJO.test(nua) || textoComEcoRaciocinio(nua)) break;
    // Deduplica a linha individual (o Gemma cola a resposta repetida: X+X).
    bloco.unshift(desduplicar(nua));
  }
  if (bloco.length) {
    // Colapsa linhas repetidas (a mesma resposta pode vir em duas formas) e
    // deduplica o bloco inteiro de novo — "A\nA" → "A".
    const unicas = bloco.filter((l, i) => i === 0 || l !== bloco[i - 1]);
    const candidato = desduplicar(unicas.join("\n"));
    if (candidato.length >= 20 && !textoComEcoRaciocinio(candidato)) return candidato;
  }

  // 1) Corte por marcador explícito de resposta final (última ocorrência).
  const cortes = [...bruto.matchAll(RE_MARCADOR_FINAL)];
  if (cortes.length) {
    const ultimo = cortes[cortes.length - 1];
    const pos = (ultimo.index ?? 0) + ultimo[0].length;
    const candidato = desduplicar(bruto.slice(pos).trim());
    if (candidato.length >= 20 && !textoComEcoRaciocinio(candidato)) return candidato;
  }

  // 2) Remoção linha a linha do scaffolding do despejo.
  const restantes = linhas.filter((l) => !RE_LINHA_DESPEJO.test(l));
  const candidato2 = desduplicar(restantes.join("\n").replace(/\n{3,}/g, "\n\n").trim());
  if (candidato2.length >= 20 && !textoComEcoRaciocinio(candidato2)) return candidato2;

  return null;
}

/**
 * Detector ESTRUTURAL: a 1ª linha do despejo é um marcador "*" rotulando o
 * prompt citado entre aspas ("*   User prompt: \"...\""). Respostas legítimas
 * da BION IA usam "•" (definido nas instruções) e não abrem com rótulo em
 * inglês citando a fala do usuário.
 */
const RE_BULLET_PROMPT_CITADO = /^\*\s+[^:\n]{2,80}:\s*["“']/;

function textoComEcoRaciocinio(texto: string | null | undefined): boolean {
  if (!texto) return false;
  if (RE_ECO_RACIOCINIO.test(texto)) return true;
  return RE_BULLET_PROMPT_CITADO.test(texto.trimStart());
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
 * Um turno de IA generativa. Tenta gemini → env → público (anonimizado) →
 * SDK e devolve texto + fonte; texto null quando nenhum canal respondeu.
 */
export type OpcoesChat = {
  /** Só Gemini/Gemma (+ env se houver). Não tenta público nem SDK (mais rápido). */
  somenteGemini?: boolean;
  /** Tentativas extras no canal Gemini se a primeira falhar (padrão 0). */
  retries?: number;
  /** Id da chamada para o monitor; gerado se ausente. */
  requestId?: string;
  /** Teto de tokens da resposta no NVIDIA (padrão 1024). */
  maxTokens?: number;
};

/** Fração do prazo que o NVIDIA pode usar antes de cair no Gemini. */
const FRACAO_NVIDIA = 0.6;

function deNvidia(r: RegistroNvidia): RegistroGemini {
  return { rotulo: r.rotulo, status: r.status, finish: null, block: null, ms: r.ms, textoLen: r.textoLen, erro: r.erro };
}

export async function chatComFonte(
  mensagens: Msg[],
  timeoutMs: number,
  anon?: AnonNomes,
  opcoes?: OpcoesChat,
): Promise<Resultado> {
  const inicio = Date.now();
  const requestId = opcoes?.requestId ?? novoRequestId();
  // Registros DESTA chamada (nunca compartilhados entre requisições).
  const registros: RegistroGemini[] = [];
  const devolver = (r: Resultado): Resultado => {
    const ultimo = registros.at(-1);
    registrarTurnoLlm({
      ts: Date.now(),
      ok: Boolean(r.texto),
      ms: Date.now() - inicio,
      fonte: r.fonte,
      modelo: r.modelo ?? null,
      textoLen: r.texto?.length ?? 0,
      http: ultimo?.status ?? null,
      finish: ultimo?.finish ?? null,
      erro: r.texto ? null : ultimo?.erro ?? "sem texto",
      requestId,
      origem: "servidor",
      fallback: tentouNvidia && r.fonte !== "nvidia" && r.fonte !== null,
    });
    return { ...r, requestId, registros };
  };
  const prazo = Date.now() + Math.max(timeoutMs, 5_000);
  const retries = Math.max(0, Math.min(3, opcoes?.retries ?? 0));
  const somente = opcoes?.somenteGemini === true;

  // 0) NVIDIA (primário). Sem NVIDIA_API_KEY → pulado em silêncio.
  const tentouNvidia = nvidiaConfigurado();
  if (tentouNvidia) {
    const regNv: RegistroNvidia[] = [];
    const { texto, raciocinio } = await chatNvidiaComRaciocinio(mensagens, {
      timeoutMs: Math.round(restante(prazo) * FRACAO_NVIDIA),
      registros: regNv,
      maxTokens: opcoes?.maxTokens,
    });
    registros.push(...regNv.map(deNvidia));
    if (texto) return devolver({ texto, fonte: "nvidia", modelo: nvidiaConfig().model, ...(raciocinio ? { raciocinio } : {}) });
  }

  // Reserva desligada (BION_LLM_RESERVA_GEMINI=0/false): NVIDIA → erro amigável.
  if (!reservaGeminiAtiva()) return devolver({ texto: null, fonte: null });

  // 1) Google Gemini — API própria (Gemma 4 26B no chat), reserva do NVIDIA
  if (geminiHabilitado() && geminiConfig().apiKey && restante(prazo) > 1_000) {
    _geminiFalhaEm = 0; // não bloquear saudação/turno seguinte por falha anterior nesta instância
    for (let tentativa = 0; tentativa <= retries; tentativa++) {
      const { texto, modelo } = await chamarGemini(mensagens, prazo, undefined, undefined, registros);
      if (texto) return devolver({ texto, fonte: "gemini", modelo });
    }
    _geminiFalhaEm = Date.now();
  }

  if (somente) {
    return devolver({ texto: null, fonte: null });
  }

  // 2) credenciais próprias genéricas
  const env = clienteEnv();
  if (env) {
    const texto = await chamarEnv(env, mensagens, prazo);
    if (texto) return devolver({ texto, fonte: "env" });
  }

  // 3) SDK sandbox só se sobrar tempo
  if (restante(prazo) > 5_000) {
    const sdk = await tentarSdk();
    if (sdk) {
      const texto = await chamarSdk(sdk, mensagens, prazo);
      if (texto) return devolver({ texto, fonte: "sdk" });
    }
  }

  return devolver({ texto: null, fonte: null });
}

export type EventoStreamIa =
  | { tipo: "delta"; texto: string }
  /** Raciocínio do modelo — canal próprio, nunca misturado ao `delta`. */
  | { tipo: "raciocinio"; texto: string }
  | { tipo: "fim"; fonte: FonteLlm; modelo: string | null; requestId: string }
  | { tipo: "erro"; registros: RegistroGemini[]; requestId: string };

/**
 * Turno em STREAM: NVIDIA em SSE. Texto final em `delta`; raciocínio em
 * eventos `raciocinio` separados (nunca no monitor/log: só tamanho e tempo). Se o NVIDIA falhar ANTES do 1º token (sem chave, erro, ou sem token
 * em `primeiroTokenMs`), cai no Gemini (não-stream) e emite o texto inteiro
 * num único delta. Falha no MEIO do stream encerra com o texto parcial.
 */
export async function* chatStreamComFonte(
  mensagens: Msg[],
  timeoutMs: number,
  opcoes: { requestId: string; primeiroTokenMs?: number },
): AsyncGenerator<EventoStreamIa> {
  const inicio = Date.now();
  const { requestId } = opcoes;
  const prazo = Date.now() + Math.max(timeoutMs, 5_000);
  const registros: RegistroGemini[] = [];
  const marcar = (ok: boolean, fonte: FonteLlm | null, modelo: string | null, len: number) => {
    const ultimo = registros.at(-1);
    registrarTurnoLlm({
      ts: Date.now(),
      ok,
      ms: Date.now() - inicio,
      fonte,
      modelo,
      textoLen: len,
      http: ultimo?.status ?? null,
      finish: ultimo?.finish ?? null,
      erro: ok ? null : ultimo?.erro ?? "sem texto",
      requestId,
      origem: "servidor",
      fallback: tentouNvidia && fonte !== "nvidia" && fonte !== null,
    });
  };

  const tentouNvidia = nvidiaConfigurado();
  if (tentouNvidia) {
    const regNv: RegistroNvidia[] = [];
    let len = 0;
    let registrado = false;
    const modelo = nvidiaConfig().model;
    try {
      for await (const pedaco of streamNvidia(mensagens, {
        timeoutMs: restante(prazo) - 1_000,
        primeiroTokenMs: opcoes.primeiroTokenMs ?? Math.round(restante(prazo) * 0.5),
        registros: regNv,
      })) {
        if (pedaco.canal === "raciocinio") {
          yield { tipo: "raciocinio", texto: pedaco.texto };
          continue;
        }
        len += pedaco.texto.length;
        yield { tipo: "delta", texto: pedaco.texto };
      }
      registros.push(...regNv.map(deNvidia));
      if (len > 0) {
        // Cortado no meio (erro depois do 1º token) não é turno ok.
        const cortado = regNv.some((r) => r.erro && r.erro !== "sem texto");
        if (cortado) registros.push({ ...deNvidia(regNv.at(-1)!), erro: "stream_interrompido" });
        marcar(!cortado, "nvidia", modelo, len);
        registrado = true;
        yield { tipo: "fim", fonte: "nvidia", modelo, requestId };
        return;
      }
    } finally {
      // Consumidor fechou o stream (cliente saiu / return()) no meio: registra.
      if (len > 0 && !registrado) {
        if (!registros.length) registros.push(...regNv.map(deNvidia));
        registros.push({ rotulo: "nvidia", status: null, finish: null, block: null, ms: Date.now() - inicio, textoLen: len, erro: "stream_interrompido" });
        marcar(false, "nvidia", modelo, len);
      }
    }
  }

  if (reservaGeminiAtiva() && geminiHabilitado() && geminiConfig().apiKey && restante(prazo) > 1_000) {
    const { texto, modelo } = await chamarGemini(mensagens, prazo, undefined, undefined, registros);
    if (texto) {
      marcar(true, "gemini", modelo, texto.length);
      yield { tipo: "delta", texto };
      yield { tipo: "fim", fonte: "gemini", modelo, requestId };
      return;
    }
  }
  marcar(false, null, null, 0);
  yield { tipo: "erro", registros, requestId };
}

export { motivoFalhaIa } from "@/lib/server/llm-nvidia";

/** Compatibilidade: só o texto (ou null). */
export async function chatCompleto(mensagens: Msg[], timeoutMs: number, anon?: AnonNomes): Promise<string | null> {
  return (await chatComFonte(mensagens, timeoutMs, anon)).texto;
}

/**
 * Cliente para chamadas de VISÃO (createVision) — Gemini (texto via
 * `visaoGemini`), env genérico ou SDK do sandbox.
 */
export async function obterLLM(): Promise<Cliente | null> {
  if (nvidiaVisaoHabilitada()) return { tipo: "gemini" }; // visaoGemini tenta o NVIDIA antes (só imagens)
  if (!reservaGeminiAtiva()) return null; // sem outro provedor além do NVIDIA
  if (geminiHabilitado() && geminiConfig().apiKey && !geminiEmCooldown()) return { tipo: "gemini" };
  const env = clienteEnv();
  if (env) return env;
  return tentarSdk();
}

/* ---------------------------- diagnóstico (admin) ---------------------------- */

export type EstadoCanais = {
  nvidia: { configurado: boolean; liberado: boolean; modelo: string; visao: boolean };
  gemini: { configurado: boolean; modelo: string; reserva: string[] };
  env: { configurado: boolean; modelo: string | null };
};

/** Estado de configuração dos canais — SOMENTE booleanos/modelos, nunca chaves. */
export function estadoCanais(): EstadoCanais {
  const gem = geminiConfig();
  const env = clienteEnv();
  return {
    nvidia: { configurado: nvidiaConfigurado(), liberado: nvidiaLiberado(), modelo: nvidiaConfig().model, visao: nvidiaVisaoHabilitada() },
    gemini: { configurado: geminiHabilitado() && !!gem.apiKey, modelo: gem.model, reserva: modelosReserva() },
    env: { configurado: !!env, modelo: process.env.BION_LLM_MODEL?.trim() || null },
  };
}

export type ProbeCanal = { canal: FonteLlm; ok: boolean; detalhe: string; ms: number };

/**
 * Reproduz uma chamada REAL ao canal Gemini com as mensagens informadas
 * (mesmo caminho de chamarGemini, incluindo normalização de alternância) e
 * devolve o texto + os registros de cada tentativa (status, finishReason,
 * blockReason, ms). Usado pelo diagnóstico admin para enxergar POR QUE o
 * Gemini falha em produção sem expor a chave.
 */
export async function diagnosticoGemini(mensagens: Msg[], timeoutMs = 25_000, modelo?: string) {
  const prazo = Date.now() + timeoutMs;
  // ignorarDisjuntor: o diagnóstico precisa enxergar o Gemma REAL (inclusive
  // o despejo) mesmo quando o chat está pulando os modelos Gemma.
  // bruto: quando o despejo é insanitizável, devolve o texto CRU para o painel
  // admin calibrar o sanitizador (nunca vai ao paciente).
  const registros: RegistroGemini[] = [];
  const r = await chamarGemini(mensagens, prazo, modelo, { ignorarDisjuntor: true, bruto: true }, registros);
  return { texto: r.texto, modelo: r.modelo, registros };
}

export type ModeloDisponivel = { id: string; nome: string };

/**
 * Lista os modelos que ESTA chave tem acesso (ListModels da API do Gemini),
 * filtrados para os que aceitam generateContent. Nunca expõe a chave. Usado
 * pelo diagnóstico admin para descobrir quais Gemma/Gemini estão liberados.
 */
export async function listarModelosGemini(timeoutMs = 15_000): Promise<ModeloDisponivel[] | { erro: string }> {
  const { apiKey } = geminiConfig();
  if (!apiKey) return { erro: "sem chave BION_LLM_GEMINI_API_KEY" };
  try {
    const r = await fetch(`${GEMINI_BASE}?pageSize=1000`, {
      headers: { "X-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const j = (await r.json().catch(() => null)) as
      | { models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[]; error?: { message?: string } }
      | null;
    if (!r.ok) return { erro: limpar(j?.error?.message || `HTTP ${r.status}`, apiKey) };
    return (j?.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({ id: (m.name || "").replace(/^models\//, ""), nome: m.displayName || "" }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    return { erro: limpar(e instanceof Error ? e.message : String(e), apiKey) };
  }
}

/** Remove a chave da mensagem (defesa em profundidade: provedores não devem
 * ecoá-la, mas o texto de erro nunca pode devolvê-la ao painel). */
function limpar(detalhe: string, ...secretos: string[]): string {
  let texto = detalhe;
  for (const s of secretos) {
    if (s && texto.includes(s)) texto = texto.split(s).join("***");
  }
  return texto.slice(0, 300);
}

/**
 * Sonda ao vivo dos canais (chamada pelo diagnóstico admin). Cada canal
 * recebe um pedido mínimo ("Responda apenas: ok"); o resultado diz se o
 * canal funciona DESTE runtime (chave válida + região suportada).
 */
export async function probeCanais(timeoutMs = 20_000): Promise<ProbeCanal[]> {
  const prazo = Date.now() + timeoutMs;
  const resultados: ProbeCanal[] = [];
  const segredoGemini = geminiConfig().apiKey;

  // 1) Gemini — duas variantes: como o chat manda (thinkingBudget 0) e sem
  //    thinkingConfig com teto alto (caminho do retry). finishReason na resposta
  //    distingue "pensou e não sobrou texto" (MAX_TOKENS) de bloqueio de safety.
  if (geminiHabilitado() && segredoGemini) {
    const { apiKey } = geminiConfig();
    const conteudos: GeminiCorpo["contents"] = [{ role: "user", parts: [{ text: "Responda apenas: ok" }] }];
    const variantes = [
      { rotulo: "thinkingBudget0", corpo: { contents: conteudos, generationConfig: { temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } } },
      { rotulo: "sem-thinking-teto8192", corpo: { contents: conteudos, generationConfig: { maxOutputTokens: 8192 } } },
    ];
    // Um resultado POR modelo da cadeia — mostra qual alias está vivo agora.
    for (const modelo of cadeiaModelos()) {
      if (restante(prazo) <= 0) break;
      const inicio = Date.now();
      let okModelo = false;
      let detalheModelo = "";
      for (const v of variantes) {
        if (restante(prazo) <= 0) break;
        try {
          const r = await fetch(`${GEMINI_BASE}/${modelo}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
            body: JSON.stringify(v.corpo),
            signal: AbortSignal.timeout(Math.max(restante(prazo), 3_000)),
          }).then(async (res) => ({ status: res.status, corpo: (await res.json().catch(() => null)) as (GeminiResposta & { error?: { message?: string } }) | null }));
          if (r.status === 200) {
            const cand = r.corpo?.candidates?.[0];
            const t = textoGemini(r.corpo);
            // Eco de raciocínio (Gemma 4) com resposta recuperável conta como
            // SUCESSO desde o sanitizador — o probe reflete o que de fato
            // chegaria ao paciente (resposta final extraída do despejo).
            const comEco = !!t && textoComEcoRaciocinio(t);
            okModelo = !!t && (!comEco || !!extrairRespostaFinal(t));
            detalheModelo = `HTTP 200 finish=${cand?.finishReason ?? "?"} texto="${t.slice(0, 30) || "—"}"${comEco ? (okModelo ? " (eco — resposta final extraída pelo sanitizador)" : " (eco insanitizável — tratado como falha)") : ""} [${v.rotulo}]`;
            if (okModelo) break;
          } else {
            const msg = r.corpo?.error?.message || `HTTP ${r.status}`;
            detalheModelo = limpar(`${msg} [${v.rotulo}]`, segredoGemini);
          }
        } catch (e) {
          detalheModelo = limpar(`${e instanceof Error ? e.message : String(e)} [${v.rotulo}]`, segredoGemini);
        }
      }
      resultados.push({ canal: "gemini", ok: okModelo, detalhe: `[${modelo}] ${detalheModelo || "sem resposta"}`, ms: Date.now() - inicio });
    }
  } else {
    resultados.push({ canal: "gemini", ok: false, detalhe: "não configurado — defina BION_LLM_GEMINI_API_KEY na Vercel e faça redeploy", ms: 0 });
  }

  return resultados;
}

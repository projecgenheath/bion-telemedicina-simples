import ZAI from "z-ai-web-dev-sdk";

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
 *  3. Endpoint público sem chave (desligado por padrão — BION_LLM_PUBLICO=1
 *     para ativar; nomes anonimizados antes do envio — LGPD);
 *  4. SDK do sandbox (só existe dentro da rede do sandbox).
 *  Nenhum canal respondendo → motores locais determinísticos por rota.
 *
 * A LEITURA DE LAUDOS (visão, fotos/PDFs) segue nos modelos Gemini flash
 * (MODELOS_VISAO): extração estruturada de documentos não é o chat do
 * paciente e não pode herdar o despejo de raciocínio do Gemma.
 *
 * `chatCompleto()` devolve string | null e `chatComFonte()` também informa
 * a fonte ("gemini" | "env" | "publico" | "sdk") e o modelo exato que
 * respondeu. As rotas usam null como sinal para acionar os motores locais
 * determinísticos — a BION IA nunca fica muda.
 */

export type Msg = { role: "user" | "assistant"; content: string };

export type AnonNomes = { nome: string; substituto: string }[];

export type FonteLlm = "gemini" | "env" | "publico" | "sdk";

type ClienteEnv = { tipo: "env"; baseUrl: string; apiKey: string; model?: string };
type ClienteSdk = { tipo: "sdk"; zai: Awaited<ReturnType<typeof ZAI.create>> };
type Cliente = ClienteEnv | ClienteSdk | { tipo: "gemini" };

type Resultado = { texto: string | null; fonte: FonteLlm | null; modelo?: string | null };

const SONDA_TIMEOUT_MS = 6_000;
const COOLDOWN_FALHA_MS = 60_000;
const PUBLICO_URL_PADRAO = "https://text.pollinations.ai/openai";
const PUBLICO_MODEL_PADRAO = "openai-fast";

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
let _publicoFalhaEm = 0;
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
const GEMMA_ECO_COOLDOWN_MS = 30 * 60_000;
let _gemmaEcoSeguidos = 0;
let _gemmaPuladoAte = 0;

// P2 (2026-09): o canal público (sem chave, serviços de terceiros) passa a
// nascer DESLIGADO por padrão — só ativa com BION_LLM_PUBLICO="1" explícito.
// Quando ativo, o chat do paciente exibe a nota de consentimento (anonymização
// LGPD dos nomes antes do envio).
const publicoHabilitado = () => process.env.BION_LLM_PUBLICO === "1";
const publicoEmCooldown = () => Date.now() - _publicoFalhaEm < COOLDOWN_FALHA_MS;

const geminiHabilitado = () => process.env.BION_LLM_GEMINI !== "0";
const geminiEmCooldown = () => Date.now() - _geminiFalhaEm < COOLDOWN_FALHA_MS;

function geminiConfig() {
  const apiKey = (process.env.BION_LLM_GEMINI_API_KEY || "").trim();
  // Override via env BION_LLM_GEMINI_MODEL: se houver um valor antigo na
  // Vercel (ex.: gemini-3.6-flash), ele VENCE o padrão do código — o painel
  // de diagnóstico (/api/bion-ia/diagnostico GET) mostra o modelo efetivo.
  const model = (process.env.BION_LLM_GEMINI_MODEL || GEMINI_MODEL_PADRAO).trim();
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

type GeminiParte = { text?: string } | { inline_data: { mime_type: string; data: string } };

type GeminiCorpo = {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: GeminiParte[] }[];
  generationConfig?: Record<string, unknown>;
};

type GeminiResposta = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

function textoGemini(bruto: GeminiResposta | null): string {
  const partes = bruto?.candidates?.[0]?.content?.parts ?? [];
  return partes
    .map((p) => p.text ?? "")
    .join("")
    .trim();
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

let _registrosGemini: RegistroGemini[] = [];

/** Registros da última chamada de chamarGemini NESTA instância (ler logo após). */
export function registrosGemini(): RegistroGemini[] {
  return _registrosGemini;
}

/** POST genérico ao generateContent; repetição sem thinkingConfig em 400. */
async function geminiPost(
  model: string,
  apiKey: string,
  corpo: GeminiCorpo,
  prazo: number,
  rotulo = "gemini",
): Promise<string | null> {
  const url = `${GEMINI_BASE}/${model}:generateContent`;
  const chamar = async (c: GeminiCorpo, rotuloTurno: string): Promise<GeminiResposta | null> => {
    const inicio = Date.now();
    try {
      const bruto = (await Promise.race([
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
          body: JSON.stringify(c),
        }).then(async (r) => {
          const j = (await r.json().catch(() => null)) as (GeminiResposta & { error?: { message?: string } }) | null;
          _registrosGemini.push({
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
        }),
        new Promise<null>((_, rejeita) => setTimeout(() => rejeita(new Error("timeout")), restante(prazo))),
      ])) as GeminiResposta | null;
      return bruto;
    } catch (e) {
      // registro ausente = falha antes da resposta HTTP (timeout / rede)
      const registrado = _registrosGemini.some((rg) => rg.rotulo === rotuloTurno);
      if (!registrado) {
        _registrosGemini.push({
          rotulo: rotuloTurno,
          status: null,
          finish: null,
          block: null,
          ms: Date.now() - inicio,
          textoLen: 0,
          erro: limpar(e instanceof Error ? e.message : String(e), apiKey),
        });
      }
      return null;
    }
  };

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
): Promise<{ texto: string | null; modelo: string | null }> {
  const { apiKey } = geminiConfig();
  _registrosGemini = [];
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
    "\n\n---\n\nIMPORTANTE (estilo de resposta, obrigatório): fale como a BION IA, em \n" +
    "português do Brasil, dirigindo-se diretamente à pessoa (\"você\"). A PRIMEIRA \n" +
    "linha da resposta já é a fala da BION IA respondendo ao pedido. NUNCA exiba \n" +
    "raciocínio, análise, plano, rascunho, checklist ou comentário sobre as \n" +
    "instruções (nada de \"The user wants...\", \"User's Input:\", \"User prompt:\", \n" +
    "\"Draft\", \"Refining\", \"Final Answer:\", \"Constraint\", \"Let me analyze\"). \n" +
    "NUNCA cite nem repita o pedido do usuário. No máximo 5 linhas.\n" +
    '\nExemplo do estilo exato:\n' +
    'Pedido: "quero renovar minha receita de remédio contínuo, não tenho sintomas"\n' +
    'Resposta correta: "Claro! A receita é emitida pelo médico em uma **teleconsulta \n' +
    'de reavaliação** — é rápida e você não precisa estar com sintomas. Toque em \n' +
    '**Agendar consulta** aqui embaixo que eu te guio no resto."';
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
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
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
    // (sem systemInstruction) recebe ~85% — o 31B sem thinking chegou a
    // responder em 17-19s e o 26B A4B pode ter cold start lento no free tier.
    const subprazo = Date.now() + Math.max(Math.round(restante(prazo) * (ehGemma ? 0.85 : 0.55)), 6_000);
    const texto1 = await geminiPost(modelo, apiKey, corpo, Math.min(prazo, subprazo), modelo);
    if (texto1 && !textoComEcoRaciocinio(texto1)) {
      if (ehGemma) {
        // Gemma limpo: desarma o disjuntor (a Google corrigiu o despejo).
        _gemmaEcoSeguidos = 0;
        _gemmaPuladoAte = 0;
      }
      return { texto: texto1, modelo };
    }
    if (ehGemma) {
      if (texto1) {
        // Despejo de raciocínio confirmado → SANITIZA em vez de descartar:
        // a resposta final do Gemma vem embutida no despejo (medido em
        // produção: 2632 chars de despejo com a resposta correta dentro).
        const limpo = extrairRespostaFinal(texto1);
        if (limpo) {
          _gemmaEcoSeguidos = 0;
          _gemmaPuladoAte = 0;
          return { texto: limpo, modelo };
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
    const texto2 = await geminiPost(modelo, apiKey, sem, prazo, `${modelo}-sem-thinking`);
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
  if (!geminiHabilitado()) return null;
  const { apiKey } = geminiConfig();
  const prazo = Date.now() + Math.max(timeoutMs, 5_000);
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

/**
 * Textos de ERRO do provedor gratuito vêm como resposta "válida" (HTTP 200) —
 * muro de créditos, aviso de conta, publicidade. NUNCA podem chegar ao
 * paciente como se fosse fala da BION IA: tratamos como falha do canal.
 */
const RE_RESPOSTA_INVALIDA =
  /(doesn'?t have enough credits|top[- ]up|pollinations\.ai\/(top-up|quests)|enter\.pollinations\.ai|contact whoever runs|\*\*Ad\*\*|suporte da apikey|insufficient (credits|quota))/i;

function respostaInvalida(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return RE_RESPOSTA_INVALIDA.test(texto);
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
 * cadeia cai para o próximo (mesmo padrão do canal público). Quando a Google
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
  /^\s*[\*\->\s]*(?:\*\*)?\s*(?:user'?s?\s*(?:input|prompt|request|persona)|user\s+persona|input\s*:|user\s+prompt|prompt\s*:|prompt\s+analysis|draft\s*\d|draft\s+(?:the|a|an|my|final|short|new)\b|refining\b|refined\b|persona\s+constraint|constraint\s+check|constraint\s*\d?\s*:|confidence\s+score|final\s+(?:answer|response|draft|version)|refined\s+(?:response|answer|version)|answer\s*:|response\s*:|best\s+response|check\s+constraints?|directly\s+addressing|first\s+line\s+is|no\s+meta-talk|no\s+repetition|max\s+\d+\s+lines|language\s*:|tone\s*:|style\s*:|lines\s*:\s*\d|word\s+count|wait\b|acknowledge\b|let\s+me\b|let'?s\s+(?:refine|ensure|draft|write|check|make|create|start|craft|finalize|adjust|polish)|self[-\s]?correction|\(this\s+is\s+\d+\s+lines?\)|the\s+user\s+said|i\s+(?:will|'ll|should|need|can|must)\b|the\s+user\b|analy(?:ze|zing|sis)\b|checklist|step\s*\d|thought\b|thinking\b|note\s*:|goal\s*:|context\s*:|key\s+points?|plan\s*:|version\s*\d|option\s*\d|revision\b|evaluat|reviewing|first\s+draft|next\s+step|paraphras|clarif|format\s*:|requirements?\s*:|[^?\n]{2,60}\?\s*yes\b)/i;

/**
 * Marcadores de RESPOSTA FINAL dentro do despejo — o corte é feito no ÚLTIMO
 * deles (o Gemma refina em rascunhos: Draft 1 → Refining → Final Answer).
 */
const RE_MARCADOR_FINAL =
  /(?:final\s+(?:answer|response|draft|version)|refined\s+(?:response|answer|version)|resposta\s+final|vers[\u00e3o]\s+final|best\s+response)\s*[:\-]?\s*/gi;

/**
 * DESDUPLICAÇÃO: o Gemma às vezes COLA a resposta final repetida sem
 * separador (real 2026-09-24: "...restante.\"Com certeza! ... restante.").
 * Cobre citação seguida da mesma citação e texto inteiro espelhado.
 */
function desduplicar(v: string): string {
  const t = v
    .trim()
    .replace(/^["\u201c]+/, "")
    .replace(/["\u201d]+$/, "")
    .trim();
  if (t.length >= 40) {
    // 1) cola exata X+X (ou "X"+X): menor ponto de repetição a partir da metade.
    for (let i = Math.ceil(t.length / 2); i <= t.length - 20; i++) {
      if (t.startsWith(t.slice(i))) {
        return t
          .slice(0, i)
          .replace(/["\u201d]+$/, "")
          .trim();
      }
    }
    // 2) cola quase idêntica X+Y (real 2026-09-24: DUAS versões da mesma
    //    resposta grudadas — "…no restante.Claro! A receita é emitida…").
    //    Compara as metades em fronteiras de frase (inclusive COLADAS, sem
    //    espaço: ".Claro!"); parecidas → 1ª metade.
    if (t.length >= 200) {
      let melhor: { corte: number; sim: number } | null = null;
      const de = Math.floor(t.length * 0.35);
      const ate = Math.floor(t.length * 0.85);
      for (let s = de; s <= ate; s++) {
        if (t[s - 1] !== ".") continue;
        // fronteira: ". " (frase normal) ou ".Maiúscula" (resposta colada)
        let inicioB: number;
        if (t[s] === " ") {
          inicioB = s + 1;
        } else if (/[A-ZÀ-Ú]/.test(t[s] ?? "")) {
          inicioB = s;
        } else {
          continue;
        }
        const a = t.slice(0, s); // inclui o ponto final
        const b = t.slice(inicioB);
        if (a.length < 80 || b.length < 80) continue;
        const sim = similaridade(a, b);
        if (!melhor || sim > melhor.sim) melhor = { corte: s, sim };
      }
      if (melhor && melhor.sim >= 0.6) return t.slice(0, melhor.corte).trim();
    }
  }
  return t;
}

/** Jaccard de palavras de conteúdo (sem acento, ≥ 4 letras) entre dois textos. */
function similaridade(a: string, b: string): number {
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
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}

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
  if (!textoComEcoRaciocinio(bruto)) return bruto;

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

/**
 * No canal público os nomes reais viram substitutos neutros ("a paciente",
 * "o médico"). Sem aviso, o modelo ECOA o substituto como se fosse nome —
 * "Seu nome é a paciente" chegou a ser exibido ao paciente (bug real).
 * Esta nota ensina o modelo a tratar a pessoa como "você" e a não repetir
 * os marcadores. Aplicada na PRIMEIRA mensagem (instrução do sistema).
 */
const NOTA_PRIVACIDADE =
  "\n\nNOTA DE PRIVACIDADE (obrigatória): os nomes reais foram removidos desta conversa por segurança. Você NÃO sabe o nome de quem fala contigo. Dirija-se a essa pessoa SEMPRE no tratamento \"você\" e NUNCA repita os marcadores de substituição (\"a paciente\", \"o paciente\", \"o médico\") como se fossem o nome dela. Exemplo correto: \"Confirmado, 80 kg. Está tudo certo?\" — jamais \"Seu nome é a paciente\".";

function aplicarNotaPrivacidade(mensagens: Msg[]): Msg[] {
  if (!mensagens.length) return mensagens;
  const [primeira, ...resto] = mensagens;
  if (primeira.role === "assistant") {
    return [{ ...primeira, content: primeira.content + NOTA_PRIVACIDADE }, ...resto];
  }
  return [{ role: "assistant", content: NOTA_PRIVACIDADE.trim() }, ...mensagens];
}

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
  const texto = bruto?.choices?.[0]?.message?.content?.trim() || null;
  if (respostaInvalida(texto)) {
    console.warn("[llm] canal público devolveu texto de erro do provedor — tratado como falha.");
    return null;
  }
  return texto;
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
export async function chatComFonte(mensagens: Msg[], timeoutMs: number, anon?: AnonNomes): Promise<Resultado> {
  const prazo = Date.now() + Math.max(timeoutMs, 5_000);

  // 1) Google Gemini — API própria do projeto (dados completos)
  if (geminiHabilitado() && geminiConfig().apiKey && !geminiEmCooldown()) {
    const { texto, modelo } = await chamarGemini(mensagens, prazo);
    if (texto) return { texto, fonte: "gemini", modelo };
    _geminiFalhaEm = Date.now();
  }

  // 2) credenciais próprias genéricas — confiável, sem anonimização
  const env = clienteEnv();
  if (env) {
    const texto = await chamarEnv(env, mensagens, prazo);
    if (texto) return { texto, fonte: "env" };
  }

  // 3) endpoint público sem chave — anonimiza nomes antes de enviar
  if (publicoHabilitado() && process.env.BION_LLM_FORCAR_SDK !== "1" && !publicoEmCooldown()) {
    const anonimizado = anonimizarMensagens(mensagens, anon);
    const comNota = anon?.length ? aplicarNotaPrivacidade(anonimizado) : anonimizado;
    const texto = await chamarPublico(comNota, prazo);
    if (texto) return { texto, fonte: "publico" };
    _publicoFalhaEm = Date.now();
  }

  // 4) SDK do sandbox (sonda memorizada por instância)
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

/**
 * Cliente para chamadas de VISÃO (createVision) — Gemini (texto via
 * `visaoGemini`), env genérico ou SDK do sandbox.
 */
export async function obterLLM(): Promise<Cliente | null> {
  if (geminiHabilitado() && geminiConfig().apiKey && !geminiEmCooldown()) return { tipo: "gemini" };
  const env = clienteEnv();
  if (env) return env;
  return tentarSdk();
}

/* ---------------------------- diagnóstico (admin) ---------------------------- */

export type EstadoCanais = {
  gemini: { configurado: boolean; modelo: string; reserva: string[] };
  env: { configurado: boolean; modelo: string | null };
  publico: { ativo: boolean; modelo: string };
};

/** Estado de configuração dos canais — SOMENTE booleanos/modelos, nunca chaves. */
export function estadoCanais(): EstadoCanais {
  const gem = geminiConfig();
  const env = clienteEnv();
  return {
    gemini: { configurado: geminiHabilitado() && !!gem.apiKey, modelo: gem.model, reserva: modelosReserva() },
    env: { configurado: !!env, modelo: process.env.BION_LLM_MODEL?.trim() || null },
    publico: { ativo: publicoHabilitado(), modelo: (process.env.BION_LLM_PUBLICO_MODEL || PUBLICO_MODEL_PADRAO).trim() },
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
  const r = await chamarGemini(mensagens, prazo, modelo, { ignorarDisjuntor: true, bruto: true });
  return { texto: r.texto, modelo: r.modelo, registros: _registrosGemini };
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

  // 2) endpoint público (reserva) — só informa se está respondendo
  if (publicoHabilitado()) {
    const inicio = Date.now();
    try {
      const r = await chamarPublico(
        [
          { role: "assistant", content: "Você é um eco de teste." },
          { role: "user", content: "Responda apenas: ok" },
        ],
        prazo,
      );
      resultados.push({ canal: "publico", ok: !!r, detalhe: r ? `resposta: ${r.slice(0, 40)}` : "sem resposta", ms: Date.now() - inicio });
    } catch (e) {
      resultados.push({ canal: "publico", ok: false, detalhe: e instanceof Error ? e.message : String(e), ms: Date.now() - inicio });
    }
  }

  return resultados;
}

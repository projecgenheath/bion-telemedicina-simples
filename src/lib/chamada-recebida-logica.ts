/**
 * Chamada recebida com o app aberto (tele v2, fase 2): regras PURAS, sem
 * React nem servidor. Testadas em chamada-recebida-logica.teste.ts.
 *
 * Contrato dos eventos (canal PRIVADO de notificações do usuário,
 * `notificacoes:user:<id>:<hmac>`):
 *   chamada_tocando  { consultaId, contraparte, especialidade, expiraEm, tentativa, inicioEm? }  (job do Admin)
 *   chamada_expirada { consultaId, tentativa, em, ultima }                             (job do Admin)
 *   chamada_atendida { consultaId, tentativa, por: "paciente"|"medico", em }          (POST .../chamada)
 *   chamada_recusada { consultaId, tentativa, por, em }                                (POST .../chamada)
 * Sem dado de saúde além da especialidade (que só aparece com o app aberto).
 */

export const EVENTOS_CHAMADA = ["chamada_tocando", "chamada_atendida", "chamada_recusada", "chamada_expirada"] as const;
export type NomeEventoChamada = (typeof EVENTOS_CHAMADA)[number];

export type ChamadaTocando = {
  consultaId: string;
  contraparte: string;
  especialidade: string;
  /** Instante (ms) em que o toque expira. */
  expiraEm: number;
  tentativa: number;
  /** Horário marcado da consulta (ms), quando o servidor manda `inicioEm`. */
  inicioEm?: number;
};

export type EventoChamada =
  | ({ tipo: "chamada_tocando" } & ChamadaTocando)
  | { tipo: "chamada_atendida" | "chamada_recusada"; consultaId: string; tentativa: number; por: "paciente" | "medico" }
  | { tipo: "chamada_expirada"; consultaId: string; tentativa: number; ultima: boolean };

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;
const TENTATIVA_MAX = 10;

function tentativaValida(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= TENTATIVA_MAX;
}

/** Valida o payload de um broadcast (vem da rede: nada é confiável). null = ignorar. */
export function lerEventoChamada(evento: string, payload: unknown): EventoChamada | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const consultaId = typeof p.consultaId === "string" && ID_VALIDO.test(p.consultaId) ? p.consultaId : null;
  if (!consultaId || !tentativaValida(p.tentativa)) return null;
  const tentativa = p.tentativa;
  if (evento === "chamada_tocando") {
    const expiraEm = typeof p.expiraEm === "string" || typeof p.expiraEm === "number" ? new Date(p.expiraEm).getTime() : NaN;
    if (!Number.isFinite(expiraEm)) return null;
    const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    // inicioEm (ISO, opcional): valor inválido é ignorado, sem derrubar o toque.
    const inicioEm = typeof p.inicioEm === "string" && p.inicioEm ? Date.parse(p.inicioEm) : NaN;
    return {
      tipo: "chamada_tocando",
      consultaId,
      tentativa,
      expiraEm,
      contraparte: texto(p.contraparte, 80),
      especialidade: texto(p.especialidade, 60),
      ...(Number.isFinite(inicioEm) ? { inicioEm } : {}),
    };
  }
  if (evento === "chamada_atendida" || evento === "chamada_recusada") {
    const por = p.por === "medico" ? "medico" : p.por === "paciente" ? "paciente" : null;
    if (!por) return null;
    return { tipo: evento, consultaId, tentativa, por };
  }
  if (evento === "chamada_expirada") {
    return { tipo: "chamada_expirada", consultaId, tentativa, ultima: p.ultima === true };
  }
  return null;
}

export const chaveChamada = (consultaId: string, tentativa: number) => `${consultaId}:${tentativa}`;

/* ------------------------------------------------------------------ */
/* Estado do toque no cliente                                          */
/* ------------------------------------------------------------------ */

export type EstadoChamadaRecebida = {
  /** Chamada tocando agora (no máximo uma). */
  atual: ChamadaTocando | null;
  /** Chaves consultaId:tentativa já tratadas (dedupe entre aparelhos e reenvios). */
  vistas: string[];
  /**
   * Início de referência (ms) por consulta, com a prioridade da fonte:
   * 2 = inicioEm do payload, 1 = dataISO do store, 0 = 1º toque visto.
   */
  inicios: [consultaId: string, inicio: number, prioridade: 0 | 1 | 2][];
  /** Consultas cujo toque acabou de vez (ultima, +15 min do início, cancelada/concluída). */
  finalizadas: string[];
};

export const ESTADO_CHAMADA_INICIAL: EstadoChamadaRecebida = { atual: null, vistas: [], inicios: [], finalizadas: [] };
const MAX_VISTAS = 50;

/** Depois disso (a partir do início da consulta) qualquer expiração é a final, mesmo sem `ultima: true`. */
export const FIM_TOQUES_APOS_INICIO_MS = 15 * 60_000;

/** Status da consulta que encerram o toque na hora. */
export const STATUS_CONSULTA_FINAL = ["cancelada", "concluida"] as const;
export const consultaEncerrada = (status: string | null | undefined) =>
  !!status && (STATUS_CONSULTA_FINAL as readonly string[]).includes(status);

export type AcaoChamada =
  | {
      tipo: "evento";
      evento: EventoChamada;
      agora: number;
      /** Horário (ms) da consulta, quando o app conhece (store). */
      inicioConsulta?: number | null;
    }
  /** Timer local chegou no expiraEm (não espera o chamada_expirada do servidor). */
  | { tipo: "expirou"; consultaId: string; tentativa: number; agora: number }
  /** A consulta mudou para cancelada/concluída: para de tocar e não toca mais. */
  | { tipo: "consulta_encerrada"; consultaId: string }
  /** Fecha UMA tentativa (ex.: atendida em segundo plano por já estar na sala dela). */
  | { tipo: "fechar_tentativa"; consultaId: string; tentativa: number }
  /** O próprio usuário atendeu, recusou ou fechou nesta tela. */
  | { tipo: "fechar" };

function marcar(vistas: string[], chave: string): string[] {
  if (vistas.includes(chave)) return vistas;
  const prox = [...vistas, chave];
  return prox.length > MAX_VISTAS ? prox.slice(prox.length - MAX_VISTAS) : prox;
}

function finalizar(estado: EstadoChamadaRecebida, consultaId: string): string[] {
  return marcar(estado.finalizadas, consultaId);
}

function inicioDe(estado: EstadoChamadaRecebida, consultaId: string): number | null {
  return estado.inicios.find(([id]) => id === consultaId)?.[1] ?? null;
}

const passouDoFim = (estado: EstadoChamadaRecebida, consultaId: string, agora: number) => {
  const ini = inicioDe(estado, consultaId);
  return ini !== null && agora >= ini + FIM_TOQUES_APOS_INICIO_MS;
};

const mesma = (a: ChamadaTocando | null, consultaId: string, tentativa: number) =>
  !!a && a.consultaId === consultaId && a.tentativa === tentativa;

export function reduzirChamada(estado: EstadoChamadaRecebida, acao: AcaoChamada): EstadoChamadaRecebida {
  if (acao.tipo === "fechar") {
    if (!estado.atual) return estado;
    return { ...estado, atual: null, vistas: marcar(estado.vistas, chaveChamada(estado.atual.consultaId, estado.atual.tentativa)) };
  }
  if (acao.tipo === "consulta_encerrada") {
    const finalizadas = finalizar(estado, acao.consultaId);
    const atual = estado.atual?.consultaId === acao.consultaId ? null : estado.atual;
    if (atual === estado.atual && finalizadas === estado.finalizadas) return estado;
    return { ...estado, atual, finalizadas };
  }
  if (acao.tipo === "fechar_tentativa") {
    if (!mesma(estado.atual, acao.consultaId, acao.tentativa)) return estado;
    return { ...estado, atual: null, vistas: marcar(estado.vistas, chaveChamada(acao.consultaId, acao.tentativa)) };
  }
  if (acao.tipo === "expirou") {
    if (!mesma(estado.atual, acao.consultaId, acao.tentativa)) return estado;
    return {
      ...estado,
      atual: null,
      vistas: marcar(estado.vistas, chaveChamada(acao.consultaId, acao.tentativa)),
      finalizadas: passouDoFim(estado, acao.consultaId, acao.agora) ? finalizar(estado, acao.consultaId) : estado.finalizadas,
    };
  }
  const ev = acao.evento;
  const chave = chaveChamada(ev.consultaId, ev.tentativa);
  if (ev.tipo === "chamada_tocando") {
    // Consulta já sem toque (última tentativa, +15 min, cancelada/concluída).
    if (estado.finalizadas.includes(ev.consultaId)) return estado;
    // Repetido (outro caminho/aparelho) ou já expirado. Quem já está na sala desta
    // consulta TAMBÉM entra no estado: a UI não mostra nada (modo "nada") e atende
    // em segundo plano (tentativaParaAtenderNaSala + fechar_tentativa).
    if (estado.vistas.includes(chave)) return estado;
    // Início de referência da janela de 15 min, por prioridade:
    // inicioEm do payload > horário da consulta no store (dataISO) > 1º toque visto.
    // Uma fonte de prioridade menor nunca sobrescreve uma maior.
    const [ini, prio]: [number, 0 | 1 | 2] =
      typeof ev.inicioEm === "number"
        ? [ev.inicioEm, 2]
        : typeof acao.inicioConsulta === "number"
          ? [acao.inicioConsulta, 1]
          : [acao.agora, 0];
    const anterior = estado.inicios.find(([id]) => id === ev.consultaId);
    if (!anterior) {
      const inicios: EstadoChamadaRecebida["inicios"] = [...estado.inicios, [ev.consultaId, ini, prio]];
      estado = { ...estado, inicios: inicios.length > MAX_VISTAS ? inicios.slice(inicios.length - MAX_VISTAS) : inicios };
    } else if (prio > 0 && prio >= anterior[2] && ini !== anterior[1]) {
      estado = {
        ...estado,
        inicios: estado.inicios.map((e) => (e[0] === ev.consultaId ? [e[0], ini, prio] : e)),
      };
    }
    if (passouDoFim(estado, ev.consultaId, acao.agora)) {
      return { ...estado, vistas: marcar(estado.vistas, chave), finalizadas: finalizar(estado, ev.consultaId) };
    }
    if (ev.expiraEm <= acao.agora) return { ...estado, vistas: marcar(estado.vistas, chave) };
    // Já tocando outra chamada ainda válida: mantém a atual (a nova toca de novo na próxima tentativa).
    if (estado.atual && estado.atual.expiraEm > acao.agora && estado.atual.consultaId !== ev.consultaId) return estado;
    const { tipo: _tipo, ...chamada } = ev;
    void _tipo;
    return { ...estado, atual: chamada, vistas: marcar(estado.vistas, chave) };
  }
  // atendida / recusada / expirada: fecha a desta consulta+tentativa e lembra a chave
  // (um "tocando" atrasado da mesma tentativa não volta a tocar).
  const vistas = marcar(estado.vistas, chave);
  const finalizadas =
    ev.tipo === "chamada_expirada" && (ev.ultima || passouDoFim(estado, ev.consultaId, acao.agora))
      ? finalizar(estado, ev.consultaId)
      : estado.finalizadas;
  // Fecha a mesma tentativa; se a consulta acabou de vez, fecha qualquer toque dela.
  const fecha =
    mesma(estado.atual, ev.consultaId, ev.tentativa) ||
    (finalizadas !== estado.finalizadas && estado.atual?.consultaId === ev.consultaId);
  if (fecha) return { ...estado, atual: null, vistas, finalizadas };
  return { ...estado, vistas, finalizadas };
}

/** "/consulta?consulta=<id>" → id (a sala daquela consulta está aberta neste aparelho). */
export function consultaAbertaNaUrl(pathname: string, search: string): string | null {
  const path = pathname.replace(/\/+$/, "");
  if (path !== "/consulta") return null;
  const id = new URLSearchParams(search).get("consulta");
  return id && ID_VALIDO.test(id) ? id : null;
}

/** Como mostrar o toque: tela cheia, aviso compacto no topo, ou nada. */
export type ModoChamadaRecebida = "tela" | "aviso" | "nada";

/**
 * Onde o usuário está decide como o toque aparece:
 *  - na sala da MESMA consulta (/consulta?consulta=<id>): nada;
 *  - em QUALQUER outra /consulta (outra chamada, pré-sala, sem id): aviso
 *    compacto no topo, sem toque alto (não cobre os controles da chamada);
 *  - fora de /consulta: tela cheia com toque.
 */
export function modoChamadaRecebida(consultaId: string, pathname: string, search: string): ModoChamadaRecebida {
  if (pathname.replace(/\/+$/, "") !== "/consulta") return "tela";
  return consultaAbertaNaUrl(pathname, search) === consultaId ? "nada" : "aviso";
}

/**
 * Já na sala da MESMA consulta (modo "nada") com uma tentativa dela tocando
 * (não expirada; respondida já saiu do estado): atende em segundo plano, uma
 * vez, sem UI nem navegação. Depois a UI despacha fechar_tentativa.
 */
export function tentativaParaAtenderNaSala(
  atual: ChamadaTocando | null,
  modo: ModoChamadaRecebida,
  agora: number,
): { consultaId: string; tentativa: number } | null {
  if (!atual || modo !== "nada" || atual.expiraEm <= agora) return null;
  return { consultaId: atual.consultaId, tentativa: atual.tentativa };
}

/** Pergunta da confirmação ao atender pelo aviso compacto (há uma chamada em andamento). */
export const TEXTO_CONFIRMAR_TROCA = "Sair da chamada atual e atender?";

/**
 * Texto completo da confirmação, por papel. Sair da sala desmonta tudo: as
 * anotações (useSalaConsulta) e os rascunhos do médico (ChamadaMedico) vivem
 * só em useState e se perdem. Aceita "medico"/"MEDICO"; o resto cai no texto
 * do paciente (admin nunca vê a chamada recebida).
 */
export function textoConfirmarTroca(papel: string | null | undefined): string {
  if ((papel ?? "").toLowerCase() === "medico") {
    return `${TEXTO_CONFIRMAR_TROCA} A consulta atual não será concluída, e as anotações e os documentos não emitidos serão perdidos.`;
  }
  return `${TEXTO_CONFIRMAR_TROCA} As anotações não salvas desta consulta serão perdidas.`;
}

/* ------------------------------------------------------------------ */
/* Rota POST /api/telemedicina/[consultaId]/chamada                    */
/* ------------------------------------------------------------------ */

export type AcaoResposta = "atender" | "recusar";

/** Corpo do POST: { acao: "atender"|"recusar", tentativa }. null = 400. */
export function lerPedidoResposta(corpo: unknown): { acao: AcaoResposta; tentativa: number } | null {
  if (!corpo || typeof corpo !== "object") return null;
  const c = corpo as Record<string, unknown>;
  if (c.acao !== "atender" && c.acao !== "recusar") return null;
  if (!tentativaValida(c.tentativa)) return null;
  return { acao: c.acao, tentativa: c.tentativa };
}

export type StatusLinhaChamada = "tocando" | "atendida" | "recusada" | "expirada";

export type DecisaoResposta = {
  /** Grava o novo status (atender: tocando|expirada; recusar: só tocando). */
  atualizarPara: "atendida" | "recusada" | null;
  /** Status de onde a linha pode sair (guarda do updateMany contra corrida). */
  de: StatusLinhaChamada[];
  /** Avisa os outros aparelhos do próprio usuário (para de tocar neles). */
  avisar: boolean;
  /** Status devolvido ao cliente. */
  status: StatusLinhaChamada | "sem_registro";
};

/**
 * Decide o que a rota faz com a linha (consultaId, eu, tentativa).
 *  - Sem linha (antes do job do Admin): 200 sem criar nada; avisa os outros aparelhos.
 *  - atender: vale com a linha "tocando" OU "expirada" (o toque pode ter acabado
 *    de expirar; quem barra é a janela da consulta, checada antes na rota).
 *  - recusar: só sai de "tocando".
 *  - Já atendida (ou recusada / expirada no recusar): idempotente, devolve o
 *    estado atual sem avisar de novo.
 */
export function decidirResposta(acao: AcaoResposta, linha: { status: string } | null): DecisaoResposta {
  if (!linha) return { atualizarPara: null, de: [], avisar: true, status: "sem_registro" };
  const de: StatusLinhaChamada[] = acao === "atender" ? ["tocando", "expirada"] : ["tocando"];
  if ((de as string[]).includes(linha.status)) {
    const para = acao === "atender" ? "atendida" : "recusada";
    return { atualizarPara: para, de, avisar: true, status: para };
  }
  const st = (["atendida", "recusada", "expirada"] as const).find((s) => s === linha.status) ?? "expirada";
  return { atualizarPara: null, de: [], avisar: false, status: st };
}

/* ------------------------------------------------------------------ */
/* Cliente: depois de tocar em "Atender"                               */
/* ------------------------------------------------------------------ */

export const TEXTO_EVOLUCAO_PENDENTE = "Conclua a evolução anterior para atender";

export type ResultadoAtender = { tipo: "entrar" } | { tipo: "fechar" } | { tipo: "bloqueado"; mensagem: string };

/** 409 { motivo: "consulta_encerrada" }: consulta cancelada/concluída (fecha o toque, sem navegar). */
export function respostaConsultaEncerrada(r: { status: number; corpo?: unknown } | null): boolean {
  return (
    r?.status === 409 &&
    !!r.corpo &&
    typeof r.corpo === "object" &&
    (r.corpo as { motivo?: unknown }).motivo === "consulta_encerrada"
  );
}

/**
 * Atender: decide entre ir para a sala ou ficar na tela com um aviso.
 *  - 409 { motivo: "evolucao_pendente" } (do GET /sala ou, no futuro, do POST
 *    .../chamada): bloqueia com "Conclua a evolução anterior para atender".
 *  - 409 { motivo: "consulta_encerrada" } (consulta cancelada/concluída): fecha a tela, sem navegar.
 *  - 409 de janela (sala fechada/ainda não abriu) do POST: bloqueia com o texto do servidor.
 *  - 403/404 do POST: bloqueia (não é desta pessoa / não existe).
 *  - Qualquer outra coisa (200, rede, 5xx): entra na sala, que tem o próprio tratamento.
 */
export function decidirAposAtender(
  sala: { status: number; corpo?: unknown } | null,
  chamada: { status: number; corpo?: unknown } | null,
): ResultadoAtender {
  const motivo = (c: unknown) => (c && typeof c === "object" ? (c as { motivo?: unknown }).motivo : undefined);
  const erro = (c: unknown) => (c && typeof c === "object" ? (c as { erro?: unknown }).erro : undefined);
  for (const r of [sala, chamada]) {
    if (r?.status === 409 && motivo(r.corpo) === "evolucao_pendente") {
      return { tipo: "bloqueado", mensagem: TEXTO_EVOLUCAO_PENDENTE };
    }
  }
  if (respostaConsultaEncerrada(sala) || respostaConsultaEncerrada(chamada)) return { tipo: "fechar" };
  if (chamada && (chamada.status === 409 || chamada.status === 403 || chamada.status === 404)) {
    const e = erro(chamada.corpo);
    return {
      tipo: "bloqueado",
      mensagem:
        typeof e === "string" && e
          ? e
          : chamada.status === 409
            ? "A sala desta consulta não está aberta agora."
            : "Não foi possível atender esta chamada.",
    };
  }
  return { tipo: "entrar" };
}

/** Iniciais do avatar ("Dr. Rafael Lima" → "RL"; ignora títulos). */
export function iniciaisContraparte(nome: string): string {
  const partes = nome
    .split(/\s+/)
    .filter((p) => p && !/^(dr|dra|dr\(a\))\.?$/i.test(p));
  if (partes.length === 0) return "?";
  const pri = partes[0]![0] ?? "";
  const ult = partes.length > 1 ? (partes[partes.length - 1]![0] ?? "") : "";
  return (pri + ult).toUpperCase();
}

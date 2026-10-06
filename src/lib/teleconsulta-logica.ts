/**
 * Lógica PURA da teleconsulta (sem React, sem rede): usada pelo hook
 * use-teleconsulta.ts e testada em teleconsulta-logica.teste.ts.
 *
 *  - chaveCandidato / ConjuntoLimitado: deduplicação de candidatos ICE e de
 *    sinais que chegam duas vezes (Realtime + polling);
 *  - atrasoReconexao: espera crescente entre as tentativas de restartIce();
 *  - medirAmostra / classificarQualidade / QualidadeSuavizada: qualidade da
 *    chamada a partir do getStats() (RTT, perda e bitrate);
 *  - restricoesMidia / limitesEnvio: restrições do getUserMedia e teto de
 *    bitrate de vídeo por tipo de aparelho;
 *  - intervaloPolling: cadência do polling da sala;
 *  - lerForaDaJanela / esperaForaDaJanela / textoForaDaJanela /
 *    exibirForaDaJanela: resposta 409 do GET /sala (sala ainda não abriu ou
 *    já fechou) e a mensagem mostrada no lugar da área de espera.
 */

import { SALA_ABRE_ANTES_MIN, SALA_FECHA_DEPOIS_MIN } from "@/lib/janela-sala";

/* ------------------------------------------------------------------ */
/* Deduplicação                                                        */
/* ------------------------------------------------------------------ */

export type CandidatoIce = {
  candidate?: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

/**
 * Chave estável de um candidato ICE: o mesmo candidato que chega pelo
 * Realtime e pelo polling gera a mesma chave (ids diferentes, conteúdo igual).
 */
export function chaveCandidato(c: CandidatoIce): string {
  return [c.candidate ?? "", c.sdpMid ?? "", c.sdpMLineIndex ?? "", c.usernameFragment ?? ""].join("|");
}

/** Conjunto com teto de tamanho (descarta os mais antigos): memória limitada numa chamada longa. */
export class ConjuntoLimitado {
  private itens = new Set<string>();
  constructor(private readonly max = 500) {}
  /** Adiciona e devolve true se a chave é NOVA; false se já tinha sido vista. */
  adicionar(chave: string): boolean {
    if (this.itens.has(chave)) return false;
    this.itens.add(chave);
    if (this.itens.size > this.max) {
      const primeiro = this.itens.values().next().value;
      if (primeiro !== undefined) this.itens.delete(primeiro);
    }
    return true;
  }
  tem(chave: string): boolean {
    return this.itens.has(chave);
  }
  limpar(): void {
    this.itens.clear();
  }
  get tamanho(): number {
    return this.itens.size;
  }
}

/* ------------------------------------------------------------------ */
/* Reconexão                                                           */
/* ------------------------------------------------------------------ */

/** Espera depois de "disconnected" antes do primeiro restartIce (o ICE às vezes se recupera sozinho). */
export const ESPERA_DESCONECTADO_MS = 2_500;
/** Teto da espera entre tentativas (tentativas ilimitadas enquanto a sala está aberta). */
export const ATRASO_MAX_RECONEXAO_MS = 30_000;
/** Depois de tantos restartIce sem sucesso, recria a conexão do zero (sessão nova). */
export const TENTATIVAS_ANTES_DE_RECRIAR = 3;

/**
 * Espera antes da tentativa `n` (0 = primeira): 2,5 s · 5 s · 10 s · 20 s ·
 * 30 s · 30 s… com até 20% de variação aleatória (evita os dois lados
 * tentarem no mesmo instante). `aleatorio` é injetável para teste.
 */
export function atrasoReconexao(n: number, aleatorio: () => number = Math.random): number {
  const base = Math.min(ESPERA_DESCONECTADO_MS * 2 ** Math.max(0, n), ATRASO_MAX_RECONEXAO_MS);
  const variacao = base * 0.2 * (aleatorio() * 2 - 1);
  return Math.max(500, Math.round(base + variacao));
}

/* ------------------------------------------------------------------ */
/* Qualidade da chamada (getStats)                                     */
/* ------------------------------------------------------------------ */

export type Qualidade = "boa" | "fraca" | "ruim";

/** Contadores acumulados lidos do getStats() num instante. */
export type LeituraStats = {
  /** ms desde a época (timestamp da leitura). */
  t: number;
  /** RTT do par de candidatos ativo, em segundos (currentRoundTripTime). */
  rttS?: number | null;
  /** Soma de packetsReceived (inbound-rtp de áudio + vídeo). */
  recebidos: number;
  /** Soma de packetsLost (inbound-rtp de áudio + vídeo). */
  perdidos: number;
  /** Soma de bytesReceived (inbound-rtp). */
  bytesRecebidos: number;
  /** Perda informada pelo OUTRO lado sobre o que enviamos (remote-inbound-rtp.fractionLost, 0–1). */
  perdaRemota?: number | null;
};

export type Amostra = { rttMs: number | null; perda: number; kbps: number };

/** Amostra de qualidade entre duas leituras (perda = fração 0–1 no intervalo). */
export function medirAmostra(anterior: LeituraStats | null, atual: LeituraStats): Amostra {
  const rttMs = atual.rttS != null && Number.isFinite(atual.rttS) ? Math.round(atual.rttS * 1000) : null;
  if (!anterior) {
    return { rttMs, perda: Math.max(0, Math.min(1, atual.perdaRemota ?? 0)), kbps: 0 };
  }
  const dRec = Math.max(0, atual.recebidos - anterior.recebidos);
  const dPerd = Math.max(0, atual.perdidos - anterior.perdidos);
  const total = dRec + dPerd;
  const perdaLocal = total > 0 ? dPerd / total : 0;
  const perda = Math.max(perdaLocal, Math.max(0, Math.min(1, atual.perdaRemota ?? 0)));
  const dt = (atual.t - anterior.t) / 1000;
  const kbps = dt > 0 ? Math.round(((Math.max(0, atual.bytesRecebidos - anterior.bytesRecebidos) * 8) / dt) / 1000) : 0;
  return { rttMs, perda, kbps };
}

/** Limites (RTT em ms, perda em fração). */
export const LIMITES_QUALIDADE = {
  rttFracaMs: 300,
  rttRuimMs: 700,
  perdaFraca: 0.03,
  perdaRuim: 0.1,
} as const;

/** Classifica UMA amostra. Bitrate não entra: câmera desligada derruba o bitrate sem a rede estar ruim. */
export function classificarQualidade(a: Amostra): Qualidade {
  const L = LIMITES_QUALIDADE;
  if ((a.rttMs != null && a.rttMs >= L.rttRuimMs) || a.perda >= L.perdaRuim) return "ruim";
  if ((a.rttMs != null && a.rttMs >= L.rttFracaMs) || a.perda >= L.perdaFraca) return "fraca";
  return "boa";
}

/**
 * Suavização: piorar exige 2 amostras seguidas (4 s) e melhorar exige 3 (6 s),
 * para o aviso de "rede fraca" não piscar a cada oscilação.
 */
export class QualidadeSuavizada {
  private atual: Qualidade = "boa";
  private candidata: Qualidade = "boa";
  private seguidas = 0;
  get valor(): Qualidade {
    return this.atual;
  }
  registrar(q: Qualidade): Qualidade {
    if (q === this.atual) {
      this.candidata = q;
      this.seguidas = 0;
      return this.atual;
    }
    if (q === this.candidata) this.seguidas += 1;
    else {
      this.candidata = q;
      this.seguidas = 1;
    }
    const ordem: Record<Qualidade, number> = { boa: 0, fraca: 1, ruim: 2 };
    const precisa = ordem[q] > ordem[this.atual] ? 2 : 3;
    if (this.seguidas >= precisa) {
      this.atual = q;
      this.seguidas = 0;
    }
    return this.atual;
  }
  zerar(): void {
    this.atual = "boa";
    this.candidata = "boa";
    this.seguidas = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Mídia                                                               */
/* ------------------------------------------------------------------ */

/** Celular/tablet (pelo user agent; iPadOS se apresenta como Mac com toque). */
export function ehCelular(ua: string, maxTouchPoints = 0): boolean {
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

/** Restrições do getUserMedia: 720p no computador, 540p no celular, até 30 fps, câmera frontal e áudio tratado. */
export function restricoesMidia(celular: boolean): MediaStreamConstraints {
  return {
    video: {
      width: { ideal: celular ? 960 : 1280 },
      height: { ideal: celular ? 540 : 720 },
      frameRate: { ideal: 30, max: 30 },
      facingMode: "user",
    },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  };
}

/** Teto de envio de vídeo (bps): ~1,2 Mbps no computador, 600 kbps no celular. */
export function limitesEnvio(celular: boolean) {
  return { videoMaxBitrate: celular ? 600_000 : 1_200_000, videoMaxFramerate: 30 };
}

/* ------------------------------------------------------------------ */
/* Polling                                                             */
/* ------------------------------------------------------------------ */

export const POLL_RAPIDO_MS = 700;
export const POLL_PRESENCA_MS = 10_000;

/**
 * Cadência do polling da sala:
 *  - conectado + Realtime confirmado → 10 s (só presença; sinais chegam pelo Realtime);
 *  - conectado sem Realtime → 3 s (o polling é o único caminho dos sinais de renegociação);
 *  - negociando/reconectando sem Realtime → 700 ms; com Realtime → 2 s (rede de segurança);
 *  - esperando o outro entrar → 3 s com Realtime, 1,5 s sem.
 */
export function intervaloPolling(p: { conectado: boolean; realtimeConfirmado: boolean; outroNaSala: boolean }): number {
  if (p.conectado) return p.realtimeConfirmado ? POLL_PRESENCA_MS : 3_000;
  if (!p.outroNaSala) return p.realtimeConfirmado ? 3_000 : 1_500;
  return p.realtimeConfirmado ? 2_000 : POLL_RAPIDO_MS;
}

/* ------------------------------------------------------------------ */
/* Fora da janela da sala (409 do GET /sala)                           */
/* ------------------------------------------------------------------ */

/** Sala fora da janela (lib/janela-sala.ts): ainda não abriu ou já fechou. */
export type ForaDaJanela = {
  motivo: "antes" | "depois";
  /** ISO: quando a sala abre (motivo "antes"). */
  abreEm?: string;
  /** ISO: quando a sala fechou (motivo "depois"). */
  fechouEm?: string;
};

/** Teto da espera entre os GETs com a sala fora da janela. */
export const ESPERA_FORA_DA_JANELA_MS = 30_000;

const isoValido = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

/**
 * Lê o corpo do 409 do GET /sala:
 *   { erro, motivo: "antes", abreEm }  ou  { erro, motivo: "depois", fechouEm }.
 * Tolera servidor antigo (só `erro`): decide pelo texto ("ainda não abriu"
 * → antes; qualquer outro → depois).
 */
export function lerForaDaJanela(corpo: unknown): ForaDaJanela {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as {
    erro?: unknown;
    motivo?: unknown;
    abreEm?: unknown;
    fechouEm?: unknown;
  };
  const antes =
    c.motivo === "antes" ||
    (c.motivo !== "depois" && isoValido(c.abreEm)) ||
    (c.motivo === undefined && !isoValido(c.fechouEm) && typeof c.erro === "string" && /ainda não abriu/i.test(c.erro));
  if (antes) return isoValido(c.abreEm) ? { motivo: "antes", abreEm: c.abreEm } : { motivo: "antes" };
  return isoValido(c.fechouEm) ? { motivo: "depois", fechouEm: c.fechouEm } : { motivo: "depois" };
}

/** Mesmo conteúdo (evita re-render a cada GET repetido). */
export function mesmoForaDaJanela(a: ForaDaJanela | null, b: ForaDaJanela | null): boolean {
  if (a === null || b === null) return a === b;
  return a.motivo === b.motivo && a.abreEm === b.abreEm && a.fechouEm === b.fechouEm;
}

/**
 * Espera até o próximo GET com a sala fora da janela: 30 s; se a sala abre
 * antes disso, tenta 1 s depois da abertura (no mínimo 1 s). Com o relógio
 * do aparelho errado, o pior caso continua sendo 30 s.
 */
export function esperaForaDaJanela(f: ForaDaJanela, agora: number): number {
  if (f.motivo !== "antes" || !f.abreEm) return ESPERA_FORA_DA_JANELA_MS;
  const falta = Date.parse(f.abreEm) - agora + 1_000;
  return Math.min(ESPERA_FORA_DA_JANELA_MS, Math.max(1_000, falta));
}

const FUSO_SP = "America/Sao_Paulo";
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_SP, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_SP, day: "2-digit", month: "2-digit" });
const fmtDiaAno = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_SP, day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Textos da mensagem fora da janela (horário de São Paulo):
 *  - "A sala abre às 14:30" (hoje) · "A sala abre em 08/10 às 14:30" (outro dia);
 *  - "A sala já fechou".
 */
export function textoForaDaJanela(f: ForaDaJanela, agora: number): { titulo: string; detalhe: string } {
  if (f.motivo === "antes") {
    const detalhe =
      `A sala abre ${SALA_ABRE_ANTES_MIN} minutos antes do horário marcado. Pode deixar esta tela aberta: a chamada começa sozinha quando a sala abrir.`;
    if (!f.abreEm) return { titulo: "A sala ainda não abriu", detalhe };
    const abre = Date.parse(f.abreEm);
    const hora = fmtHora.format(abre);
    const mesmoDia = fmtDiaAno.format(abre) === fmtDiaAno.format(agora);
    return { titulo: mesmoDia ? `A sala abre às ${hora}` : `A sala abre em ${fmtDia.format(abre)} às ${hora}`, detalhe };
  }
  return {
    titulo: "A sala já fechou",
    detalhe: `A sala fica aberta até ${SALA_FECHA_DEPOIS_MIN / 60} horas depois do horário marcado. Se precisar de ajuda, fale com o suporte.`,
  };
}

/**
 * Mostra a mensagem no lugar da área de espera? Só fora de uma chamada em
 * andamento: se a janela fecha no meio da chamada, a chamada continua.
 */
export function exibirForaDaJanela(f: ForaDaJanela | null, status: string): f is ForaDaJanela {
  if (!f) return false;
  return status === "conectando" || status === "aguardando";
}

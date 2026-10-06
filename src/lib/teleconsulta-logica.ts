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
 *  - intervaloPolling: cadência do polling da sala.
 */

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

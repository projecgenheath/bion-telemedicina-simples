"use client";

import {
  ATRASO_MAX_RECONEXAO_MS,
  ConjuntoLimitado,
  ESPERA_DESCONECTADO_MS,
  QualidadeSuavizada,
  TENTATIVAS_ANTES_DE_RECRIAR,
  atrasoReconexao,
  chaveCandidato,
  classificarQualidade,
  ehCelular,
  intervaloPolling,
  limitesEnvio,
  medirAmostra,
  restricoesMidia,
  type LeituraStats,
  type Qualidade,
} from "@/lib/teleconsulta-logica";

/**
 * Motor da chamada de teleconsulta (WebRTC P2P), sem React. O hook
 * use-teleconsulta.ts cria uma instância por montagem da sala.
 *
 * Mídia: RTCPeerConnection nativa (DTLS-SRTP). ICE servers vêm de
 * GET /api/telemedicina/[id]/ice (Cloudflare TURN com credencial curta,
 * renovada perto de expirar com setConfiguration).
 *
 * Sinalização: POST /sala grava o sinal no banco e o servidor repassa pelo
 * Realtime PRIVADO (tópico entregue pelo GET /sala). O navegador só RECEBE
 * pelo Realtime; todo envio passa pelo servidor. O polling do GET /sala é a
 * rede de segurança: 700 ms enquanto o Realtime não provou que entrega
 * (eco), presença a cada 10 s com a chamada conectada.
 *
 * Sessões: cada montagem da sala gera um id de sessão. Quem entra manda
 * "entrei"; todo sinal leva `s` (sessão de quem manda) e `para` (sessão de
 * destino). Sinal de outra sessão do outro lado (página recarregada) recria a
 * conexão daqui; sinal endereçado a uma sessão antiga minha é descartado.
 *
 * Negociação "perfect negotiation" (padrão W3C): os dois lados podem
 * (re)negociar; numa colisão de ofertas o lado EDUCADO (médico) desfaz a
 * dele e o MAL-EDUCADO (paciente) ignora a oferta que chegou.
 *
 * Reconexão: restartIce() 2,5 s depois de "disconnected" e logo em
 * "failed", com espera crescente e tentativas ilimitadas enquanto a sala
 * estiver aberta; depois de 3 tentativas sem sucesso, recria a conexão do
 * zero (sessão nova). Também reage a `online`, troca de rede
 * (navigator.connection), volta da aba (visibilitychange) e fim de track
 * (câmera/microfone desconectados → captura de novo).
 */

export type StatusSala =
  | "conectando" // obtendo mídia
  | "aguardando" // pronto, aguardando o outro participante
  | "conectando-p2p" // SDP trocado, ICE em progresso
  | "conectado" // mídia fluindo P2P
  | "instavel" // conexão caiu, tentando recuperar
  | "encerrada" // o médico encerrou (ou eu saí)
  | "indisponivel"; // reservado

export type MsgChat = { id: string; minha: boolean; texto: string; hora: string };

export type EstadoChamada = {
  status: StatusSala;
  outroOnline: boolean;
  /** O outro participante saiu da chamada (pode voltar enquanto a sala estiver aberta). */
  outroSaiu: boolean;
  erroMidia: string | null;
  micAtivo: boolean;
  camAtivo: boolean;
  compartilhando: boolean;
  chat: MsgChat[];
  localPronto: boolean;
  remotoPronto: boolean;
  qualidade: Qualidade;
  reconectando: boolean;
};

export const ESTADO_INICIAL: EstadoChamada = {
  status: "conectando",
  outroOnline: false,
  outroSaiu: false,
  erroMidia: null,
  micAtivo: true,
  camAtivo: true,
  compartilhando: false,
  chat: [],
  localPronto: false,
  remotoPronto: false,
  qualidade: "boa",
  reconectando: false,
};

type SinalApi = { id: string; tipo: string; payload: string; createdAt: string };

type RespostaSala = {
  consulta: { id: string; status: string };
  eu: { id: string; papel: "PACIENTE" | "MEDICO" };
  outroOnline: boolean;
  canal?: string;
  sinais: SinalApi[];
};

/** Envelope dos sinais desta versão (dentro do `payload` JSON). */
type Envelope = {
  s?: string;
  para?: string;
  sdp?: RTCSessionDescriptionInit;
  acao?: string;
  motivo?: string;
  texto?: string;
  resposta?: boolean;
};

type CandidatoComSessao = RTCIceCandidateInit & { s?: string; para?: string };

const JANELA_BATCH_CANDIDATOS_MS = 200;
const INTERVALO_STATS_MS = 2_000;
const INTERVALO_ERRO_MS = 4_000;
/** Reenvia "entrei" se o outro está na sala e ainda não respondeu. */
const REENVIO_ENTREI_MS = 6_000;
/** Renovação da credencial TURN: 10 min antes de expirar. */
const ANTECEDENCIA_RENOVACAO_ICE_MS = 10 * 60_000;
const ICE_RESERVA: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

const log = (...a: unknown[]) => console.info("[teleconsulta]", ...a);
const aviso = (...a: unknown[]) => console.warn("[teleconsulta]", ...a);
const erro = (...a: unknown[]) => console.error("[teleconsulta]", ...a);

function novoId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  }
}

function horaAgora(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

type NetworkInformationLike = EventTarget & { type?: string; effectiveType?: string };

export class ChamadaTeleconsulta {
  private readonly base: string;
  private sessao = novoId();
  private papel: "PACIENTE" | "MEDICO" | null = null;
  private meuId: string | null = null;
  private remoto: string | null = null;
  private readonly sessoesMortas = new ConjuntoLimitado(50);
  private readonly sinaisVistos = new ConjuntoLimitado(800);
  private candidatosVistos = new ConjuntoLimitado(400);
  private candidatosPendentes: CandidatoComSessao[] = [];

  private pc: RTCPeerConnection | null = null;
  private fazendoOferta = false;
  private ignorandoOferta = false;
  private aplicandoResposta = false;

  private iceServers: RTCIceServer[] = ICE_RESERVA;
  private iceExpiraEm = 0;
  private iceCarregado = false;
  private timerIce: ReturnType<typeof setTimeout> | null = null;

  private midiaResolvida = false;
  private readonly celular: boolean;
  private displayStream: MediaStream | null = null;

  private vivo = true;
  private encerrada = false;
  private anunciado = false;
  private ultimoEntrei = 0;
  private timerPoll: ReturnType<typeof setTimeout> | null = null;
  private pollEmAndamento = false;
  private timerReconexao: ReturnType<typeof setTimeout> | null = null;
  private tentativas = 0;
  private timerStats: ReturnType<typeof setInterval> | null = null;
  private leituraAnterior: LeituraStats | null = null;
  private readonly qualidade = new QualidadeSuavizada();
  private filaCandidatos: CandidatoComSessao[] = [];
  private timerFila: ReturnType<typeof setTimeout> | null = null;

  private canal: string | null = null;
  private realtimeConfirmado = false;
  private limparRealtime: (() => void) | null = null;
  private nonceEco: string | null = null;
  private tentativasRealtime = 0;
  private timerRealtime: ReturnType<typeof setTimeout> | null = null;
  private timerToken: ReturnType<typeof setInterval> | null = null;

  private readonly limpadores: (() => void)[] = [];
  private estado: EstadoChamada = { ...ESTADO_INICIAL };

  constructor(
    private readonly consultaId: string,
    private readonly streamLocal: { current: MediaStream | null },
    private readonly streamRemoto: { current: MediaStream | null },
    private readonly aoMudar: (e: EstadoChamada) => void,
  ) {
    this.base = `/api/telemedicina/${encodeURIComponent(consultaId)}`;
    this.celular = typeof navigator !== "undefined" && ehCelular(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    // Só fora de produção: permite inspecionar a chamada pelo console / testes automatizados.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as { __teleconsulta?: ChamadaTeleconsulta }).__teleconsulta = this;
    }
  }

  /* ================================================================ */
  /* Ciclo de vida                                                     */
  /* ================================================================ */

  iniciar(): void {
    log("iniciando sala", { consulta: this.consultaId, sessao: this.sessao, celular: this.celular });
    void this.obterMidia();
    void this.carregarIce();
    void this.ciclo();
    this.ouvirAmbiente();
  }

  /** Desmontagem do componente (troca de página, fechar aba). */
  destruir(): void {
    if (!this.vivo) return;
    if (!this.encerrada) this.avisarSaida("navegacao");
    this.vivo = false;
    this.limparTudo();
  }

  private limparTudo(): void {
    for (const t of [this.timerPoll, this.timerReconexao, this.timerIce, this.timerFila, this.timerRealtime]) {
      if (t) clearTimeout(t);
    }
    if (this.timerStats) clearInterval(this.timerStats);
    if (this.timerToken) clearInterval(this.timerToken);
    this.timerPoll = this.timerReconexao = this.timerIce = this.timerFila = this.timerRealtime = null;
    this.timerStats = this.timerToken = null;
    this.limparRealtime?.();
    this.limparRealtime = null;
    this.limpadores.splice(0).forEach((f) => f());
    this.fecharPC();
    this.displayStream?.getTracks().forEach((t) => t.stop());
    this.displayStream = null;
    this.streamLocal.current?.getTracks().forEach((t) => t.stop());
  }

  private set(parcial: Partial<EstadoChamada>): void {
    this.estado = { ...this.estado, ...parcial };
    if (this.vivo) this.aoMudar(this.estado);
  }

  /* ================================================================ */
  /* Mídia local                                                       */
  /* ================================================================ */

  private async capturar(): Promise<MediaStream | null> {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) return null;
    const ideal = restricoesMidia(this.celular);
    const tentativas: MediaStreamConstraints[] = [
      ideal,
      { video: { facingMode: "user" }, audio: ideal.audio },
      { video: false, audio: ideal.audio },
      { video: false, audio: true },
    ];
    for (const c of tentativas) {
      try {
        return await md.getUserMedia(c);
      } catch (e) {
        aviso("getUserMedia recusou", { restricoes: c.video ? "com vídeo" : "só áudio", erro: (e as Error)?.name, msg: (e as Error)?.message });
      }
    }
    return null;
  }

  private async obterMidia(): Promise<void> {
    const stream = await this.capturar();
    if (!this.vivo) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    this.midiaResolvida = true;
    if (!stream) {
      this.set({
        erroMidia:
          "Não foi possível acessar câmera e microfone (permissão negada, bloqueada pelo navegador ou dispositivo em uso por outro app). A consulta continua; peça ao outro participante para confirmar o áudio.",
        status: this.estado.status === "conectando" ? "aguardando" : this.estado.status,
      });
      this.talvezAnunciar();
      return;
    }
    this.prepararTracks(stream);
    this.streamLocal.current = stream;
    const soAudio = stream.getVideoTracks().length === 0;
    this.set({
      localPronto: true,
      camAtivo: !soAudio,
      erroMidia: soAudio ? "Câmera indisponível — participando com áudio." : null,
      status: this.estado.status === "conectando" ? "aguardando" : this.estado.status,
    });
    this.talvezAnunciar();
  }

  private prepararTracks(stream: MediaStream): void {
    for (const t of stream.getTracks()) {
      try {
        if (t.kind === "audio") t.contentHint = "speech";
        else t.contentHint = "motion";
      } catch {
        /* contentHint não suportado */
      }
      t.addEventListener("ended", () => void this.recapturar(t.kind as "audio" | "video", "ended"));
    }
  }

  /** Câmera/microfone caíram (desconectados, iOS em segundo plano): captura de novo e troca no envio. */
  private async recapturar(tipo: "audio" | "video", motivo: string): Promise<void> {
    if (!this.vivo || this.encerrada) return;
    const local = this.streamLocal.current;
    if (!local) return;
    const atual = tipo === "audio" ? local.getAudioTracks()[0] : local.getVideoTracks()[0];
    if (atual && atual.readyState === "live") return;
    log("recapturando mídia", { tipo, motivo });
    const ideal = restricoesMidia(this.celular);
    try {
      const novo = await navigator.mediaDevices.getUserMedia(
        tipo === "audio" ? { audio: ideal.audio, video: false } : { video: ideal.video, audio: false },
      );
      const track = novo.getTracks()[0];
      if (!track || !this.vivo) {
        novo.getTracks().forEach((t) => t.stop());
        return;
      }
      this.prepararTracks(novo);
      if (atual) local.removeTrack(atual);
      track.enabled = tipo === "audio" ? this.estado.micAtivo : this.estado.camAtivo;
      local.addTrack(track);
      const alvo = this.senderDe(tipo);
      if (alvo && !(tipo === "video" && this.displayStream)) await alvo.replaceTrack(track);
      // Força o <video> local a reler o stream
      this.set({ localPronto: false });
      this.set({ localPronto: true });
    } catch (e) {
      erro("falha ao recapturar mídia", { tipo, motivo, erro: (e as Error)?.name, msg: (e as Error)?.message });
    }
  }

  /* ================================================================ */
  /* ICE servers (Cloudflare TURN)                                     */
  /* ================================================================ */

  private async carregarIce(): Promise<void> {
    try {
      const res = await fetch(`${this.base}/ice`, { cache: "no-store" });
      if (!res.ok) throw new Error(`ice ${res.status}`);
      const j = (await res.json()) as { iceServers?: RTCIceServer[]; expiraEm?: string; fonte?: string };
      if (!this.vivo) return;
      if (Array.isArray(j.iceServers) && j.iceServers.length > 0) {
        this.iceServers = j.iceServers;
        this.iceExpiraEm = j.expiraEm ? Date.parse(j.expiraEm) : Date.now() + 3_600_000;
        log("ICE servers carregados", { fonte: j.fonte, expiraEm: j.expiraEm });
        if (this.pc) {
          try {
            this.pc.setConfiguration({ ...this.pc.getConfiguration(), iceServers: this.iceServers });
            // Credencial nova com a conexão ruim: tenta de novo já com o TURN.
            if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") this.pc.restartIce();
          } catch (e) {
            erro("setConfiguration falhou", e);
          }
        }
      }
      const proxima = Math.max(60_000, this.iceExpiraEm - Date.now() - ANTECEDENCIA_RENOVACAO_ICE_MS);
      this.timerIce = setTimeout(() => void this.carregarIce(), proxima);
    } catch (e) {
      aviso("não consegui carregar os ICE servers; usando STUN de reserva e tentando de novo em 30 s", e);
      if (this.vivo) this.timerIce = setTimeout(() => void this.carregarIce(), 30_000);
    } finally {
      this.iceCarregado = true;
      this.talvezAnunciar();
    }
  }

  /* ================================================================ */
  /* Sinalização: envio                                                */
  /* ================================================================ */

  private async postar(corpo: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/sala`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { erro?: string } | null;
        aviso("sinal recusado pelo servidor", { status: res.status, tipo: corpo.tipo ?? corpo.acao, erro: j?.erro });
        return false;
      }
      return true;
    } catch (e) {
      aviso("falha de rede ao enviar sinal", { tipo: corpo.tipo ?? corpo.acao, erro: (e as Error)?.message });
      return false;
    }
  }

  private enviar(tipo: string, dados: Envelope | CandidatoComSessao[]): Promise<boolean> {
    return this.postar({ acao: "sinal", tipo, payload: JSON.stringify(dados) });
  }

  /** Saída sem esperar resposta (fechar aba / recarregar): sendBeacon sobrevive ao fim da página. */
  private avisarSaida(motivo: "navegacao" | "botao"): void {
    const corpo = JSON.stringify({ acao: "sinal", tipo: "controle", payload: JSON.stringify({ acao: "saiu", s: this.sessao, motivo }) });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const ok = navigator.sendBeacon(`${this.base}/sala`, new Blob([corpo], { type: "application/json" }));
        if (ok) return;
      }
    } catch {
      /* cai no fetch keepalive */
    }
    void fetch(`${this.base}/sala`, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, keepalive: true }).catch(() => {});
  }

  private talvezAnunciar(): void {
    if (this.anunciado || !this.vivo || this.encerrada) return;
    if (!this.midiaResolvida || !this.papel || !this.iceCarregado) return;
    this.anunciado = true;
    this.anunciarEntrada(false);
  }

  private anunciarEntrada(resposta: boolean): void {
    this.ultimoEntrei = Date.now();
    log("anunciando entrada", { sessao: this.sessao, resposta, para: this.remoto });
    void this.enviar("controle", { acao: "entrei", s: this.sessao, ...(this.remoto ? { para: this.remoto } : {}), ...(resposta ? { resposta: true } : {}) });
  }

  /** Micro-batch: candidatos de uma rajada (200 ms) viram UM POST (até 24 por lote). */
  private enfileirarCandidato(c: RTCIceCandidate): void {
    if (!this.remoto) return;
    this.filaCandidatos.push({ ...c.toJSON(), s: this.sessao, para: this.remoto });
    this.agendarFila();
  }

  private agendarFila(): void {
    if (this.timerFila) return;
    this.timerFila = setTimeout(() => {
      this.timerFila = null;
      const lote = this.filaCandidatos.splice(0, 24);
      if (lote.length > 0 && this.vivo) void this.enviar("candidato", lote);
      if (this.filaCandidatos.length > 0) this.agendarFila();
    }, JANELA_BATCH_CANDIDATOS_MS);
  }

  /* ================================================================ */
  /* RTCPeerConnection                                                 */
  /* ================================================================ */

  private get educado(): boolean {
    return this.papel === "MEDICO";
  }

  private fecharPC(): void {
    const pc = this.pc;
    this.pc = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        /* já fechada */
      }
    }
    if (this.timerReconexao) clearTimeout(this.timerReconexao);
    this.timerReconexao = null;
    if (this.timerStats) clearInterval(this.timerStats);
    this.timerStats = null;
    this.leituraAnterior = null;
    this.fazendoOferta = false;
    this.ignorandoOferta = false;
    this.aplicandoResposta = false;
    this.filaCandidatos = [];
    if (this.timerFila) clearTimeout(this.timerFila);
    this.timerFila = null;
    this.streamRemoto.current = null;
    if (this.estado.remotoPronto) this.set({ remotoPronto: false });
  }

  /** Cria a conexão para a sessão remota atual. As tracks locais disparam a negociação. */
  private criarPC(): RTCPeerConnection {
    this.fecharPC();
    this.candidatosVistos = new ConjuntoLimitado(400);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle", iceCandidatePoolSize: 2 });
    this.pc = pc;
    const remoto = new MediaStream();
    this.streamRemoto.current = remoto;

    const local = this.streamLocal.current;
    const audio = local?.getAudioTracks()[0];
    const video = this.displayStream?.getVideoTracks()[0] ?? local?.getVideoTracks()[0];
    // Sempre um transceiver de áudio e um de vídeo (mesmo sem câmera): a
    // câmera religada depois entra por replaceTrack, sem renegociar.
    if (audio && local) pc.addTrack(audio, local);
    else pc.addTransceiver("audio", { direction: "recvonly" });
    if (video && local) pc.addTrack(video, local);
    else pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (ev) => {
      if (pc !== this.pc) return;
      const tracks = ev.streams[0]?.getTracks() ?? [ev.track];
      for (const t of tracks) if (!remoto.getTracks().some((x) => x.id === t.id)) remoto.addTrack(t);
      this.set({ remotoPronto: false });
      this.set({ remotoPronto: true, outroSaiu: false });
    };

    pc.onicecandidate = (ev) => {
      if (pc !== this.pc || !ev.candidate || !this.vivo) return;
      this.enfileirarCandidato(ev.candidate);
    };

    pc.onnegotiationneeded = async () => {
      if (pc !== this.pc || !this.remoto || pc.signalingState !== "stable") return;
      try {
        this.fazendoOferta = true;
        await pc.setLocalDescription();
        if (pc !== this.pc || !pc.localDescription) return;
        await this.enviar("oferta", { s: this.sessao, para: this.remoto, sdp: pc.localDescription.toJSON() });
      } catch (e) {
        erro("falha ao criar a oferta", { sessao: this.sessao, estado: pc.signalingState, erro: (e as Error)?.message });
      } finally {
        this.fazendoOferta = false;
      }
    };

    const aoMudarConexao = () => {
      if (pc !== this.pc || !this.vivo) return;
      const estado = pc.connectionState ?? pc.iceConnectionState;
      const ice = pc.iceConnectionState;
      if (estado === "connected" || ice === "connected" || ice === "completed") {
        this.aoConectar();
      } else if (estado === "disconnected" || ice === "disconnected") {
        this.aoCair("disconnected");
      } else if (estado === "failed" || ice === "failed") {
        this.aoCair("failed");
      }
    };
    pc.onconnectionstatechange = aoMudarConexao;
    pc.oniceconnectionstatechange = aoMudarConexao;
    return pc;
  }

  /** Nova sessão do outro lado (entrou agora ou recarregou a página). */
  private adotarRemoto(sessaoRemota: string, motivo: string): void {
    if (this.remoto && this.remoto !== sessaoRemota) this.sessoesMortas.adicionar(this.remoto);
    log("nova sessão do outro participante", { remota: sessaoRemota, anterior: this.remoto, motivo });
    this.remoto = sessaoRemota;
    this.tentativas = 0;
    this.qualidade.zerar();
    this.set({ outroSaiu: false, outroOnline: true, status: "conectando-p2p", reconectando: false, qualidade: "boa" });
    this.criarPC();
    // Candidatos que chegaram antes da oferta (Realtime fora de ordem)
    const pendentes = this.candidatosPendentes.filter((c) => c.s === sessaoRemota);
    this.candidatosPendentes = pendentes;
  }

  private aoConectar(): void {
    if (this.timerReconexao) clearTimeout(this.timerReconexao);
    this.timerReconexao = null;
    if (this.tentativas > 0) log("conexão recuperada", { tentativas: this.tentativas });
    this.tentativas = 0;
    this.set({ status: "conectado", reconectando: false, outroSaiu: false });
    void this.aplicarParametros();
    if (!this.timerStats) this.timerStats = setInterval(() => void this.medirQualidade(), INTERVALO_STATS_MS);
  }

  private aoCair(tipo: "disconnected" | "failed"): void {
    if (this.encerrada) return;
    aviso("conexão instável", { tipo, tentativas: this.tentativas });
    this.set({ status: "instavel", reconectando: true });
    if (tipo === "failed") {
      // "failed" não espera os 2,5 s do "disconnected": a primeira tentativa sai já.
      if (this.timerReconexao) clearTimeout(this.timerReconexao);
      this.timerReconexao = null;
      this.agendarReconexao(this.tentativas === 0 ? 300 : undefined);
    } else {
      this.agendarReconexao();
    }
  }

  private agendarReconexao(esperaForcada?: number): void {
    if (this.timerReconexao || !this.vivo || this.encerrada) return;
    const espera =
      esperaForcada ??
      (this.tentativas === 0 ? ESPERA_DESCONECTADO_MS : atrasoReconexao(this.tentativas)) + (this.educado ? 700 : 0);
    this.timerReconexao = setTimeout(() => {
      this.timerReconexao = null;
      void this.tentarReconectar();
    }, Math.min(espera, ATRASO_MAX_RECONEXAO_MS + 1_000));
  }

  private async tentarReconectar(): Promise<void> {
    const pc = this.pc;
    if (!this.vivo || this.encerrada || !pc || !this.remoto) return;
    const st = pc.connectionState;
    if (st === "connected") return this.aoConectar();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Sem rede: espera o evento "online" (ou tenta de novo mais tarde).
      this.agendarReconexao(5_000);
      return;
    }
    if (!this.estado.outroOnline) {
      // O outro não dá sinal de vida: não adianta renegociar. Ele manda
      // "entrei" quando voltar (e a conexão é recriada).
      this.set({ status: "aguardando", reconectando: false });
      this.agendarReconexao(5_000);
      return;
    }
    this.tentativas += 1;
    if (this.tentativas > TENTATIVAS_ANTES_DE_RECRIAR) {
      this.recriarDoZero("restartIce não recuperou");
      return;
    }
    log("restartIce", { tentativa: this.tentativas, estado: st, ice: pc.iceConnectionState });
    try {
      pc.restartIce();
    } catch (e) {
      erro("restartIce falhou", e);
    }
    this.agendarReconexao();
  }

  /** Último recurso: sessão nova daqui → o outro lado recria a conexão também. */
  private recriarDoZero(motivo: string): void {
    const anterior = this.sessao;
    this.sessao = novoId();
    this.tentativas = 0;
    log("recriando a conexão do zero", { motivo, sessaoAnterior: anterior, sessaoNova: this.sessao });
    this.sessoesMortas.adicionar(anterior);
    if (this.remoto) {
      this.criarPC();
      this.set({ status: "conectando-p2p", reconectando: true });
    }
    this.anunciarEntrada(false);
    this.agendarReconexao(atrasoReconexao(2));
  }

  /** Prioridade de áudio, teto de bitrate de vídeo e preferência de degradação. */
  private async aplicarParametros(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    const lim = limitesEnvio(this.celular);
    for (const sender of pc.getSenders()) {
      const kind = sender.track?.kind;
      if (!kind) continue;
      try {
        const p = sender.getParameters();
        if (!p.encodings || p.encodings.length === 0) continue;
        if (kind === "audio") {
          p.encodings = p.encodings.map((e) => ({ ...e, priority: "high", networkPriority: "high" }));
        } else {
          p.encodings = p.encodings.map((e) => ({
            ...e,
            maxBitrate: lim.videoMaxBitrate,
            maxFramerate: lim.videoMaxFramerate,
            priority: "medium",
            networkPriority: "medium",
          }));
          (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = this.displayStream
            ? "maintain-resolution"
            : "balanced";
        }
        await sender.setParameters(p);
      } catch (e) {
        aviso("setParameters não aplicado", { kind, erro: (e as Error)?.message });
      }
    }
  }

  private async medirQualidade(): Promise<void> {
    const pc = this.pc;
    if (!pc || pc.connectionState !== "connected") return;
    try {
      const stats = await pc.getStats();
      let rttS: number | null = null;
      let recebidos = 0;
      let perdidos = 0;
      let bytes = 0;
      let perdaRemota = 0;
      let parSelecionado: string | undefined;
      stats.forEach((r) => {
        if (r.type === "transport" && r.selectedCandidatePairId) parSelecionado = r.selectedCandidatePairId;
      });
      stats.forEach((r) => {
        if (r.type === "candidate-pair") {
          const ativo = parSelecionado ? r.id === parSelecionado : r.nominated && r.state === "succeeded";
          if (ativo && typeof r.currentRoundTripTime === "number") rttS = r.currentRoundTripTime;
        } else if (r.type === "inbound-rtp") {
          recebidos += r.packetsReceived ?? 0;
          perdidos += Math.max(0, r.packetsLost ?? 0);
          bytes += r.bytesReceived ?? 0;
        } else if (r.type === "remote-inbound-rtp" && typeof r.fractionLost === "number") {
          perdaRemota = Math.max(perdaRemota, r.fractionLost);
        }
      });
      const leitura: LeituraStats = { t: Date.now(), rttS, recebidos, perdidos, bytesRecebidos: bytes, perdaRemota };
      const amostra = medirAmostra(this.leituraAnterior, leitura);
      this.leituraAnterior = leitura;
      const q = this.qualidade.registrar(classificarQualidade(amostra));
      if (q !== this.estado.qualidade) {
        log("qualidade da chamada", { qualidade: q, ...amostra });
        this.set({ qualidade: q });
      }
    } catch (e) {
      aviso("getStats falhou", (e as Error)?.message);
    }
  }

  /* ================================================================ */
  /* Sinalização: recebimento                                          */
  /* ================================================================ */

  private async processar(sinal: SinalApi): Promise<void> {
    if (!this.vivo) return;
    if (sinal.id && !this.sinaisVistos.adicionar(sinal.id)) return;
    let dado: unknown;
    try {
      dado = JSON.parse(sinal.payload);
    } catch {
      aviso("sinal com payload inválido descartado", { tipo: sinal.tipo });
      return;
    }

    if (sinal.tipo === "chat") {
      const m = dado as Envelope;
      if (!m?.texto || m.s === this.sessao) return;
      this.set({ chat: [...this.estado.chat, { id: sinal.id, minha: false, texto: m.texto, hora: horaAgora(sinal.createdAt) }] });
      return;
    }

    if (sinal.tipo === "candidato") {
      const lista = (Array.isArray(dado) ? dado : [dado]) as CandidatoComSessao[];
      for (const c of lista) await this.receberCandidato(c);
      return;
    }

    const env = dado as Envelope;
    const de = env?.s;
    if (!de) return; // formato antigo (cliente de antes desta versão): ignora
    if (de === this.sessao) return;
    if (env.para && env.para !== this.sessao) return; // para uma sessão antiga minha
    if (this.sessoesMortas.tem(de)) return;

    if (sinal.tipo === "controle") return this.receberControle(env, de);
    if (sinal.tipo === "oferta" || sinal.tipo === "resposta") return this.receberDescricao(env, de);
  }

  private receberControle(env: Envelope, de: string): void {
    if (env.acao === "entrei") {
      if (this.encerrada) return;
      if (this.remoto === de) return;
      this.adotarRemoto(de, "entrei");
      // Responde para o outro lado saber da minha sessão (nunca responde a uma resposta).
      if (!env.resposta) this.anunciarEntrada(true);
      return;
    }
    if (env.acao === "saiu") {
      if (this.remoto !== de && this.remoto !== null) return;
      log("o outro participante saiu da chamada", { sessao: de, motivo: env.motivo });
      this.sessoesMortas.adicionar(de);
      this.remoto = null;
      this.fecharPC();
      this.candidatosPendentes = [];
      if (!this.encerrada) this.set({ status: "aguardando", outroSaiu: true, outroOnline: false, reconectando: false });
      return;
    }
    if (env.acao === "encerrada") {
      log("o médico encerrou a chamada");
      this.encerrada = true;
      this.remoto = null;
      this.fecharPC();
      if (this.timerPoll) clearTimeout(this.timerPoll);
      this.timerPoll = null;
      this.limparRealtime?.();
      this.limparRealtime = null;
      this.set({ status: "encerrada", reconectando: false });
    }
  }

  private async receberDescricao(env: Envelope, de: string): Promise<void> {
    const desc = env.sdp;
    if (!desc?.type || this.encerrada) return;
    if (this.remoto !== de) {
      if (desc.type !== "offer") return; // resposta de uma sessão que não é a atual
      this.adotarRemoto(de, "oferta");
    }
    const pc = this.pc ?? this.criarPC();
    if (pc.signalingState === "closed") {
      // Minha conexão morreu e a oferta é para ela: recomeça com sessão nova.
      this.recriarDoZero("oferta para uma conexão fechada");
      return;
    }
    try {
      const prontoParaOferta = !this.fazendoOferta && (pc.signalingState === "stable" || this.aplicandoResposta);
      const colisao = desc.type === "offer" && !prontoParaOferta;
      this.ignorandoOferta = !this.educado && colisao;
      if (this.ignorandoOferta) {
        log("colisão de ofertas: ignorando a do outro lado (sou o lado mal-educado)");
        return;
      }
      if (desc.type === "answer" && pc.signalingState !== "have-local-offer") return; // resposta repetida
      this.aplicandoResposta = desc.type === "answer";
      await pc.setRemoteDescription(desc); // rollback implícito do lado educado numa colisão
      this.aplicandoResposta = false;
      await this.aplicarCandidatosPendentes();
      if (desc.type === "offer") {
        await pc.setLocalDescription();
        if (pc !== this.pc || !pc.localDescription) return;
        await this.enviar("resposta", { s: this.sessao, para: de, sdp: pc.localDescription.toJSON() });
      }
      if (this.estado.status !== "conectado") this.set({ status: this.estado.status === "instavel" ? "instavel" : "conectando-p2p" });
    } catch (e) {
      this.aplicandoResposta = false;
      erro("falha ao aplicar descrição remota", { tipo: desc.type, estado: pc.signalingState, erro: (e as Error)?.message });
    }
  }

  private async receberCandidato(c: CandidatoComSessao): Promise<void> {
    if (!c || typeof c !== "object") return;
    if (!c.s || c.s === this.sessao) return; // formato antigo / eco
    if (c.para && c.para !== this.sessao) return;
    if (this.sessoesMortas.tem(c.s)) return;
    const chave = `${c.s}|${chaveCandidato(c)}`;
    if (this.candidatosVistos.tem(chave)) return;
    const pc = this.pc;
    if (!pc || this.remoto !== c.s || !pc.remoteDescription) {
      if (!this.candidatosPendentes.some((x) => x.s === c.s && chaveCandidato(x) === chaveCandidato(c))) {
        this.candidatosPendentes.push(c);
        if (this.candidatosPendentes.length > 100) this.candidatosPendentes.shift();
      }
      return;
    }
    this.candidatosVistos.adicionar(chave);
    const { s: _s, para: _p, ...init } = c;
    void _s;
    void _p;
    try {
      await pc.addIceCandidate(init);
    } catch (e) {
      if (!this.ignorandoOferta) aviso("candidato ICE recusado", { erro: (e as Error)?.message });
    }
  }

  private async aplicarCandidatosPendentes(): Promise<void> {
    const pendentes = this.candidatosPendentes.filter((c) => c.s === this.remoto);
    this.candidatosPendentes = this.candidatosPendentes.filter((c) => c.s !== this.remoto);
    for (const c of pendentes) await this.receberCandidato(c);
  }

  /* ================================================================ */
  /* Polling (presença + sinais)                                       */
  /* ================================================================ */

  /** Agenda o próximo GET (ou adianta, com `agora`). */
  private agendarPoll(ms?: number): void {
    if (!this.vivo || this.encerrada) return;
    if (this.timerPoll) clearTimeout(this.timerPoll);
    const intervalo =
      ms ??
      intervaloPolling({
        conectado: this.estado.status === "conectado",
        realtimeConfirmado: this.realtimeConfirmado,
        outroNaSala: this.estado.outroOnline || this.remoto !== null,
      });
    this.timerPoll = setTimeout(() => void this.ciclo(), intervalo);
  }

  private async ciclo(): Promise<void> {
    if (!this.vivo || this.pollEmAndamento) return;
    this.pollEmAndamento = true;
    let proximo: number | undefined;
    try {
      const res = await fetch(`${this.base}/sala`, { cache: "no-store" });
      if (res.status === 409) {
        const j = (await res.json().catch(() => null)) as { erro?: string } | null;
        aviso("sala fora da janela", j?.erro);
        proximo = 30_000;
        return;
      }
      if (!res.ok) throw new Error(`sala ${res.status}`);
      const dados = (await res.json()) as RespostaSala;
      if (!this.vivo) return;
      this.papel = dados.eu.papel;
      this.meuId = dados.eu.id;
      if (dados.outroOnline !== this.estado.outroOnline) this.set({ outroOnline: dados.outroOnline });
      if (dados.canal && dados.canal !== this.canal) this.assinarRealtime(dados.canal);
      this.talvezAnunciar();
      for (const s of dados.sinais) await this.processar(s);
      // Conexão fechada por baixo (navegador derrubou): recria do zero.
      if (this.remoto && this.pc && this.pc.signalingState === "closed" && !this.encerrada) {
        this.recriarDoZero("conexão fechada pelo navegador");
      }
      // O outro está na sala, mas ainda não nos conhecemos: reanuncia.
      if (this.anunciado && !this.encerrada && !this.remoto && dados.outroOnline && Date.now() - this.ultimoEntrei > REENVIO_ENTREI_MS) {
        this.anunciarEntrada(false);
      }
    } catch (e) {
      aviso("polling da sala falhou", (e as Error)?.message);
      proximo = INTERVALO_ERRO_MS;
    } finally {
      this.pollEmAndamento = false;
      this.agendarPoll(proximo);
    }
  }

  /* ================================================================ */
  /* Realtime privado (só recebe)                                      */
  /* ================================================================ */

  private assinarRealtime(canal: string): void {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    this.limparRealtime?.();
    this.limparRealtime = null;
    this.canal = canal;
    this.realtimeConfirmado = false;
    void (async () => {
      try {
        const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
        const sb = createSupabaseBrowserClient();
        // Token do usuário (cookie renovado pelo middleware a cada request).
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          aviso("sem sessão do Supabase Auth: Realtime privado indisponível, seguindo só com polling");
          return;
        }
        await sb.realtime.setAuth(token);
        if (!this.vivo || this.canal !== canal) return;
        const ch = sb
          .channel(canal, { config: { private: true, broadcast: { self: false } } })
          .on("broadcast", { event: "sinal" }, ({ payload }) => this.aoRealtimeSinal(payload))
          .on("broadcast", { event: "presenca" }, ({ payload }) => {
            const p = payload as { usuarioId?: string; online?: boolean } | null;
            if (p?.online && p.usuarioId !== this.meuId && !this.estado.outroOnline) {
              this.set({ outroOnline: true });
              this.agendarPoll(0);
            }
          })
          .on("broadcast", { event: "eco" }, ({ payload }) => {
            const p = payload as { nonce?: string } | null;
            if (p?.nonce && p.nonce === this.nonceEco && !this.realtimeConfirmado) {
              this.realtimeConfirmado = true;
              this.tentativasRealtime = 0;
              log("Realtime privado confirmado (eco recebido)");
              this.agendarPoll();
            }
          })
          .subscribe((status, err) => {
            if (!this.vivo || this.canal !== canal) return;
            if (status === "SUBSCRIBED") {
              this.nonceEco = novoId();
              void this.postar({ acao: "eco", nonce: this.nonceEco });
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              if (this.realtimeConfirmado || status !== "CLOSED") aviso("Realtime da sala caiu", { status, erro: err?.message });
              this.realtimeConfirmado = false;
              this.agendarPoll(0);
              if (status !== "CLOSED") this.reassinarRealtimeDepois();
            }
          });
        // Mantém o token do canal válido (o JWT expira; o canal cai sem um novo).
        if (this.timerToken) clearInterval(this.timerToken);
        this.timerToken = setInterval(async () => {
          try {
            const { data: d } = await sb.auth.getSession();
            if (d.session?.access_token) await sb.realtime.setAuth(d.session.access_token);
          } catch (e) {
            aviso("não consegui renovar o token do Realtime", (e as Error)?.message);
          }
        }, 10 * 60_000);
        this.limparRealtime = () => {
          this.realtimeConfirmado = false;
          void sb.removeChannel(ch);
        };
      } catch (e) {
        aviso("Realtime da sala indisponível; seguindo só com polling", (e as Error)?.message);
        this.realtimeConfirmado = false;
      }
    })();
  }

  private reassinarRealtimeDepois(): void {
    if (this.timerRealtime || !this.canal) return;
    const canal = this.canal;
    const espera = atrasoReconexao(Math.min(this.tentativasRealtime++, 4));
    this.timerRealtime = setTimeout(() => {
      this.timerRealtime = null;
      if (!this.vivo || this.canal !== canal) return;
      this.canal = null; // força nova assinatura
      this.assinarRealtime(canal);
    }, espera);
  }

  private aoRealtimeSinal(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const p = payload as {
      id?: string;
      tipo?: string;
      payload?: string;
      createdAt?: string;
      deUsuarioId?: string;
      lote?: boolean;
      itens?: { id: string; payload: string; createdAt: string }[];
    };
    // O servidor repassa para os dois participantes: ignora o eco dos meus próprios sinais.
    if (!this.meuId || p.deUsuarioId === this.meuId) return;
    if (p.lote && Array.isArray(p.itens)) {
      for (const it of p.itens) void this.processar({ id: it.id, tipo: "candidato", payload: it.payload, createdAt: it.createdAt });
      return;
    }
    if (!p.id || !p.tipo || typeof p.payload !== "string") return;
    void this.processar({ id: p.id, tipo: p.tipo, payload: p.payload, createdAt: p.createdAt ?? new Date().toISOString() });
  }

  /* ================================================================ */
  /* Ambiente: rede, aba, saída da página                             */
  /* ================================================================ */

  private ouvirAmbiente(): void {
    if (typeof window === "undefined") return;
    const reagirRede = (motivo: string) => {
      if (!this.vivo || this.encerrada) return;
      log("mudança de rede", { motivo, online: navigator.onLine });
      this.agendarPoll(0);
      const pc = this.pc;
      if (!pc || !this.remoto) return;
      // Troca de rede (Wi-Fi ↔ 4G) quebra o par de candidatos atual: renova o ICE já.
      if (this.timerReconexao) clearTimeout(this.timerReconexao);
      this.timerReconexao = null;
      this.tentativas = 0;
      try {
        pc.restartIce();
      } catch (e) {
        erro("restartIce falhou", e);
      }
      if (pc.connectionState !== "connected") this.agendarReconexao();
    };
    const aoOnline = () => reagirRede("online");
    window.addEventListener("online", aoOnline);
    this.limpadores.push(() => window.removeEventListener("online", aoOnline));

    const conexao = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    if (conexao?.addEventListener) {
      let tipoAnterior = `${conexao.type ?? ""}/${conexao.effectiveType ?? ""}`;
      const aoTrocar = () => {
        const tipo = `${conexao.type ?? ""}/${conexao.effectiveType ?? ""}`;
        const mudouRede = (conexao.type ?? "") !== tipoAnterior.split("/")[0];
        tipoAnterior = tipo;
        if (mudouRede) reagirRede(`connection.change ${tipo}`);
      };
      conexao.addEventListener("change", aoTrocar);
      this.limpadores.push(() => conexao.removeEventListener("change", aoTrocar));
    }

    const aoVisibilidade = () => {
      if (document.visibilityState !== "visible" || !this.vivo || this.encerrada) return;
      this.agendarPoll(0);
      void this.recapturar("video", "visibilitychange");
      void this.recapturar("audio", "visibilitychange");
      const pc = this.pc;
      if (pc && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) {
        if (this.timerReconexao) clearTimeout(this.timerReconexao);
        this.timerReconexao = null;
        void this.tentarReconectar();
      }
    };
    document.addEventListener("visibilitychange", aoVisibilidade);
    this.limpadores.push(() => document.removeEventListener("visibilitychange", aoVisibilidade));

    const aoSairDaPagina = () => {
      if (!this.vivo || this.encerrada) return;
      this.avisarSaida("navegacao");
    };
    window.addEventListener("pagehide", aoSairDaPagina);
    this.limpadores.push(() => window.removeEventListener("pagehide", aoSairDaPagina));
  }

  /* ================================================================ */
  /* Ações do usuário                                                  */
  /* ================================================================ */

  toggleMic(): void {
    const tracks = this.streamLocal.current?.getAudioTracks() ?? [];
    const prox = tracks.length > 0 ? !tracks[0].enabled : false;
    tracks.forEach((t) => (t.enabled = prox));
    this.set({ micAtivo: prox });
  }

  toggleCam(): void {
    const tracks = this.streamLocal.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return;
    const prox = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = prox));
    this.set({ camAtivo: prox });
    if (prox && this.estado.compartilhando) this.pararCompartilhamento();
  }

  /** Sender do transceiver de áudio ou vídeo (existe mesmo com a track trocada ou nula). */
  private senderDe(tipo: "audio" | "video"): RTCRtpSender | undefined {
    const pc = this.pc;
    if (!pc) return undefined;
    return pc.getTransceivers().find((t) => t.receiver.track?.kind === tipo)?.sender;
  }

  private senderVideo(): RTCRtpSender | undefined {
    return this.senderDe("video");
  }

  async compartilharTela(): Promise<void> {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.displayStream = display;
      const track = display.getVideoTracks()[0];
      try {
        track.contentHint = "detail";
      } catch {
        /* sem suporte */
      }
      const sender = this.senderVideo();
      if (sender) await sender.replaceTrack(track);
      track.addEventListener("ended", () => this.pararCompartilhamento());
      this.set({ compartilhando: true });
      void this.aplicarParametros();
    } catch (e) {
      aviso("compartilhamento de tela não iniciado", (e as Error)?.message);
      this.set({ compartilhando: false });
      throw e;
    }
  }

  pararCompartilhamento(): void {
    this.displayStream?.getTracks().forEach((t) => t.stop());
    this.displayStream = null;
    this.set({ compartilhando: false });
    const cam = this.streamLocal.current?.getVideoTracks()[0] ?? null;
    const sender = this.senderVideo();
    if (sender) void sender.replaceTrack(cam).catch((e) => aviso("replaceTrack falhou", (e as Error)?.message));
    void this.aplicarParametros();
  }

  enviarChat(texto: string): void {
    const limpo = texto.trim();
    if (!limpo) return;
    this.set({ chat: [...this.estado.chat, { id: `local-${Date.now()}`, minha: true, texto: limpo, hora: horaAgora() }] });
    void this.enviar("chat", { s: this.sessao, texto: limpo });
  }

  /** Paciente: sai da chamada SEM encerrar a consulta (o médico pode esperar ele voltar). */
  sair(): void {
    if (this.encerrada) return;
    log("saindo da chamada (paciente)");
    this.avisarSaida("botao");
    this.encerrada = true;
    this.remoto = null;
    this.set({ status: "encerrada", reconectando: false });
    this.limparTudo();
  }

  /** Médico: encerra a chamada para os dois. */
  encerrar(): void {
    if (this.encerrada) return;
    log("encerrando a chamada (médico)");
    void this.enviar("controle", { acao: "encerrada", s: this.sessao });
    this.encerrada = true;
    this.remoto = null;
    this.set({ status: "encerrada", reconectando: false });
    this.limparTudo();
  }
}

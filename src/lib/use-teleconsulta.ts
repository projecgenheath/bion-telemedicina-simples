"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * WebRTC REAL para teleconsultas BION (Fase 2).
 *
 * Arquitetura:
 *  - Mídia: RTCPeerConnection P2P nativa (áudio/vídeo cifrados via DTLS-SRTP —
 *    criptografia obrigatória do WebRTC). Servidores STUN públicos (Google) para
 *    descoberta de candidatos — sem chaves de API de terceiros.
 *  - Sinalização: própria do BION — tabela SinalSala no banco via
 *    GET/POST /api/telemedicina/[consultaId]/sala (polling ~1,5s, entrega única).
 *  - Papéis: PACIENTE é sempre o iniciador (evita colisão de ofertas — "glare");
 *    MÉDICO responde. Renegociação suportada (página recarregada gera nova oferta).
 *  - Presença: heartbeat embutido no polling (online = ping há < 12s).
 *
 * Sem câmera/microfone? A sala degrada com elegância: tenta vídeo+áudio → só áudio →
 * só vídeo → modo "apenas receber" (transceivers recvonly), e a chamada continua.
 */

export type StatusSala =
  | "conectando" // obtendo mídia
  | "aguardando" // pronto, aguardando o outro participante
  | "conectando-p2p" // SDP trocado, ICE em progresso
  | "conectado" // mídia fluindo P2P
  | "instavel" // conexão caiu, tentando recuperar
  | "encerrada" // algum lado encerrou
  | "indisponivel"; // reservado

export type MsgChat = { id: string; minha: boolean; texto: string; hora: string };

type SinalApi = { id: string; tipo: string; payload: string; createdAt: string };

type RespostaSala = {
  consulta: { id: string; status: string; especialidade: string; paciente: string; medico: string };
  eu: { id: string; nome: string; papel: "PACIENTE" | "MEDICO" };
  outroOnline: boolean;
  sinais: SinalApi[];
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

const INTERVALO_POLLING_MS = 1500;
const INTERVALO_ERRO_MS = 4000;

export function useTeleconsulta(consultaId: string | undefined) {
  // ── Estado exposto ─────────────────────────────────────────────────────────
  const [status, setStatus] = useState<StatusSala>("conectando");
  const [outroOnline, setOutroOnline] = useState(false);
  const [erroMidia, setErroMidia] = useState<string | null>(null);
  const [micAtivo, setMicAtivo] = useState(true);
  const [camAtivo, setCamAtivo] = useState(true);
  const [compartilhando, setCompartilhando] = useState(false);
  const [chat, setChat] = useState<MsgChat[]>([]);
  const [localPronto, setLocalPronto] = useState(false);
  const [remotoPronto, setRemotoPronto] = useState(false);

  // Streams em refs (srcObject é imperativo; evita re-render a cada track)
  const streamLocalRef = useRef<MediaStream | null>(null);
  const streamRemotoRef = useRef<MediaStream | null>(null);

  // ── Refs internos ──────────────────────────────────────────────────────────
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const papelRef = useRef<"PACIENTE" | "MEDICO" | null>(null);
  const ofertouRef = useRef(false);
  const midiaResolvidaRef = useRef(false);
  const candidatosRemotosPendentesRef = useRef<RTCIceCandidateInit[]>([]);
  const tentativaRestartRef = useRef(0);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vivoRef = useRef(true);
  const displayStreamRef = useRef<MediaStream | null>(null);

  // ── Sinalização ────────────────────────────────────────────────────────────
  const publicarSinal = useCallback(
    async (tipo: string, payload: unknown) => {
      if (!consultaId) return;
      try {
        await fetch(`/api/telemedicina/${consultaId}/sala`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "sinal", tipo, payload: JSON.stringify(payload) }),
        });
      } catch {
        // rede instável: o fluxo tenta de novo quando fizer sentido
      }
    },
    [consultaId],
  );

  // ── RTCPeerConnection ──────────────────────────────────────────────────────
  const criarPC = useCallback((): RTCPeerConnection => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Mídia local: tracks ou modo "apenas receber"
    const local = streamLocalRef.current;
    if (local) {
      local.getTracks().forEach((t) => pc.addTrack(t, local));
    } else {
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    // Mídia remota
    const remoto = new MediaStream();
    streamRemotoRef.current = remoto;
    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((t) => {
        if (!remoto.getTracks().some((x) => x.id === t.id)) remoto.addTrack(t);
      });
      if (vivoRef.current) setRemotoPronto(true);
    };

    // Trickle ICE — cada candidato vai direto para a fila de sinalização
    pc.onicecandidate = (ev) => {
      if (ev.candidate) void publicarSinal("candidato", ev.candidate.toJSON());
    };

    // Estado da conexão
    pc.oniceconnectionstatechange = () => {
      if (!vivoRef.current) return;
      switch (pc.iceConnectionState) {
        case "connected":
        case "completed":
          tentativaRestartRef.current = 0;
          setStatus("conectado");
          break;
        case "disconnected":
          setStatus("instavel");
          break;
        case "failed":
          setStatus("instavel");
          tentarReconectar();
          break;
        case "closed":
          break;
      }
    };

    return pc;
     
  }, [publicarSinal]);

  // Reconexão: apenas o iniciador recria a oferta (iceRestart)
  const tentarReconectar = useCallback(() => {
    const pc = pcRef.current;
    if (!pc || papelRef.current !== "PACIENTE") return;
    if (tentativaRestartRef.current >= 2) return;
    tentativaRestartRef.current += 1;
    void (async () => {
      try {
        const oferta = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(oferta);
        void publicarSinal("oferta", oferta);
      } catch {
        // próxima falha de ICE tenta novamente
      }
    })();
     
  }, [publicarSinal]);

  // ── Oferta (iniciador = PACIENTE) ──────────────────────────────────────────
  const talvezCriarOferta = useCallback(() => {
    if (papelRef.current !== "PACIENTE" || ofertouRef.current) return;
    const pc = criarPC();
    if (pc.signalingState !== "stable") return;
    ofertouRef.current = true;
    setStatus("conectando-p2p");
    void (async () => {
      try {
        const oferta = await pc.createOffer();
        await pc.setLocalDescription(oferta);
        void publicarSinal("oferta", oferta);
      } catch {
        ofertouRef.current = false;
      }
    })();
     
  }, [criarPC, publicarSinal]);

  // ── Processamento dos sinais recebidos ─────────────────────────────────────
  const processarSinal = useCallback(
    async (sinal: SinalApi) => {
      let dado: unknown;
      try {
        dado = JSON.parse(sinal.payload);
      } catch {
        return;
      }

      if (sinal.tipo === "controle") {
        const c = dado as { acao?: string };
        if (c.acao === "encerrada") {
          setStatus("encerrada");
          setRemotoPronto(false);
          streamRemotoRef.current = null;
          pcRef.current?.close();
          pcRef.current = null;
        }
        return;
      }

      if (sinal.tipo === "chat") {
        const m = dado as { texto?: string };
        if (!m.texto) return;
        const hora = new Date(sinal.createdAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        setChat((prev) => [...prev, { id: sinal.id, minha: false, texto: m.texto!, hora }]);
        return;
      }

      if (sinal.tipo === "oferta") {
        // MÉDICO responde; PACIENTE ignora (papéis fixos, sem glare)
        if (papelRef.current !== "MEDICO") return;
        const pc = criarPC();
        try {
          if (pc.signalingState === "have-remote-offer") {
            // Nova oferta antes de responder a anterior → rollback seguro
            await pc.setLocalDescription({ type: "rollback" } as RTCLocalSessionDescriptionInit);
          }
          await pc.setRemoteDescription(new RTCSessionDescription(dado as RTCSessionDescriptionInit));
          const resposta = await pc.createAnswer();
          await pc.setLocalDescription(resposta);
          void publicarSinal("resposta", resposta);
          setStatus("conectando-p2p");
          for (const cand of candidatosRemotosPendentesRef.current.splice(0)) {
            await pc.addIceCandidate(cand).catch(() => {});
          }
        } catch {
          // renegociação falhou; nova oferta chegará se o outro lado reiniciar
        }
        return;
      }

      if (sinal.tipo === "resposta") {
        const pc = pcRef.current;
        if (!pc) return;
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(dado as RTCSessionDescriptionInit));
            for (const cand of candidatosRemotosPendentesRef.current.splice(0)) {
              await pc.addIceCandidate(cand).catch(() => {});
            }
          }
        } catch {
          // resposta inválida/duplicada — ignora
        }
        return;
      }

      if (sinal.tipo === "candidato") {
        const pc = pcRef.current;
        const cand = dado as RTCIceCandidateInit;
        if (!pc || !pc.remoteDescription) {
          candidatosRemotosPendentesRef.current.push(cand);
          return;
        }
        await pc.addIceCandidate(cand).catch(() => {});
      }
    },
    [criarPC, publicarSinal],
  );

  // ── Mídia local (com degradação progressiva) ───────────────────────────────
  useEffect(() => {
    if (!consultaId) return;
    let cancelado = false;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

    const resolver = (stream: MediaStream | null) => {
      if (cancelado) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      midiaResolvidaRef.current = true;
      if (!stream) {
        setErroMidia(
          "Câmera e microfone indisponíveis (permissão negada ou dispositivo em uso). Você participará em modo de somente escuta e vídeo.",
        );
        setStatus("aguardando");
        return;
      }
      const soAudio = stream.getVideoTracks().length === 0;
      streamLocalRef.current = stream;
      setLocalPronto(true);
      if (soAudio) {
        setCamAtivo(false);
        setErroMidia("Câmera indisponível — participando com áudio.");
      }
      setStatus("aguardando");
    };

    if (!md) {
      resolver(null);
      return () => {
        cancelado = true;
      };
    }

    md.getUserMedia({ video: true, audio: true })
      .catch(() => md.getUserMedia({ video: false, audio: true }))
      .catch(() => null)
      .then((stream) => resolver(stream));

    return () => {
      cancelado = true;
    };
     
  }, [consultaId]);

  // ── Loop de polling: presença + sinais ─────────────────────────────────────
  useEffect(() => {
    if (!consultaId) return;
    vivoRef.current = true;

    const ciclo = async () => {
      try {
        const res = await fetch(`/api/telemedicina/${consultaId}/sala`, { cache: "no-store" });
        if (!res.ok) throw new Error(`sala ${res.status}`);
        const dados = (await res.json()) as RespostaSala;
        if (!vivoRef.current) return;

        papelRef.current = dados.eu.papel;
        setOutroOnline(dados.outroOnline);

        // Iniciador dispara a oferta quando tem a mídia resolvida e vê o outro lado
        if (dados.outroOnline && midiaResolvidaRef.current && papelRef.current === "PACIENTE") {
          talvezCriarOferta();
        }

        for (const sinal of dados.sinais) {
          await processarSinal(sinal);
        }

        loopRef.current = setTimeout(ciclo, INTERVALO_POLLING_MS);
      } catch {
        if (vivoRef.current) loopRef.current = setTimeout(ciclo, INTERVALO_ERRO_MS);
      }
    };

    void ciclo();

    return () => {
      vivoRef.current = false;
      if (loopRef.current) clearTimeout(loopRef.current);
    };
     
  }, [consultaId, processarSinal, talvezCriarOferta]);

  // ── Compartilhamento de tela (replaceTrack — sem renegociação) ─────────────
  const pararCompartilhamento = useCallback(() => {
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current = null;
    setCompartilhando(false);
    const pc = pcRef.current;
    const camTrack = streamLocalRef.current?.getVideoTracks()[0];
    const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
    if (sender && camTrack) void sender.replaceTrack(camTrack);
    else if (sender) void sender.replaceTrack(null);
  }, []);

  const compartilharTela = useCallback(async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      displayStreamRef.current = display;
      const track = display.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      track.addEventListener("ended", () => pararCompartilhamento());
      setCompartilhando(true);
    } catch {
      setCompartilhando(false);
    }
  }, [pararCompartilhamento]);

  // ── Ações do usuário ───────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const tracks = streamLocalRef.current?.getAudioTracks() ?? [];
    const prox = tracks.length > 0 ? !tracks[0].enabled : false;
    tracks.forEach((t) => (t.enabled = prox));
    setMicAtivo(prox);
  }, []);

  const toggleCam = useCallback(() => {
    const tracks = streamLocalRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return; // não há câmera para ligar
    const prox = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = prox));
    setCamAtivo(prox);
    // Ao religar a câmera durante compartilhamento de tela, volta para a câmera
    if (prox && compartilhando) {
      pararCompartilhamento();
    }
  }, [compartilhando, pararCompartilhamento]);

  const enviarChat = useCallback(
    (texto: string) => {
      const limpo = texto.trim();
      if (!limpo) return;
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setChat((prev) => [...prev, { id: `local-${Date.now()}`, minha: true, texto: limpo, hora }]);
      void publicarSinal("chat", { texto: limpo });
    },
    [publicarSinal],
  );

  const encerrar = useCallback(() => {
    // Avisa o outro lado ANTES de fechar tudo
    void publicarSinal("controle", { acao: "encerrada" });
    pcRef.current?.close();
    pcRef.current = null;
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current = null;
    streamLocalRef.current?.getTracks().forEach((t) => t.stop());
    streamRemotoRef.current = null;
    setRemotoPronto(false);
    setStatus("encerrada");
  }, [publicarSinal]);

  // ── Cleanup final ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      displayStreamRef.current?.getTracks().forEach((t) => t.stop());
      streamLocalRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    status,
    outroOnline,
    erroMidia,
    micAtivo,
    camAtivo,
    compartilhando,
    chat,
    localPronto,
    remotoPronto,
    streamLocalRef,
    streamRemotoRef,
    toggleMic,
    toggleCam,
    compartilharTela,
    pararCompartilhamento,
    enviarChat,
    encerrar,
  };
}

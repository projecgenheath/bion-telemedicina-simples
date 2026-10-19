"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { VideoOff, Wifi, WifiOff } from "lucide-react";
import { cantoAposArrasto, classesCanto, foiArrasto, type CantoPip } from "@/components/bion/chamada/pip-cantos";

/**
 * Casca de vídeo 9:16 estilo ligação, COMUM aos dois papéis (só props).
 *
 *  - Vídeo do outro em tela cheia (object-cover). No celular ocupa 100dvh;
 *    em tela larga vira uma coluna 9:16 centralizada com o próprio vídeo
 *    desfocado ao fundo.
 *  - Própria câmera num quadrinho (PiP) arrastável que encaixa nos cantos;
 *    espelhada com a câmera frontal.
 *  - Topo: nome/especialidade, tempo de chamada e selo de conexão.
 *  - Sem vídeo do outro: avatar com iniciais e o texto de espera (`espera`).
 *
 * A barra de botões (BarraChamada), avisos e folhas entram por `barra`,
 * `avisos` e `children`. Os <video> recebem o srcObject de fora (refs).
 */
export type QualidadeChamada = "boa" | "fraca" | "ruim";

export type VideoChamada916Props = {
  videoRemotoRef: RefObject<HTMLVideoElement | null>;
  videoLocalRef: RefObject<HTMLVideoElement | null>;
  /** Há mídia do outro (stream remoto chegou). */
  remotoPronto: boolean;
  camAtivo: boolean;
  /** Câmera frontal: espelha o PiP (desligue na traseira e no compartilhamento de tela). */
  espelharLocal: boolean;
  /** Sem câmera local (só áudio ou permissão negada). */
  semCameraLocal?: boolean;
  rotuloLocal?: string;
  contraparteNome: string;
  contraparteDetalhe?: string;
  /** Iniciais do avatar quando não há vídeo do outro. */
  iniciais: string;
  /** "MM:SS" desde que conectou; null esconde o tempo. */
  tempo?: string | null;
  conectado: boolean;
  qualidade?: QualidadeChamada;
  reconectando?: boolean;
  /** Texto no lugar do vídeo do outro. Ex.: { titulo: "O médico vai entrar em instantes" }. */
  espera: { titulo: string; detalhe?: string; animar?: boolean };
  /** Topo e barra visíveis (auto-ocultar de useAtalhosChamada). */
  overlaysVisiveis?: boolean;
  /** Handlers do contêiner (toque mostra/oculta). */
  handlers?: {
    onPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  };
  /** Avisos fixos sob o topo (ex.: AlertaMidia). */
  avisos?: ReactNode;
  /** Barra de botões (ex.: <BarraChamada/>), presa embaixo. */
  barra?: ReactNode;
  /** Folhas e diálogos (ficam dentro da coluna 9:16). */
  children?: ReactNode;
};

export function VideoChamada916({
  videoRemotoRef,
  videoLocalRef,
  remotoPronto,
  camAtivo,
  espelharLocal,
  semCameraLocal = false,
  rotuloLocal = "Você",
  contraparteNome,
  contraparteDetalhe,
  iniciais,
  tempo,
  conectado,
  qualidade = "boa",
  reconectando = false,
  espera,
  overlaysVisiveis = true,
  handlers,
  avisos,
  barra,
  children,
}: VideoChamada916Props) {
  const remotoComVideo = useVideoRemotoAtivo(videoRemotoRef, remotoPronto);
  const fundoRef = useRef<HTMLVideoElement>(null);

  // Fundo desfocado (tela larga): o mesmo stream do outro, mudo.
  // (rAF: o srcObject do vídeo principal é posto pelo efeito do pai, que roda depois deste.)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const fundo = fundoRef.current;
      if (fundo) fundo.srcObject = remotoPronto ? (videoRemotoRef.current?.srcObject ?? null) : null;
    });
    return () => cancelAnimationFrame(id);
  }, [remotoPronto, remotoComVideo, videoRemotoRef]);

  const mostrarVideoRemoto = remotoPronto && remotoComVideo;

  return (
    <div className="fixed inset-0 overflow-hidden bg-bion-night text-white">
      {/* Fundo da tela larga: vídeo desfocado ou gradiente da marca */}
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,var(--bion-deep)_0%,var(--bion-ink)_55%,var(--bion-night)_100%)]" />
      <video
        ref={fundoRef}
        aria-hidden
        tabIndex={-1}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-3xl transition-opacity duration-700 ${
          mostrarVideoRemoto ? "" : "opacity-0"
        }`}
      />

      <div className="relative flex h-full w-full items-center justify-center">
        <section
          aria-label={`Chamada com ${contraparteNome}`}
          {...handlers}
          className="relative h-[100dvh] w-full overflow-hidden bg-[radial-gradient(130%_70%_at_50%_15%,var(--bion-deep)_0%,var(--bion-ink)_55%,var(--bion-night)_100%)] [@media(min-width:768px)_and_(min-height:640px)]:aspect-[9/16] [@media(min-width:768px)_and_(min-height:640px)]:h-[calc(100dvh-3rem)] [@media(min-width:768px)_and_(min-height:640px)]:w-auto [@media(min-width:768px)_and_(min-height:640px)]:rounded-[2.25rem] [@media(min-width:768px)_and_(min-height:640px)]:border [@media(min-width:768px)_and_(min-height:640px)]:border-white/10 [@media(min-width:768px)_and_(min-height:640px)]:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)]"
        >
          {/* Vídeo do outro, tela cheia. Sempre no DOM: o áudio sai por aqui. */}
          <video
            ref={videoRemotoRef}
            autoPlay
            playsInline
            aria-label={`Vídeo de ${contraparteNome}`}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
              mostrarVideoRemoto ? "opacity-100" : "opacity-0"
            }`}
          />
          {/* Sombra para o texto do topo e da barra ficarem legíveis sobre o vídeo */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/55 to-transparent transition-opacity duration-300 ${
              overlaysVisiveis ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 ${
              overlaysVisiveis ? "opacity-100" : "opacity-0"
            }`}
          />

          {!mostrarVideoRemoto ? (
            <Espera
              iniciais={iniciais}
              titulo={espera.titulo}
              detalhe={espera.detalhe}
              animar={espera.animar ?? true}
              camDesligadaDoOutro={remotoPronto && !remotoComVideo}
              contraparteNome={contraparteNome}
            />
          ) : null}

          {/* Topo */}
          <header
            className={`absolute inset-x-0 top-0 z-10 flex items-start gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] transition-all duration-300 motion-reduce:transition-none ${
              overlaysVisiveis ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
            }`}
          >
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold leading-tight drop-shadow">{contraparteNome}</h1>
              {contraparteDetalhe ? (
                <p className="truncate text-xs text-white/75 drop-shadow">{contraparteDetalhe}</p>
              ) : null}
            </div>
            {tempo ? (
              <span
                className="bp-glass-marinho !rounded-full flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums"
                aria-label={`Tempo de chamada ${tempo}`}
              >
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${
                    reconectando || qualidade === "ruim" ? "bg-red-400" : qualidade === "fraca" ? "bg-amber-300" : "bg-emerald-400"
                  }`}
                />
                {tempo}
              </span>
            ) : null}
          </header>

          {/* Selo de conexão: reconectando/instável fica visível mesmo com o topo oculto */}
          <SeloConexao conectado={conectado} qualidade={qualidade} reconectando={reconectando} />

          {avisos ? (
            <div className="absolute inset-x-3 top-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)] z-20" data-sem-alternar>
              {avisos}
            </div>
          ) : null}

          <PipLocal
            videoLocalRef={videoLocalRef}
            camAtivo={camAtivo}
            espelhar={espelharLocal}
            semCamera={semCameraLocal}
            rotulo={rotuloLocal}
            barraVisivel={overlaysVisiveis}
          />

          {barra ? <div className="absolute inset-x-0 bottom-0 z-20">{barra}</div> : null}

          {children}
        </section>
      </div>
    </div>
  );
}

/** Vídeo do outro desligado (track mudo / sem vídeo): mostra o avatar no lugar da tela preta. */
function useVideoRemotoAtivo(ref: RefObject<HTMLVideoElement | null>, remotoPronto: boolean): boolean {
  const [ativo, setAtivo] = useState(true);
  useEffect(() => {
    if (!remotoPronto) return;
    let stream: MediaStream | null = null;
    let track: MediaStreamTrack | undefined;
    const ler = () => {
      const v = stream?.getVideoTracks()[0];
      if (v !== track) {
        track?.removeEventListener("mute", ler);
        track?.removeEventListener("unmute", ler);
        track = v;
        track?.addEventListener("mute", ler);
        track?.addEventListener("unmute", ler);
      }
      setAtivo(!!v && v.readyState === "live" && !v.muted);
    };
    // rAF: o srcObject é posto pelo efeito do pai (roda depois deste).
    const id = requestAnimationFrame(() => {
      const s = ref.current?.srcObject;
      if (!(s instanceof MediaStream)) return;
      stream = s;
      ler();
      stream.addEventListener("addtrack", ler);
      stream.addEventListener("removetrack", ler);
    });
    return () => {
      cancelAnimationFrame(id);
      stream?.removeEventListener("addtrack", ler);
      stream?.removeEventListener("removetrack", ler);
      track?.removeEventListener("mute", ler);
      track?.removeEventListener("unmute", ler);
    };
  }, [ref, remotoPronto]);
  return remotoPronto ? ativo : false;
}

function Espera({
  iniciais,
  titulo,
  detalhe,
  animar,
  camDesligadaDoOutro,
  contraparteNome,
}: {
  iniciais: string;
  titulo: string;
  detalhe?: string;
  animar: boolean;
  camDesligadaDoOutro: boolean;
  contraparteNome: string;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 px-8 pb-28 text-center">
      <div className="relative grid size-36 place-items-center">
        {animar ? (
          <>
            <span aria-hidden className="absolute inset-0 rounded-full bg-white/10 motion-safe:animate-[bp-onda_2.8s_ease-out_infinite]" />
            <span aria-hidden className="absolute inset-0 rounded-full bg-white/10 motion-safe:animate-[bp-onda_2.8s_ease-out_1.4s_infinite]" />
          </>
        ) : null}
        <div className="relative grid size-32 place-items-center rounded-full border border-white/25 bg-gradient-to-br from-bion-sea to-bion-ink text-4xl font-bold tracking-wide shadow-2xl">
          {iniciais || "?"}
        </div>
      </div>
      <div role="status" aria-live="polite" className="max-w-xs space-y-1.5">
        {camDesligadaDoOutro ? (
          <>
            <p className="flex items-center justify-center gap-2 text-lg font-semibold">
              <VideoOff className="size-5" aria-hidden /> Câmera desligada
            </p>
            <p className="text-sm text-white/75">{contraparteNome} está só no áudio.</p>
          </>
        ) : (
          <>
            <p className="text-xl font-semibold leading-snug">{titulo}</p>
            {detalhe ? <p className="text-sm leading-relaxed text-white/75">{detalhe}</p> : null}
            {animar ? (
              <span aria-hidden className="mt-3 inline-flex gap-1.5">
                <span className="size-1.5 rounded-full bg-white/70 motion-safe:animate-bounce [animation-delay:-0.3s]" />
                <span className="size-1.5 rounded-full bg-white/70 motion-safe:animate-bounce [animation-delay:-0.15s]" />
                <span className="size-1.5 rounded-full bg-white/70 motion-safe:animate-bounce" />
              </span>
            ) : null}
          </>
        )}
      </div>
      <style>{`@keyframes bp-onda{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.9);opacity:0}}`}</style>
    </div>
  );
}

function SeloConexao({
  conectado,
  qualidade,
  reconectando,
}: {
  conectado: boolean;
  qualidade: QualidadeChamada;
  reconectando: boolean;
}) {
  // Conexão boa não ocupa espaço (o ponto verde do tempo já diz). Problema fica sempre visível.
  const problema = reconectando || (conectado && qualidade !== "boa");
  if (!problema) return null;
  const texto = reconectando
    ? "Reconectando…"
    : qualidade === "ruim"
      ? "Conexão instável"
      : "Conexão fraca";
  const cor = reconectando || qualidade === "ruim"
    ? "bg-red-600/85 text-white"
    : "bg-amber-400/90 text-bion-ink";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`absolute left-1/2 top-[calc(max(1rem,env(safe-area-inset-top))+2.75rem)] z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur ${cor}`}
    >
      {reconectando || qualidade === "ruim" ? <WifiOff className="size-3.5" aria-hidden /> : <Wifi className="size-3.5" aria-hidden />}
      {texto}
    </div>
  );
}

function PipLocal({
  videoLocalRef,
  camAtivo,
  espelhar,
  semCamera,
  rotulo,
  barraVisivel,
}: {
  videoLocalRef: RefObject<HTMLVideoElement | null>;
  camAtivo: boolean;
  espelhar: boolean;
  semCamera: boolean;
  rotulo: string;
  barraVisivel: boolean;
}) {
  const [canto, setCanto] = useState<CantoPip>("sup-dir");
  const [arraste, setArraste] = useState<{ dx: number; dy: number } | null>(null);
  const inicio = useRef<{ x: number; y: number; t: number; px: number; py: number; vx: number; vy: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const aoDescer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    inicio.current = { x: e.clientX, y: e.clientY, t: performance.now(), px: e.clientX, py: e.clientY, vx: 0, vy: 0 };
  };
  const aoMover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const i = inicio.current;
    if (!i) return;
    const agora = performance.now();
    const dt = Math.max(1, agora - i.t);
    i.vx = (e.clientX - i.px) / dt;
    i.vy = (e.clientY - i.py) / dt;
    i.px = e.clientX;
    i.py = e.clientY;
    i.t = agora;
    const dx = e.clientX - i.x;
    const dy = e.clientY - i.y;
    if (arraste || foiArrasto(dx, dy)) setArraste({ dx, dy });
  };
  const aoSubir = () => {
    const i = inicio.current;
    inicio.current = null;
    if (!i || !arraste) {
      setArraste(null);
      return;
    }
    const el = caixa.current;
    const tela = el?.parentElement?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (el && tela && r) {
      const cx = r.left + r.width / 2 - tela.left;
      const cy = r.top + r.height / 2 - tela.top;
      setCanto(cantoAposArrasto(canto, cx, cy, tela.width, tela.height, i.vx, i.vy));
    }
    setArraste(null);
  };

  const mover = (para: CantoPip) => setCanto(para);

  return (
    <div
      ref={caixa}
      role="group"
      aria-label={`${rotulo}: sua câmera. Arraste para mudar de canto.`}
      tabIndex={0}
      data-sem-alternar
      onPointerDown={aoDescer}
      onPointerMove={aoMover}
      onPointerUp={aoSubir}
      onPointerCancel={aoSubir}
      onKeyDown={(e) => {
        // Teclado: setas levam o quadrinho para o canto daquele lado.
        const [v, h] = canto.split("-");
        if (e.key === "ArrowLeft") mover(`${v}-esq` as CantoPip);
        else if (e.key === "ArrowRight") mover(`${v}-dir` as CantoPip);
        else if (e.key === "ArrowUp") mover(`sup-${h}` as CantoPip);
        else if (e.key === "ArrowDown") mover(`inf-${h}` as CantoPip);
        else return;
        e.preventDefault();
      }}
      style={arraste ? { transform: `translate(${arraste.dx}px, ${arraste.dy}px)` } : undefined}
      className={`absolute z-10 h-40 w-[6.75rem] touch-none select-none overflow-hidden rounded-2xl border border-white/30 bg-bion-ink shadow-2xl outline-none focus-visible:ring-4 focus-visible:ring-white/60 sm:h-48 sm:w-[8.5rem] ${classesCanto(
        canto,
        barraVisivel,
      )} ${arraste ? "cursor-grabbing" : "cursor-grab transition-[top,bottom,left,right,transform] duration-300 ease-out"}`}
    >
      <video
        ref={videoLocalRef}
        autoPlay
        muted
        playsInline
        aria-label="Sua câmera"
        className={`h-full w-full object-cover ${espelhar ? "-scale-x-100" : ""} ${camAtivo && !semCamera ? "" : "hidden"}`}
      />
      {!camAtivo || semCamera ? (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-bion-sea/70 to-bion-ink">
          <VideoOff className="size-6 text-white/80" aria-hidden />
        </div>
      ) : null}
      <span className="absolute inset-x-0 bottom-1.5 text-center text-[0.7rem] font-semibold text-white drop-shadow">
        {rotulo}
      </span>
    </div>
  );
}

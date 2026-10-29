"use client";

import type { ReactNode } from "react";
import { MessageCircle, Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";

/**
 * Barra de botões da chamada, estilo ligação de celular. COMUM aos dois
 * papéis e guiada só por props: não conhece paciente nem médico.
 *
 * Ordem: Microfone · Câmera · Virar (só com 2+ câmeras) · Mensagens · [extras] · Encerrar.
 * O médico põe os botões dele em `extras` (use <BotaoChamada> para o mesmo visual).
 */
export type BarraChamadaProps = {
  micAtivo: boolean;
  camAtivo: boolean;
  onMic: () => void;
  onCam: () => void;
  /** Sem track de vídeo (só áudio): o botão da câmera fica desabilitado. */
  semCamera?: boolean;
  /** Sem track de áudio: o botão do microfone fica desabilitado (mesmo padrão). */
  semMic?: boolean;
  /** Mostra "Virar" (passe true só com mais de uma câmera; ver useCamerasDisponiveis). */
  podeVirar?: boolean;
  onVirar?: () => void;
  /** Troca de câmera em andamento (desabilita o botão). */
  virando?: boolean;
  /** Abre as mensagens (folha de baixo). Sem handler, o botão não aparece. */
  onMensagens?: () => void;
  /** Mensagens novas desde a última vez que a folha foi aberta. */
  naoLidas?: number;
  mensagensAbertas?: boolean;
  onEncerrar: () => void;
  /** Rótulo visível do botão vermelho (padrão "Encerrar"). */
  rotuloEncerrar?: string;
  /** Nome acessível do botão vermelho (padrão = rótulo). */
  ariaEncerrar?: string;
  /** O botão vermelho abre um diálogo (ex.: desfecho do médico). */
  encerrarAbreDialogo?: boolean;
  /** Botões a mais (médico), antes do Encerrar. */
  extras?: ReactNode;
  /** false: barra some (auto-ocultar); continua no DOM para não perder o foco. */
  visivel?: boolean;
  className?: string;
};

export function BarraChamada({
  micAtivo,
  camAtivo,
  onMic,
  onCam,
  semCamera = false,
  semMic = false,
  podeVirar = false,
  onVirar,
  virando = false,
  onMensagens,
  naoLidas = 0,
  mensagensAbertas = false,
  onEncerrar,
  rotuloEncerrar = "Encerrar",
  ariaEncerrar,
  encerrarAbreDialogo = false,
  extras,
  visivel = true,
  className = "",
}: BarraChamadaProps) {
  return (
    <div
      role="toolbar"
      aria-label="Controles da chamada"
      data-sem-alternar
      className={`pointer-events-auto mx-3 mb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-300 ease-out motion-reduce:transition-none ${
        visivel ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      } ${className}`}
    >
      <div className="bp-glass-marinho !rounded-[1.75rem] flex items-end justify-around gap-1 px-2 py-3">
        <BotaoChamada
          rotulo="Mudo"
          aria={semMic ? "Microfone indisponível" : micAtivo ? "Silenciar microfone" : "Ativar microfone"}
          pressionado={!micAtivo}
          destaque={!micAtivo && !semMic}
          desabilitado={semMic}
          onClick={onMic}
          atalho="M"
        >
          {micAtivo && !semMic ? <Mic className="size-6" aria-hidden /> : <MicOff className="size-6" aria-hidden />}
        </BotaoChamada>

        <BotaoChamada
          rotulo="Câmera"
          aria={semCamera ? "Câmera indisponível" : camAtivo ? "Desligar câmera" : "Ligar câmera"}
          pressionado={!camAtivo}
          destaque={!camAtivo && !semCamera}
          desabilitado={semCamera}
          onClick={onCam}
          atalho="V"
        >
          {camAtivo && !semCamera ? <Video className="size-6" aria-hidden /> : <VideoOff className="size-6" aria-hidden />}
        </BotaoChamada>

        {podeVirar && onVirar ? (
          <BotaoChamada
            rotulo="Virar"
            aria="Trocar câmera (frontal ou traseira)"
            desabilitado={virando || !camAtivo}
            onClick={onVirar}
          >
            <SwitchCamera className={`size-6 ${virando ? "animate-spin [animation-duration:1.2s]" : ""}`} aria-hidden />
          </BotaoChamada>
        ) : null}

        {onMensagens ? (
          <BotaoChamada
            rotulo="Mensagens"
            aria={naoLidas > 0 ? `Mensagens, ${naoLidas} ${naoLidas === 1 ? "nova" : "novas"}` : "Abrir mensagens"}
            expandido={mensagensAbertas}
            abreDialogo
            onClick={onMensagens}
            selo={naoLidas}
          >
            <MessageCircle className="size-6" aria-hidden />
          </BotaoChamada>
        ) : null}

        {extras}

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onEncerrar}
            aria-label={ariaEncerrar ?? rotuloEncerrar}
            aria-haspopup={encerrarAbreDialogo ? "dialog" : undefined}
            className="grid size-16 place-items-center rounded-full bg-destructive text-white shadow-lg shadow-red-900/40 transition hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
          >
            <PhoneOff className="size-7" aria-hidden />
          </button>
          <span className="text-[0.7rem] font-semibold text-white/85" aria-hidden>
            {rotuloEncerrar}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Botão redondo da barra (56 px), com rótulo embaixo. Exportado para os `extras` do médico. */
export function BotaoChamada({
  rotulo,
  aria,
  onClick,
  children,
  pressionado,
  expandido,
  abreDialogo = false,
  destaque = false,
  desabilitado = false,
  selo = 0,
  atalho,
}: {
  rotulo: string;
  aria?: string;
  onClick: () => void;
  children: ReactNode;
  /** Botão de liga/desliga (aria-pressed). */
  pressionado?: boolean;
  expandido?: boolean;
  abreDialogo?: boolean;
  /** Fundo branco (estado "desligado", como no iPhone). */
  destaque?: boolean;
  desabilitado?: boolean;
  /** Número no selo (0 = sem selo). */
  selo?: number;
  /** Tecla de atalho mostrada no title (computador). */
  atalho?: string;
}) {
  const nome = aria ?? rotulo;
  return (
    <div className="flex min-w-14 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={desabilitado}
        aria-label={nome}
        aria-pressed={pressionado}
        aria-expanded={expandido}
        aria-haspopup={abreDialogo ? "dialog" : undefined}
        aria-keyshortcuts={atalho}
        title={atalho ? `${nome} (${atalho})` : nome}
        className={`relative grid size-14 place-items-center rounded-full border transition active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 disabled:opacity-40 disabled:active:scale-100 ${
          destaque
            ? "border-white bg-white text-bion-ink"
            : "border-white/25 bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {children}
        {selo > 0 ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[0.65rem] font-bold leading-5 text-white ring-2 ring-bion-ink"
          >
            {selo > 9 ? "9+" : selo}
          </span>
        ) : null}
      </button>
      <span className="text-[0.7rem] font-semibold text-white/85" aria-hidden>
        {rotulo}
      </span>
    </div>
  );
}

"use client";

import type { RefObject } from "react";
import { CameraOff } from "lucide-react";
import { AlertaMidia } from "@/components/bion/consulta/AlertaMidia";

type StatusSala = string;

export function ConsultaAreaVideo({
  videoRemotoRef,
  videoLocalRef,
  remotoPronto,
  camAtivo,
  erroMidia,
  compartilhando,
  contraparteNome,
  iniciais,
  statusSala,
  outroOnline,
}: {
  videoRemotoRef: RefObject<HTMLVideoElement | null>;
  videoLocalRef: RefObject<HTMLVideoElement | null>;
  remotoPronto: boolean;
  camAtivo: boolean;
  erroMidia: string | null | undefined;
  compartilhando: boolean;
  contraparteNome: string;
  iniciais: (nome: string) => string;
  statusSala: StatusSala;
  outroOnline: boolean;
}) {
  return (
    <>
      <div className="aspect-video lg:aspect-auto lg:flex-1 lg:min-h-[320px] w-full shrink-0 lg:shrink relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-white/10 flex items-center justify-center shadow-2xl">
        <video
          ref={videoRemotoRef}
          autoPlay
          playsInline
          aria-label={`Vídeo de ${contraparteNome}`}
          className={`w-full h-full object-cover ${remotoPronto ? "" : "hidden"}`}
        />

        {!remotoPronto && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-28 h-28 rounded-3xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-4xl font-extrabold text-white shadow-xl">
              {iniciais(contraparteNome)}
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{contraparteNome}</div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center justify-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    outroOnline ? "bg-emerald-400" : "bg-slate-500"
                  }`}
                />
                {statusSala === "encerrada"
                  ? "Chamada encerrada"
                  : statusSala === "conectando-p2p"
                    ? "Negociando conexão segura…"
                    : outroOnline
                      ? "Na sala — conectando mídia…"
                      : "Aguardando o outro participante entrar na sala"}
              </div>
            </div>
          </div>
        )}

        <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 w-28 h-20 sm:w-36 sm:h-28 md:w-52 md:h-36 rounded-2xl overflow-hidden bg-slate-900 border-2 border-white/20 shadow-2xl flex items-center justify-center text-xs">
          <video
            ref={videoLocalRef}
            autoPlay
            muted
            playsInline
            aria-label="Sua câmera"
            className={`w-full h-full object-cover mirror ${camAtivo ? "" : "hidden"}`}
          />
          {(!camAtivo || erroMidia) && (
            <div className="flex flex-col items-center gap-1 text-slate-400 px-2 text-center">
              <CameraOff className="w-5 h-5" />
              <span className="text-xs leading-tight">
                {erroMidia ? "Somente áudio/escuta" : "Câmera desligada"}
              </span>
            </div>
          )}
          <span className="absolute bottom-1.5 left-1.5 text-xs font-bold px-2 py-0.5 rounded-md bg-black/70 backdrop-blur">
            {compartilhando ? "Tela compartilhada" : "Você"}
          </span>
        </div>
      </div>

      {erroMidia ? <AlertaMidia mensagem={erroMidia} /> : null}
    </>
  );
}

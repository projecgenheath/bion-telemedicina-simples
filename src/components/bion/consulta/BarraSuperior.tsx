"use client";

import { Clock, Shield } from "lucide-react";

type StatusSala =
  | "conectado"
  | "instavel"
  | "conectando-p2p"
  | "encerrada"
  | "aguardando"
  | "conectando"
  | string;

export function ConsultaBarraSuperior({
  contraparteNome,
  contraparteDetalhe,
  role,
  tempo,
  statusSala,
  iniciais,
}: {
  contraparteNome: string;
  contraparteDetalhe: string;
  role: "paciente" | "medico" | "admin";
  tempo: string;
  statusSala: StatusSala;
  iniciais: (nome: string) => string;
}) {
  return (
    <div className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-white/10 bg-slate-900/90 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-bold text-sm shadow-sm">
          {iniciais(contraparteNome)}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold truncate flex items-center gap-2">
            <span>
              {contraparteNome}
              {role === "medico" ? " (Paciente)" : " (Médica)"}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-xs text-slate-400 truncate">{contraparteDetalhe}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 font-mono font-bold">
          <Clock className="w-3.5 h-3.5 text-primary" /> {tempo}
        </div>
        <div
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-semibold ${
            statusSala === "conectado"
              ? "bg-emerald-500/10 dark:bg-emerald-400/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : statusSala === "instavel"
                ? "bg-amber-500/10 dark:bg-amber-400/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "bg-white/5 border-white/10 text-slate-300"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full animate-pulse ${
              statusSala === "conectado" ? "bg-emerald-400" : "bg-slate-400"
            }`}
          />
          {statusSala === "conectado"
            ? "P2P Conectado"
            : statusSala === "instavel"
              ? "Reconectando…"
              : statusSala === "conectando-p2p"
                ? "Negociando mídia…"
                : statusSala === "encerrada"
                  ? "Chamada encerrada"
                  : "Sala aberta"}
        </div>
        <div className="hidden md:flex items-center gap-1 text-slate-400">
          <Shield className="w-3.5 h-3.5 text-primary" /> Criptografia Ponta a Ponta (DTLS-SRTP)
        </div>
      </div>
    </div>
  );
}

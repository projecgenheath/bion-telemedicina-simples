"use client";

import { useEffect, type RefObject } from "react";
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  MonitorUp,
  Paperclip,
  PhoneOff,
  Pill,
  Award,
  FileText,
} from "lucide-react";

export function ConsultaControlesMidia({
  role,
  micAtivo,
  camAtivo,
  compartilhando,
  onToggleMic,
  onToggleCam,
  onToggleTela,
  onAnexar,
  onReceita,
  onAtestado,
  onExame,
  onEncerrar,
  fileRef,
  onArquivos,
}: {
  role: "paciente" | "medico" | "admin";
  micAtivo: boolean;
  camAtivo: boolean;
  compartilhando: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleTela: () => void;
  onAnexar: () => void;
  onReceita: () => void;
  onAtestado: () => void;
  onExame: () => void;
  onEncerrar: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  onArquivos: (files: FileList | null) => void;
}) {
  useEffect(() => {
    const emCampoEditavel = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (emCampoEditavel(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "m") {
        e.preventDefault();
        onToggleMic();
      } else if (k === "c") {
        e.preventDefault();
        onToggleCam();
      } else if (k === "s") {
        e.preventDefault();
        onToggleTela();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggleMic, onToggleCam, onToggleTela]);

  return (
    <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 overflow-x-auto sm:flex-wrap sm:justify-center bg-slate-900/80 backdrop-blur p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 rounded-2xl border border-white/10">
      <button
        type="button"
        onClick={onToggleMic}
        className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition shadow-md ${
          micAtivo
            ? "bg-white/10 hover:bg-white/20 text-white"
            : "bg-red-500 dark:bg-red-600 text-white hover:bg-red-600"
        }`}
        title={micAtivo ? "Silenciar microfone" : "Ativar microfone"}
        aria-label={micAtivo ? "Silenciar microfone" : "Ativar microfone"}
        aria-pressed={!micAtivo}
      >
        {micAtivo ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      <button
        type="button"
        onClick={onToggleCam}
        className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition shadow-md ${
          camAtivo
            ? "bg-white/10 hover:bg-white/20 text-white"
            : "bg-red-500 dark:bg-red-600 text-white hover:bg-red-600"
        }`}
        title={camAtivo ? "Desativar câmera" : "Ativar câmera"}
        aria-label={camAtivo ? "Desativar câmera" : "Ativar câmera"}
        aria-pressed={!camAtivo}
      >
        {camAtivo ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
      </button>

      <button
        type="button"
        onClick={onToggleTela}
        className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition shadow-md ${
          compartilhando
            ? "bg-primary text-primary-foreground"
            : "bg-white/10 hover:bg-white/20 text-white"
        }`}
        title="Compartilhar tela"
        aria-label="Compartilhar tela"
      >
        <MonitorUp className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={onAnexar}
        className="w-12 h-12 shrink-0 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shadow-md"
        title="Enviar exame ou arquivo"
        aria-label="Enviar exame ou arquivo"
      >
        <Paperclip className="w-5 h-5" />
      </button>

      {role === "medico" && (
        <>
          <button
            type="button"
            onClick={onReceita}
            className="px-4 h-12 shrink-0 rounded-2xl bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md"
          >
            <Pill className="w-4 h-4" /> Prescrever Receita
          </button>
          <button
            type="button"
            onClick={onAtestado}
            className="px-4 h-12 shrink-0 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 transition shadow-md"
          >
            <Award className="w-4 h-4" /> Emitir Atestado
          </button>
          <button
            type="button"
            onClick={onExame}
            className="px-4 h-12 shrink-0 rounded-2xl bg-violet-600/90 hover:bg-violet-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md"
          >
            <FileText className="w-4 h-4" /> Solicitar Exame
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onEncerrar}
        aria-haspopup={role === "medico" ? "dialog" : undefined}
        className="px-6 h-12 shrink-0 rounded-2xl bg-red-600 dark:bg-red-500 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-2 transition shadow-lg shadow-red-600/30"
      >
        <PhoneOff className="w-4 h-4" /> {role === "medico" ? "Encerrar Atendimento" : "Sair da chamada"}
      </button>

      <input
        aria-label="Anexar arquivo"
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onArquivos(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
      <p className="text-center text-xs text-slate-300 px-2">
        Atalhos: <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">M</kbd> microfone ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">C</kbd> câmera ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">S</kbd> tela
      </p>
    </div>
  );
}

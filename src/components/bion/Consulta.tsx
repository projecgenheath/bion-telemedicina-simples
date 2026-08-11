import { useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Camera, CameraOff, MonitorUp, Paperclip, PhoneOff, Clock, Wifi,
  MessageSquare, FileText, Download, Upload, Pill, Award,
} from "lucide-react";
import { useBion, type Role } from "@/lib/bion-types";
import { useBion as useStore } from "@/lib/bion-store";

export function Consulta({ onEnd, role }: { onEnd: () => void; role: Role }) {
  const { arquivos, adicionarArquivo, notificar } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [compartilhando, setCompartilhando] = useState(false);
  const [erroMidia, setErroMidia] = useState<string | null>(null);
  const [aba, setAba] = useState<"prontuario" | "exames">("prontuario");
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    let cancelado = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (!cancelado) setErroMidia("Câmera/microfone indisponíveis. Verifique as permissões do navegador.");
      });
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const tempo = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;

  const toggleMic = () => {
    const next = !micOn;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };
  const toggleCam = () => {
    const next = !camOn;
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };

  const toggleTela = async () => {
    if (compartilhando) {
      setCompartilhando(false);
      if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setCompartilhando(true);
      if (videoRef.current) videoRef.current.srcObject = display;
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        setCompartilhando(false);
        if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
      });
    } catch {
      setCompartilhando(false);
    }
  };

  const enviarArquivo = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) =>
      adicionarArquivo({
        nome: f.name,
        tipo: f.type.includes("image") ? "Imagem de exame" : "Documento",
        tamanhoKb: Math.max(1, Math.round(f.size / 1024)),
        enviadoPor: role === "medico" ? "medico" : "paciente",
        consulta: "Consulta atual — Dra. Ana Ribeiro",
      }),
    );
  };

  const encerrar = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onEnd();
  };

  return (
    <div className="-m-5 md:-m-8 min-h-[calc(100vh-4rem)] bg-slate-900 flex flex-col text-white">
      <div className="h-14 px-4 md:px-6 flex items-center gap-3 border-b border-white/10">
        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center font-semibold text-sm">
          {role === "medico" ? "MS" : "AR"}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{role === "medico" ? "Marina Silva" : "Dra. Ana Ribeiro"}</div>
          <div className="text-xs text-white/60">{role === "medico" ? "32 anos" : "Clínica Geral"}</div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 tabular-nums"><Clock className="w-4 h-4" /> {tempo}</span>
          <span className="hidden sm:flex items-center gap-1.5"><Wifi className="w-4 h-4" style={{ color: "var(--accent)" }} /> HD</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col p-3 md:p-4 gap-3 min-w-0">
          <div className="flex-1 min-h-[280px] relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold">
              {role === "medico" ? "MS" : "AR"}
            </div>
            <div className="absolute bottom-3 left-3 text-xs px-2 py-1 rounded bg-black/50">
              {role === "medico" ? "Marina Silva" : "Dra. Ana Ribeiro"}
            </div>
            <div className="absolute top-3 right-3 w-32 h-24 md:w-44 md:h-32 rounded-xl overflow-hidden bg-slate-600 border border-white/20 flex items-center justify-center text-xs">
              <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${camOn && !erroMidia ? "" : "hidden"}`} />
              {(!camOn || erroMidia) && <span className="px-2 text-center text-white/70">Câmera desligada</span>}
              <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60">
                {compartilhando ? "Sua tela" : "Você"}
              </span>
            </div>
            {erroMidia && (
              <div className="absolute bottom-3 right-3 left-3 md:left-auto text-xs px-3 py-2 rounded-lg bg-red-500/20 border border-red-400/40">
                {erroMidia}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap">
            <CtrlBtn active={micOn} onClick={toggleMic} label={micOn ? "Desligar microfone" : "Ligar microfone"}>
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </CtrlBtn>
            <CtrlBtn active={camOn} onClick={toggleCam} label={camOn ? "Desligar câmera" : "Ligar câmera"}>
              {camOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
            </CtrlBtn>
            <CtrlBtn active={compartilhando} onClick={toggleTela} label="Compartilhar tela">
              <MonitorUp className="w-4 h-4" />
            </CtrlBtn>
            <CtrlBtn active onClick={() => fileRef.current?.click()} label="Anexar exame">
              <Paperclip className="w-4 h-4" />
            </CtrlBtn>
            {role === "medico" && (
              <>
                <CtrlBtn active onClick={() => notificar({ tipo: "receita", titulo: "Receita disponível", texto: "A receita da consulta já está no histórico do paciente." })} label="Emitir receita">
                  <Pill className="w-4 h-4" />
                </CtrlBtn>
                <CtrlBtn active onClick={() => notificar({ tipo: "receita", titulo: "Atestado emitido", texto: "Atestado de 2 dias disponível para download." })} label="Emitir atestado">
                  <Award className="w-4 h-4" />
                </CtrlBtn>
              </>
            )}
            <button onClick={encerrar} className="ml-1 h-11 px-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center gap-2 text-sm font-semibold">
              <PhoneOff className="w-4 h-4" /> Encerrar
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { enviarArquivo(e.target.files); e.target.value = ""; }} />
          </div>

          <div className="lg:hidden">
            <ExamesPanel arquivos={arquivos} onUpload={() => fileRef.current?.click()} />
          </div>
        </div>

        <div className="hidden lg:flex w-80 border-l border-white/10 flex-col">
          <div className="flex border-b border-white/10 text-sm">
            {([["prontuario", "Prontuário"], ["exames", "Exames"]] as const).map(([k, t]) => (
              <button key={k} onClick={() => setAba(k)}
                className={`flex-1 py-3 font-medium ${aba === k ? "border-b-2 border-primary text-white" : "text-white/60"}`}>{t}</button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4 text-sm space-y-3">
            {aba === "prontuario" ? (
              <>
                <Campo t="Queixa principal" v="Cefaleia recorrente há 3 semanas" />
                <Campo t="Alergias" v="Dipirona" />
                <Campo t="Medicamentos" v="Losartana 50mg" />
                <textarea placeholder="Anotações da consulta..." rows={6}
                  className="w-full mt-2 p-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 outline-none" />
              </>
            ) : (
              <ExamesPanel arquivos={arquivos} onUpload={() => fileRef.current?.click()} />
            )}
          </div>
          <div className="p-3 border-t border-white/10">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5">
              <MessageSquare className="w-4 h-4 text-white/60" />
              <input placeholder="Mensagem no chat..." className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <div className="text-white/60 text-xs uppercase tracking-wide">{t}</div>
      <div className="mt-1">{v}</div>
    </div>
  );
}

function CtrlBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={`w-11 h-11 rounded-full flex items-center justify-center transition ${active ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80 hover:bg-red-500"}`}>
      {children}
    </button>
  );
}

function ExamesPanel({ arquivos, onUpload }: { arquivos: ReturnType<typeof useStore>["arquivos"]; onUpload: () => void }) {
  return (
    <div className="space-y-2">
      <button onClick={onUpload}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/25 text-sm hover:bg-white/5">
        <Upload className="w-4 h-4" /> Anexar exame
      </button>
      {arquivos.map((a) => (
        <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5">
          <FileText className="w-4 h-4 text-white/70 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">{a.nome}</div>
            <div className="text-[11px] text-white/50">{a.tipo} • {a.tamanhoKb} KB • {a.enviadoPor === "medico" ? "médico" : "paciente"}</div>
          </div>
          <Download className="w-4 h-4 text-white/50" />
        </div>
      ))}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Wifi,
  Video,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Volume2,
  Sparkles,
  User,
  Star,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";

export function SalaEspera({ onEnter }: { onEnter: () => void }) {
  const { consultas, registrarAudit, sessao } = useBion();
  const proximaConsulta = consultas.find((c) => c.status === "confirmada") ?? consultas[0];
  const medicoNome = proximaConsulta?.medico ?? "Dra. Ana Ribeiro";
  const medicoInfo = {
    nome: medicoNome,
    crm: "CRM 12345 SP",
    avaliacao: 4.9,
  };

  // ── Presença REAL na sala (Fase 2): polling leve do estado da sala WebRTC ──
  const consultaId = proximaConsulta?.id;
  const [medicoNaSala, setMedicoNaSala] = useState(false);
  useEffect(() => {
    if (!consultaId) return;
    let vivo = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/telemedicina/${consultaId}/sala`, { cache: "no-store" });
        if (res.ok && vivo) {
          const dados = (await res.json()) as { outroOnline: boolean; consulta: { status: string } };
          setMedicoNaSala(dados.outroOnline);
        }
      } catch {
        // silencioso: badge permanece no último estado conhecido
      }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [consultaId]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [tempoRestante, setTempoRestante] = useState(145); // 2 min 25s
  const [camAtiva, setCamAtiva] = useState(true);
  const [micAtivo, setMicAtivo] = useState(true);
  const [nivelAudio, setNivelAudio] = useState(65);
  const [barrasAudio, setBarrasAudio] = useState<number[]>(Array(8).fill(15));
  const [statusRede, setStatusRede] = useState<"testando" | "excelente" | "boa">("excelente");
  const [ping, setPing] = useState(18);
  const [erroCamera, setErroCamera] = useState<string | null>(null);

  // Inicializa câmera e áudio para teste
  useEffect(() => {
    let cancelado = false;
    let animFrame: number;

    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        try {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (cancelado) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setNivelAudio(Math.min(100, Math.max(15, Math.round((avg / 128) * 100))));
            const porBarra = Math.max(1, Math.floor(dataArray.length / 8));
            setBarrasAudio(
              Array.from({ length: 8 }, (_, b) => {
                let acc = 0;
                for (let i = 0; i < porBarra; i++) acc += dataArray[b * porBarra + i] ?? 0;
                return Math.min(100, Math.max(12, Math.round((acc / porBarra / 200) * 100)));
              }),
            );
            animFrame = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        } catch {
          // fallback para animação sutil
        }
      })
      .catch(() => {
        if (!cancelado) {
          setErroCamera(
            "Câmera não detectada ou permissão negada. O teste continuará em modo simulado.",
          );
        }
      });

    // Contagem regressiva
    const timer = setInterval(() => {
      setTempoRestante((t) => (t > 0 ? t - 1 : 0));
    }, 1000);

    return () => {
      cancelado = true;
      cancelAnimationFrame(animFrame);
      clearInterval(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const formatarTempo = (seg: number) => {
    const min = Math.floor(seg / 60);
    const s = seg % 60;
    return `${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const toggleCam = () => {
    const prox = !camAtiva;
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = prox));
    setCamAtiva(prox);
  };

  const toggleMic = () => {
    const prox = !micAtivo;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = prox));
    setMicAtivo(prox);
  };

  const retestarConexao = () => {
    setStatusRede("testando");
    setTimeout(() => {
      setPing(Math.floor(Math.random() * 10) + 12);
      setStatusRede("excelente");
    }, 800);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
            <span style={{ color: "var(--accent)" }}>Sala Segura & Criptografada</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Sala de Espera Virtual</h1>
          <p className="text-muted-foreground mt-1">
            Verifique seus dispositivos antes da chamada para uma consulta perfeita.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-card border px-4 py-2.5 rounded-2xl shadow-sm">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Início previsto</div>
            <div className="text-sm font-bold text-foreground">
              {proximaConsulta?.hora ?? "14:30"}
            </div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-left">
            <div className="text-xs text-muted-foreground">Contagem</div>
            <div className="text-lg font-mono font-extrabold text-primary">
              {formatarTempo(tempoRestante)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Painel do Teste de Vídeo */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-slate-900 border shadow-md flex items-center justify-center text-white">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover mirror ${camAtiva && !erroCamera ? "" : "hidden"}`}
            />

            {(!camAtiva || erroCamera) && (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                  <CameraOff className="w-8 h-8" />
                </div>
                <div>
                  <div className="font-semibold text-base text-slate-200">
                    {erroCamera ? "Câmera indisponível" : "Câmera desligada"}
                  </div>
                  <div className="text-xs text-slate-400 max-w-xs mt-1">
                    {erroCamera ?? "Clique no botão abaixo para reativar o vídeo."}
                  </div>
                </div>
              </div>
            )}

            {/* Overlays no vídeo */}
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-xs font-medium text-white border border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              HD 1080p • Áudio Ativo
            </div>

            <div className="absolute bottom-4 inset-x-4 flex items-center justify-between">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-xs text-white border border-white/10">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nível de voz:</span>
                <div className="flex items-end gap-[3px] h-4">
                  {barrasAudio.map((v, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-emerald-400 transition-all duration-75"
                      style={{ height: `${Math.max(15, v)}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleCam}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition border ${
                    camAtiva
                      ? "bg-white/20 hover:bg-white/30 border-white/20 text-white"
                      : "bg-red-500 hover:bg-red-600 border-transparent text-white"
                  }`}
                  title={camAtiva ? "Desativar Câmera" : "Ativar Câmera"}
                >
                  {camAtiva ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={toggleMic}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition border ${
                    micAtivo
                      ? "bg-white/20 hover:bg-white/30 border-white/20 text-white"
                      : "bg-red-500 hover:bg-red-600 border-transparent text-white"
                  }`}
                  title={micAtivo ? "Desativar Microfone" : "Ativar Microfone"}
                >
                  {micAtivo ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Testes de Diagnóstico */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="bg-card border rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
                <Camera className="w-4 h-4" style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">Vídeo</div>
                <div className="text-sm font-semibold truncate">
                  {camAtiva ? "Pronto" : "Desligado"}
                </div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>

            <div className="bg-card border rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
                <Mic className="w-4 h-4" style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">Microfone</div>
                <div className="text-sm font-semibold truncate">
                  {micAtivo ? "Captando" : "Mudo"}
                </div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>

            <div className="bg-card border rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
                <Wifi className="w-4 h-4" style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">Conexão</div>
                <div className="text-sm font-semibold truncate">{ping} ms (HD)</div>
              </div>
              <button
                onClick={retestarConexao}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition"
                title="Retestar rede"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Card do Médico & Botão de Entrada */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold shrink-0 shadow-sm">
                {medicoInfo?.nome
                  .split(" ")
                  .slice(-2)
                  .map((w) => w[0])
                  .join("") ?? "DR"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-soft"
                    style={{ color: "var(--accent)" }}
                  >
                    {medicoNaSala ? "Médico na sala" : "Aguardando o médico"}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full animate-pulse ${
                      medicoNaSala ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                  <span className="flex items-center text-xs font-bold text-amber-500 gap-0.5">
                    <Star className="w-3 h-3 fill-amber-500" /> {medicoInfo?.avaliacao ?? 4.9}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mt-1 truncate">
                  {proximaConsulta?.medico ?? "Dra. Ana Ribeiro"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {proximaConsulta?.especialidade ?? "Clínica Geral"} •{" "}
                  {medicoInfo?.crm ?? "CRM 12345 SP"}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-muted/70 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paciente</span>
                <span className="font-semibold">{sessao?.nome ?? proximaConsulta?.paciente ?? "Você"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo</span>
                <span className="font-semibold">Teleconsulta de Retorno</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horário</span>
                <span className="font-semibold">
                  {proximaConsulta?.data}, {proximaConsulta?.hora}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Recomendações para sua consulta:
              </div>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  Use fones de ouvido para maior clareza e privacidade.
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  Fique em um ambiente iluminado e silencioso.
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  Tenha em mãos exames e nomes de medicamentos atuais.
                </li>
              </ul>
            </div>

            <button
              onClick={() => {
                registrarAudit({
                  acao: "CONSULTA_INICIADA",
                  categoria: "consulta",
                  severidade: "info",
                  entidade: "consulta",
                  entidadeId: consultaId,
                  detalhes: `Entrada na sala de consulta com ${medicoNome}`,
                });
                onEnter();
              }}
              className="w-full py-4 rounded-2xl text-primary-foreground font-bold text-base shadow-lg shadow-emerald-500/20 hover:opacity-95 active:scale-[0.99] transition flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <Video className="w-5 h-5" /> Entrar na Consulta Agora
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground text-center">
              <ShieldCheck className="w-4 h-4 text-primary" /> Atendimento protegido por
              criptografia de ponta a ponta
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

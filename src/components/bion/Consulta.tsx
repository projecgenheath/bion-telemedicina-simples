"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  MonitorUp,
  Paperclip,
  PhoneOff,
  Clock,
  Wifi,
  MessageSquare,
  FileText,
  Download,
  Upload,
  Pill,
  Award,
  Sparkles,
  Check,
  Send,
  Bot,
  AlertCircle,
  X,
  Shield,
  Plus,
} from "lucide-react";
import { useBion as useStore, type Documento } from "@/lib/bion-store";
import { useTeleconsulta } from "@/lib/use-teleconsulta";

type Role = "paciente" | "medico" | "admin";

export function Consulta({ onEnd, role }: { onEnd: () => void; role: Role }) {
  const {
    arquivos,
    adicionarArquivo,
    emitirDocumento,
    concluirConsulta,
    consultas,
    registrarAudit,
  } = useStore();

  // Consulta ativa real (banco) — define a sala WebRTC
  const consultaAtual = consultas.find((c) => c.status === "confirmada") ?? consultas[0];

  // ── WebRTC REAL (Fase 2): mídia P2P + sinalização via banco ──
  const tele = useTeleconsulta(consultaAtual?.id);
  const {
    status: statusSala,
    outroOnline,
    erroMidia,
    micAtivo,
    camAtivo,
    compartilhando,
    chat: chatMsgs,
    remotoPronto,
    streamLocalRef,
    streamRemotoRef,
    toggleMic: alternarMicHook,
    toggleCam: alternarCamHook,
    compartilharTela,
    pararCompartilhamento,
    enviarChat: enviarChatSinal,
    encerrar: encerrarChamada,
  } = tele;

  const videoLocalRef = useRef<HTMLVideoElement>(null);
  const videoRemotoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [aba, setAba] = useState<"prontuario" | "exames" | "chat" | "ia">("prontuario");
  const [segundos, setSegundos] = useState(0);

  // srcObject imperativo: vídeo local (câmera) e remoto (P2P)
  useEffect(() => {
    if (videoLocalRef.current) videoLocalRef.current.srcObject = streamLocalRef.current;
  }, [streamLocalRef, tele.localPronto]);
  useEffect(() => {
    if (videoRemotoRef.current) videoRemotoRef.current.srcObject = streamRemotoRef.current;
  }, [streamRemotoRef, remotoPronto]);

  // Anotações médicas do prontuário
  const [anotacoes, setAnotacoes] = useState(
    "Paciente em bom estado geral, lúcida e orientada. Relata controle adequado da pressão arterial com uso regular de Losartana 50mg. Queixa de cefaleia tensional leve ocasional.",
  );

  // Chat na chamada (REAL — via sinalização WebRTC)
  const [chatInput, setChatInput] = useState("");

  // Modais de Emissão
  const [modalReceita, setModalReceita] = useState(false);
  const [modalAtestado, setModalAtestado] = useState(false);
  const [modalExame, setModalExame] = useState(false);

  // Form Receita
  const [recTitulo, setRecTitulo] = useState("Receita — Losartana 50mg");
  const [recMedicamento, setRecMedicamento] = useState("Losartana 50mg");
  const [recPosologia, setRecPosologia] = useState("1 comprimido ao dia, pela manhã");
  const [recDuracao, setRecDuracao] = useState("30 dias");
  const [recObs, setRecObs] = useState("Medir pressão arterial 2x por semana.");

  // Form Atestado
  const [atestDias, setAtestDias] = useState("2");
  const [atestCid, setAtestCid] = useState("R51 (Cefaleia)");
  const [atestObs, setAtestObs] = useState(
    "Afastamento das atividades laborais para recuperação clínica.",
  );

  // Form Exame
  const [exameNome, setExameNome] = useState("Hemograma Completo");
  const [exameUrgencia, setExameUrgencia] = useState("Rotina");
  const [exameObs, setExameObs] = useState(
    "Jejum de 8h recomendado. Levar documento e carteirinha do convênio.",
  );

  // Transcrição IA em Tempo Real
  const [transcricoes, setTranscricoes] = useState([
    {
      autor: "Dra. Ana Ribeiro",
      fala: "Boa tarde, Marina. Como você tem passado desde o último atendimento?",
    },
    {
      autor: "Marina Silva",
      fala: "Boa tarde, doutora. A pressão tem ficado em torno de 12 por 8, mas tive um pouco de dor de cabeça ontem.",
    },
    {
      autor: "Dra. Ana Ribeiro",
      fala: "Excelente o controle pressórico. Vamos manter a Losartana e orientar hidratação adequada.",
    },
  ]);

  // ── Mídia obtida pelo hook useTeleconsulta (getUserMedia + P2P) ──

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const tempo = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;

  // Wrappers dos controles de mídia do hook (mantêm nomes locais estáveis)
  const toggleMicLocal = () => alternarMicHook();
  const toggleCamLocal = () => alternarCamHook();

  const toggleTela = async () => {
    if (compartilhando) {
      pararCompartilhamento();
      registrarAudit({
        acao: "CONSULTA_TELA_PAROU",
        categoria: "consulta",
        severidade: "info",
        entidade: "consulta",
        entidadeId: consultaAtual?.id,
        detalhes: "Compartilhamento de tela finalizado",
      });
      return;
    }
    try {
      await compartilharTela();
      registrarAudit({
        acao: "CONSULTA_TELA_COMPARTILHADA",
        categoria: "consulta",
        severidade: "info",
        entidade: "consulta",
        entidadeId: consultaAtual?.id,
        detalhes: "Compartilhamento de tela iniciado durante consulta",
      });
    } catch {
      // usuário cancelou o seletor de tela
    }
  };

  const enviarArquivo = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) =>
      adicionarArquivo({
        nome: f.name,
        tipo: f.type.includes("image") ? "Imagem de exame" : "Documento PDF",
        tamanhoKb: Math.max(1, Math.round(f.size / 1024)),
        enviadoPor: role === "medico" ? "medico" : "paciente",
        consulta: "Consulta em andamento — Dra. Ana Ribeiro",
      }),
    );
  };

  const enviarChat = () => {
    if (!chatInput.trim()) return;
    enviarChatSinal(chatInput);
    setChatInput("");
  };

  const gerarResumoComIA = () => {
    setAnotacoes(
      `RESUMO AUTOMÁTICO IA (BION COPILOT):
• Queixa Principal: Revisão periódica de hipertensão arterial.
• Histórico Atual: Paciente feminina, 32 anos, faz uso regular de Losartana 50mg/dia. Pressão controlada (120x80 mmHg). Queixa eventual de cefaleia tensional leve.
• Conduta: Manter posologia atual de Losartana. Emitida prescrição digital para 30 dias e atestado de 2 dias preventivo. Retorno agendado em 30 dias.`,
    );
  };

  const salvarReceita = (e: React.FormEvent) => {
    e.preventDefault();
    emitirDocumento({
      tipo: "receita",
      titulo: recTitulo,
      medico: "Dra. Ana Ribeiro",
      paciente: "Marina Silva",
      medicamento: recMedicamento,
      posologia: recPosologia,
      duracao: recDuracao,
      observacoes: recObs,
      conteudo: `${recMedicamento} — ${recPosologia} por ${recDuracao}. ${recObs}`,
    });
    toast.success("Receita digital emitida", {
      description: "Assinada e disponível no painel do paciente.",
    });
    setModalReceita(false);
  };

  const salvarAtestado = (e: React.FormEvent) => {
    e.preventDefault();
    emitirDocumento({
      tipo: "atestado",
      titulo: `Atestado — ${atestDias} dias de afastamento`,
      medico: "Dra. Ana Ribeiro",
      paciente: "Marina Silva",
      cid: atestCid,
      duracao: `${atestDias} dias`,
      observacoes: atestObs,
      conteudo: `Atesto para os devidos fins que a paciente necessita de afastamento por ${atestDias} dias. CID: ${atestCid}. ${atestObs}`,
    });
    toast.success("Atestado emitido e assinado", {
      description: "Documento já disponível no painel do paciente.",
    });
    setModalAtestado(false);
  };

  const salvarExame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exameNome.trim()) return;
    emitirDocumento({
      tipo: "exame_solicitado",
      titulo: `Solicitação de Exame — ${exameNome}`,
      medico: "Dra. Ana Ribeiro",
      paciente: "Marina Silva",
      duracao: exameUrgencia,
      observacoes: exameObs,
      conteudo: `Solicita-se: ${exameNome} (urgência: ${exameUrgencia}). ${exameObs}`,
    });
    toast.success("Exame solicitado", {
      description: "O pedido foi enviado ao painel do paciente.",
    });
    setModalExame(false);
  };

  const encerrar = () => {
    // WebRTC real: avisa o outro participante e libera mídia/stream/PC
    encerrarChamada();
    const consultaAlvo = consultas.find((c) => c.status === "confirmada");
    // Concluir consulta é papel do médico (paciente só encerra a chamada)
    if (consultaAlvo && role === "medico") {
      concluirConsulta(consultaAlvo.id, anotacoes);
    }
    onEnd();
  };

  return (
    <div className="-m-5 md:-m-8 min-h-[calc(100vh-4rem)] bg-slate-950 flex flex-col text-white">
      {/* Barra Superior */}
      <div className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-white/10 bg-slate-900/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-bold text-sm shadow-sm">
            {role === "medico" ? "MS" : "AR"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate flex items-center gap-2">
              <span>
                {role === "medico" ? "Marina Silva (Paciente)" : "Dra. Ana Ribeiro (Médica)"}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-xs text-slate-400">
              {role === "medico" ? "32 anos • Retorno" : "Clínica Geral • CRM 12345 SP"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 font-mono font-bold">
            <Clock className="w-3.5 h-3.5 text-primary" /> {tempo}
          </div>
          <div
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-semibold ${
              statusSala === "conectado"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : statusSala === "instavel"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
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

      {/* Área Principal de Vídeo e Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Painel do Vídeo */}
        <div className="flex-1 flex flex-col p-3 md:p-5 gap-4 min-w-0">
          <div className="flex-1 min-h-[320px] relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-white/10 flex items-center justify-center shadow-2xl">
            {/* Feed Remoto REAL (WebRTC P2P) */}
            <video
              ref={videoRemotoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover ${remotoPronto ? "" : "hidden"}`}
 />

            {/* Placeholder com estado real da sala */}
            {!remotoPronto && (
              <div className="flex flex-col items-center gap-4">
                <div className="w-28 h-28 rounded-3xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-4xl font-extrabold text-white shadow-xl">
                  {role === "medico" ? "MS" : "AR"}
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold">
                    {role === "medico" ? "Marina Silva" : "Dra. Ana Ribeiro"}
                  </div>
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

            {/* Picture-in-Picture Local */}
            <div className="absolute top-4 right-4 w-36 h-28 md:w-52 md:h-36 rounded-2xl overflow-hidden bg-slate-900 border-2 border-white/20 shadow-2xl flex items-center justify-center text-xs">
              <video
                ref={videoLocalRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover mirror ${camAtivo ? "" : "hidden"}`}
              />
              {(!camAtivo || erroMidia) && (
                <div className="flex flex-col items-center gap-1 text-slate-400 px-2 text-center">
                  <CameraOff className="w-5 h-5" />
                  <span className="text-[10px] leading-tight">
                    {erroMidia ? "Somente áudio/escuta" : "Câmera Desligada"}
                  </span>
                </div>
              )}
              <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/70 backdrop-blur">
                {compartilhando ? "Tela Compartilhada" : "Você"}
              </span>
            </div>
          </div>

          {/* Barra de Controles Inferior */}
          <div className="flex items-center justify-center gap-2 flex-wrap bg-slate-900/80 backdrop-blur p-3 rounded-2xl border border-white/10">
            <button
              onClick={toggleMicLocal}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition shadow-md ${
                micAtivo
                  ? "bg-white/10 hover:bg-white/20 text-white"
                  : "bg-red-500 text-white hover:bg-red-600"
              }`}
              title={micAtivo ? "Silenciar microfone" : "Ativar microfone"}
            >
              {micAtivo ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleCamLocal}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition shadow-md ${
                camAtivo
                  ? "bg-white/10 hover:bg-white/20 text-white"
                  : "bg-red-500 text-white hover:bg-red-600"
              }`}
              title={camAtivo ? "Desativar câmera" : "Ativar câmera"}
            >
              {camAtivo ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleTela}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition shadow-md ${
                compartilhando
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
              title="Compartilhar tela"
            >
              <MonitorUp className="w-5 h-5" />
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shadow-md"
              title="Enviar exame ou arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {role === "medico" && (
              <>
                <button
                  onClick={() => setModalReceita(true)}
                  className="px-4 h-12 rounded-2xl bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md"
                >
                  <Pill className="w-4 h-4" /> Prescrever Receita
                </button>
                <button
                  onClick={() => setModalAtestado(true)}
                  className="px-4 h-12 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 transition shadow-md"
                >
                  <Award className="w-4 h-4" /> Emitir Atestado
                </button>
                <button
                  onClick={() => setModalExame(true)}
                  className="px-4 h-12 rounded-2xl bg-violet-600/90 hover:bg-violet-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md"
                >
                  <FileText className="w-4 h-4" /> Solicitar Exame
                </button>
              </>
            )}

            <button
              onClick={encerrar}
              className="px-6 h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-2 transition shadow-lg shadow-red-600/30"
            >
              <PhoneOff className="w-4 h-4" /> Encerrar Atendimento
            </button>

            <input
                  aria-label="Anexar arquivo"
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                enviarArquivo(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Sidebar Lateral */}
        <div className="w-80 md:w-96 border-l border-white/10 bg-slate-900/95 flex flex-col min-w-0">
          {/* Abas */}
          <div className="flex border-b border-white/10 text-xs font-bold">
            {(
              [
                ["prontuario", "Prontuário"],
                ["exames", "Exames"],
                ["chat", "Chat"],
                ["ia", "IA Transcrição"],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={`flex-1 py-3.5 transition text-center ${
                  aba === k
                    ? "border-b-2 border-primary text-white bg-white/5"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Conteúdo das Abas */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* Aba Prontuário */}
            {aba === "prontuario" && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-3.5 space-y-2 border border-white/10">
                  <div className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                    Dados do Paciente
                  </div>
                  <div className="text-slate-200">Marina Silva • 32 anos • Feminino</div>
                  <div className="text-slate-400">
                    Alergias: <strong className="text-amber-400">Dipirona</strong>
                  </div>
                  <div className="text-slate-400">Medicamentos: Losartana 50mg</div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                      Evolução Clínica
                    </span>
                    {role === "medico" && (
                      <button
                        onClick={gerarResumoComIA}
                        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Resumir com IA
                      </button>
                    )}
                  </div>
                  <textarea
                  aria-label="Anotações da consulta"
                    value={anotacoes}
                    onChange={(e) => setAnotacoes(e.target.value)}
                    rows={8}
                    disabled={role !== "medico"}
                    placeholder="Registre queixa, hipótese diagnóstica e conduta médica..."
                    className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-primary text-xs leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* Aba Exames */}
            {aba === "exames" && (
              <div className="space-y-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full py-3 rounded-2xl border border-dashed border-white/20 hover:border-primary text-slate-300 text-xs font-bold flex items-center justify-center gap-2 hover:bg-white/5 transition"
                >
                  <Upload className="w-4 h-4 text-primary" /> Anexar Novo Exame
                </button>

                <div className="space-y-2">
                  {arquivos.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{a.nome}</div>
                          <div className="text-[10px] text-slate-400">
                            {a.tipo} • {a.tamanhoKb} KB
                          </div>
                        </div>
                      </div>
                      <button className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aba Chat */}
            {aba === "chat" && (
              <div className="flex flex-col h-full space-y-3">
                <div className="flex-1 space-y-3 overflow-y-auto">
                  {chatMsgs.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-2xl text-xs space-y-1 ${
                        m.minha ? "bg-white/10" : "bg-primary/20 border border-primary/30"
                      }`}
                    >
                      <div className="flex justify-between font-bold text-slate-300 text-[10px]">
                        <span>{m.minha ? "Você" : role === "medico" ? "Marina Silva" : "Dra. Ana Ribeiro"}</span>
                        <span>{m.hora}</span>
                      </div>
                      <p className="text-white leading-relaxed">{m.texto}</p>
                    </div>
                  ))}
                  {chatMsgs.length === 0 && (
                    <div className="text-slate-500 text-center py-6 text-[11px]">
                      Nenhuma mensagem ainda. As mensagens vão direto para o outro
                      participante da consulta.
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-white/10">
                  <input
                  aria-label="Mensagem no chat da consulta"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") enviarChat();
                    }}
                    placeholder="Mensagem no chat da consulta..."
                    className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-xs text-white outline-none focus:border-primary"
                  />
                  <button
                    onClick={enviarChat}
                    className="px-3 py-2 rounded-xl bg-primary text-primary-foreground font-bold"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Aba IA Transcrição */}
            {aba === "ia" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Transcrição Ativa em Tempo Real
                  </span>
                </div>

                <div className="space-y-2.5">
                  {transcricoes.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-1"
                    >
                      <div className="font-bold text-primary text-[11px]">{t.autor}:</div>
                      <p className="text-slate-300 leading-relaxed italic">“{t.fala}”</p>
                    </div>
                  ))}
                </div>

                {role === "medico" && (
                  <button
                    onClick={gerarResumoComIA}
                    className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> Transferir Síntese para o Prontuário
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Emissão de Receita */}
      {modalReceita && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={salvarReceita}
            className="bg-card text-foreground border rounded-3xl max-w-lg w-full p-6 md:p-8 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Pill className="w-5 h-5 text-primary" /> Emitir Receita Digital ICP-Brasil
              </h3>
              <button
                type="button"
                onClick={() => setModalReceita(false)}
                className="text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Título da Receita</label>
                <input
                  aria-label="Título da Receita"
                  value={recTitulo}
                  onChange={(e) => setRecTitulo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Medicamento & Dosagem</label>
                  <input
                  aria-label="Medicamento & Dosagem"
                    value={recMedicamento}
                    onChange={(e) => setRecMedicamento(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Duração</label>
                  <input
                  aria-label="Duração"
                    value={recDuracao}
                    onChange={(e) => setRecDuracao(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Posologia (Modo de usar)</label>
                <input
                  aria-label="Posologia (modo de usar)"
                  value={recPosologia}
                  onChange={(e) => setRecPosologia(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Observações ao Paciente</label>
                <textarea
                  aria-label="Observações ao Paciente"
                  value={recObs}
                  onChange={(e) => setRecObs(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl text-primary-foreground font-bold text-xs shadow-md"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Assinar Digitalmente e Disponibilizar ao Paciente
            </button>
          </form>
        </div>
      )}

      {/* Modal de Emissão de Atestado */}
      {modalAtestado && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={salvarAtestado}
            className="bg-card text-foreground border rounded-3xl max-w-lg w-full p-6 md:p-8 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" /> Emitir Atestado Médico Digital
              </h3>
              <button
                type="button"
                onClick={() => setModalAtestado(false)}
                className="text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Dias de Afastamento</label>
                  <input
                  aria-label="Dias de Afastamento"
                    value={atestDias}
                    onChange={(e) => setAtestDias(e.target.value)}
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">CID-10</label>
                  <input
                  aria-label="CID-10"
                    value={atestCid}
                    onChange={(e) => setAtestCid(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Justificativa e Recomendações</label>
                <textarea
                  aria-label="Justificativa e Recomendações"
                  value={atestObs}
                  onChange={(e) => setAtestObs(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs shadow-md"
            >
              Emitir e Assinar Atestado
            </button>
          </form>
        </div>
      )}

      {/* Modal de Solicitação de Exame */}
      {modalExame && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={salvarExame}
            className="bg-card text-foreground border rounded-3xl max-w-lg w-full p-6 md:p-8 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-500" /> Solicitar Exame Complementar
              </h3>
              <button
                type="button"
                onClick={() => setModalExame(false)}
                className="text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Exame</label>
                <input
                  aria-label="Exame"
                  value={exameNome}
                  onChange={(e) => setExameNome(e.target.value)}
                  placeholder="Ex: Hemograma Completo, Raio-X de Tórax, TGO/TGP"
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Urgência</label>
                <div className="flex gap-2">
                  {["Rotina", "Prioritário", "Urgente"].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setExameUrgencia(u)}
                      className={`flex-1 py-2 rounded-xl border font-bold transition ${
                        exameUrgencia === u
                          ? "bg-violet-600 border-violet-600 text-white"
                          : "hover:border-violet-500 text-muted-foreground"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1">Instruções de Preparo</label>
                <textarea
                  aria-label="Instruções de Preparo"
                  value={exameObs}
                  onChange={(e) => setExameObs(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md transition"
            >
              Enviar Solicitação ao Paciente
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

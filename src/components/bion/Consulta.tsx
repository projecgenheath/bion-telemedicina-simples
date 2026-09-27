"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Upload,
  Pill,
  Award,
  Sparkles,
  Send,
  X,
} from "lucide-react";
import { useBion as useStore, type AnamneseResumo } from "@/lib/bion-store";
import { ModalBion } from "@/components/bion/ModalBion";
import { useTeleconsulta } from "@/lib/use-teleconsulta";
import { ConsultaBarraSuperior } from "@/components/bion/consulta/BarraSuperior";
import { ConsultaAreaVideo } from "@/components/bion/consulta/AreaVideo";
import { ConsultaControlesMidia } from "@/components/bion/consulta/ControlesMidia";

type Role = "paciente" | "medico" | "admin";

export function Consulta({ onEnd, role }: { onEnd: () => void; role: Role }) {
  const {
    arquivos,
    adicionarArquivo,
    emitirDocumento,
    concluirConsulta,
    consultas,
    registrarAudit,
    sessao,
    pacientes,
    anamneses,
  } = useStore();

  // Consulta ativa real (banco) — define a sala WebRTC.
  // Preferência: próxima confirmada futura (janela de 2h) → primeira confirmada → primeira da lista.
  const consultaAtual = useMemo(() => {
    const limite = Date.now() - 2 * 3_600_000;
    const futura = consultas
      .filter((c) => c.status === "confirmada" && c.ts >= limite)
      .sort((a, b) => a.ts - b.ts)[0];
    return futura ?? consultas.find((c) => c.status === "confirmada") ?? consultas[0];
  }, [consultas]);

  // Anamnese da consulta ativa (conduzida pela BION IA antes do atendimento)
  const anamneseAtual: AnamneseResumo | undefined = anamneses.find(
    (a) => a.consultaId === consultaAtual?.id,
  );

  // Contraparte da chamada: dados reais da consulta ativa (fallback: cena demo)
  const contraparteNome =
    role === "medico"
      ? (consultaAtual?.paciente ?? "Marina Silva")
      : (consultaAtual?.medico ?? "Dra. Ana Ribeiro");
  const contraparteDetalhe =
    role === "medico"
      ? `${consultaAtual?.especialidade ?? "Clínica Geral"} • Retorno`
      : `${consultaAtual?.especialidade ?? "Clínica Geral"} • Teleconsulta`;
  const iniciais = (nome: string) =>
    nome
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("");
  const dadosPaciente = pacientes.find(
    (p) =>
      (role === "medico" ? p.id === consultaAtual?.pacienteId : p.nome === sessao.nome) ||
      p.nome === (role === "medico" ? contraparteNome : sessao.nome),
  );

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

  const [aba, setAba] = useState<"prontuario" | "anamnese" | "exames" | "chat" | "ia">("prontuario");

  // Se a consulta ativa tem anamnese da BION IA, abre na aba Anamnese quando ela surgir
  useEffect(() => {
    if (anamneseAtual) setAba((atual) => (atual === "prontuario" ? "anamnese" : atual));
  }, [anamneseAtual?.id]);
  const [segundos, setSegundos] = useState(0);

  // srcObject imperativo: vídeo local (câmera) e remoto (P2P)
  useEffect(() => {
    if (videoLocalRef.current) videoLocalRef.current.srcObject = streamLocalRef.current;
  }, [streamLocalRef, tele.localPronto]);
  useEffect(() => {
    if (videoRemotoRef.current) videoRemotoRef.current.srcObject = streamRemotoRef.current;
  }, [streamRemotoRef, remotoPronto]);

  // Anotações médicas do prontuário — SEMPRE vazias ao iniciar (o resumo
  // salvo na conclusão é o real da consulta; nada pré-preenchido de demo).
  const [anotacoes, setAnotacoes] = useState("");

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
        consulta: consultaAtual
          ? `Consulta em andamento — ${contraparteNome} / ${sessao.nome}`
          : "Consulta em andamento",
      }),
    );
  };

  const enviarChat = () => {
    if (!chatInput.trim()) return;
    enviarChatSinal(chatInput);
    setChatInput("");
  };

  // Insere um MODELO estruturado (sem conteúdo clínico inventado) que o
  // médico preenche com os dados reais da consulta.
  const inserirModeloResumo = () => {
    setAnotacoes(
      `EVOLUÇÃO CLÍNICA — ${contraparteNome} (${consultaAtual?.especialidade ?? "Consulta"})
• Queixa principal: —
• Histórico atual: —
• Exame físico: —
• Hipótese diagnóstica: —
• Conduta: —`,
    );
  };

  const salvarReceita = (e: React.FormEvent) => {
    e.preventDefault();
    emitirDocumento(
      {
        tipo: "receita",
        titulo: recTitulo,
        medico: sessao.nome,
        paciente: contraparteNome,
        medicamento: recMedicamento,
        posologia: recPosologia,
        duracao: recDuracao,
        observacoes: recObs,
        conteudo: `${recMedicamento} — ${recPosologia} por ${recDuracao}. ${recObs}`,
      },
      consultaAtual?.pacienteId,
    );
    toast.success("Receita digital emitida", {
      description: "Assinada e disponível no painel do paciente.",
    });
    setModalReceita(false);
  };

  const salvarAtestado = (e: React.FormEvent) => {
    e.preventDefault();
    emitirDocumento(
      {
        tipo: "atestado",
        titulo: `Atestado — ${atestDias} dias de afastamento`,
        medico: sessao.nome,
        paciente: contraparteNome,
        cid: atestCid,
        duracao: `${atestDias} dias`,
        observacoes: atestObs,
        conteudo: `Atesto para os devidos fins que a paciente necessita de afastamento por ${atestDias} dias. CID: ${atestCid}. ${atestObs}`,
      },
      consultaAtual?.pacienteId,
    );
    toast.success("Atestado emitido e assinado", {
      description: "Documento já disponível no painel do paciente.",
    });
    setModalAtestado(false);
  };

  const salvarExame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exameNome.trim()) return;
    emitirDocumento(
      {
        tipo: "exame_solicitado",
        titulo: `Solicitação de Exame — ${exameNome}`,
        medico: sessao.nome,
        paciente: contraparteNome,
        duracao: exameUrgencia,
        observacoes: exameObs,
        conteudo: `Solicita-se: ${exameNome} (urgência: ${exameUrgencia}). ${exameObs}`,
      },
      consultaAtual?.pacienteId,
    );
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
    <div className="min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden bg-slate-950 flex flex-col text-white">
      <ConsultaBarraSuperior
        contraparteNome={contraparteNome}
        contraparteDetalhe={contraparteDetalhe}
        role={role}
        tempo={tempo}
        statusSala={statusSala}
        iniciais={iniciais}
      />

      {/* Área Principal: vídeo em cima + painel embaixo no celular; lado a lado no desktop */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Painel do Vídeo */}
        <div className="flex-1 flex flex-col p-3 lg:p-5 gap-4 min-w-0">
          <ConsultaAreaVideo
            videoRemotoRef={videoRemotoRef}
            videoLocalRef={videoLocalRef}
            remotoPronto={remotoPronto}
            camAtivo={camAtivo}
            erroMidia={erroMidia}
            compartilhando={compartilhando}
            contraparteNome={contraparteNome}
            iniciais={iniciais}
            statusSala={statusSala}
            outroOnline={outroOnline}
          />
          <ConsultaControlesMidia
            role={role}
            micAtivo={micAtivo}
            camAtivo={camAtivo}
            compartilhando={compartilhando}
            onToggleMic={toggleMicLocal}
            onToggleCam={toggleCamLocal}
            onToggleTela={toggleTela}
            onAnexar={() => fileRef.current?.click()}
            onReceita={() => setModalReceita(true)}
            onAtestado={() => setModalAtestado(true)}
            onExame={() => setModalExame(true)}
            onEncerrar={encerrar}
            fileRef={fileRef}
            onArquivos={enviarArquivo}
          />
        </div>

        <ConsultaPainelLateral
          role={role}
          aba={aba}
          setAba={setAba}
          anamneseAtual={anamneseAtual}
          contraparteNome={contraparteNome}
          sessaoNome={sessao.nome}
          dadosPaciente={dadosPaciente}
          anotacoes={anotacoes}
          setAnotacoes={setAnotacoes}
          arquivos={arquivos}
          chatMsgs={chatMsgs}
          chatInput={chatInput}
          setChatInput={setChatInput}
          enviarChat={enviarChat}
          onAnexarExame={() => fileRef.current?.click()}
        />
      </div>

      {/* Modal de Emissão de Receita */}
      {modalReceita && (
        <ModalBion
          aberto
          onFechar={() => setModalReceita(false)}
          titulo="Emitir Receita Digital"
          largura="max-w-lg"
          overlay="bg-black/70 backdrop-blur-sm"
          foraFecha={false}
          className="py-4"
        >
          <form
            onSubmit={salvarReceita}
            className="bg-card text-foreground border rounded-3xl w-full p-6 md:p-8 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Pill className="w-5 h-5 text-primary" /> Emitir Receita Digital (assinatura eletrônica)
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
        </ModalBion>
      )}

      {/* Modal de Emissão de Atestado */}
      {modalAtestado && (
        <ModalBion
          aberto
          onFechar={() => setModalAtestado(false)}
          titulo="Emitir Atestado Médico Digital"
          largura="max-w-lg"
          overlay="bg-black/70 backdrop-blur-sm"
          foraFecha={false}
          className="py-4"
        >
          <form
            onSubmit={salvarAtestado}
            className="bg-card text-foreground border rounded-3xl w-full p-6 md:p-8 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
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
        </ModalBion>
      )}

      {/* Modal de Solicitação de Exame */}
      {modalExame && (
        <ModalBion
          aberto
          onFechar={() => setModalExame(false)}
          titulo="Solicitar Exame Complementar"
          largura="max-w-lg"
          overlay="bg-black/70 backdrop-blur-sm"
          foraFecha={false}
          className="py-4"
        >
          <form
            onSubmit={salvarExame}
            className="bg-card text-foreground border rounded-3xl w-full p-6 md:p-8 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-500 dark:text-violet-400" /> Solicitar Exame Complementar
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
                          ? "bg-violet-600 dark:bg-violet-500 border-violet-600 dark:border-violet-500 text-white"
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
              className="w-full py-3 rounded-2xl bg-violet-600 dark:bg-violet-500 hover:bg-violet-700 text-white font-bold text-xs shadow-md transition"
            >
              Enviar Solicitação ao Paciente
            </button>
          </form>
        </ModalBion>
      )}
    </div>
  );
}

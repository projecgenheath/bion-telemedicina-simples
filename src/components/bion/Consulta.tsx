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
import { ConsultaPainelLateral } from "@/components/bion/consulta/PainelLateral";

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

  // Contraparte da chamada: dados reais da consulta ativa (sem nomes demo)
  const contraparteNome =
    role === "medico"
      ? (consultaAtual?.paciente ?? "Paciente")
      : (consultaAtual?.medico ?? "Médico(a)");
  const contraparteDetalhe = `${consultaAtual?.especialidade ?? "Consulta"} • Teleconsulta`;
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

  // Formulários de emissão — SEMPRE vazios: nada clínico pré-preenchido
  // (um clique em "emitir" não pode gerar receita/atestado/exame fictício).
  // Form Receita
  const [recTitulo, setRecTitulo] = useState("");
  const [recMedicamento, setRecMedicamento] = useState("");
  const [recPosologia, setRecPosologia] = useState("");
  const [recDuracao, setRecDuracao] = useState("");
  const [recObs, setRecObs] = useState("");

  // Form Atestado
  const [atestDias, setAtestDias] = useState("");
  const [atestCid, setAtestCid] = useState("");
  const [atestObs, setAtestObs] = useState("");

  // Form Exame
  const [exameNome, setExameNome] = useState("");
  const [exameUrgencia, setExameUrgencia] = useState("Rotina");
  const [exameObs, setExameObs] = useState("");

  const limparReceita = () => {
    setRecTitulo("");
    setRecMedicamento("");
    setRecPosologia("");
    setRecDuracao("");
    setRecObs("");
  };
  const limparAtestado = () => {
    setAtestDias("");
    setAtestCid("");
    setAtestObs("");
  };
  const limparExame = () => {
    setExameNome("");
    setExameUrgencia("Rotina");
    setExameObs("");
  };

  /** Emissão só com consulta ativa e paciente identificado (por ID). */
  const pacienteIdAtual = role === "medico" ? consultaAtual?.pacienteId : undefined;
  const podeEmitir = () => {
    if (!consultaAtual || !pacienteIdAtual) {
      toast.error("Nenhuma consulta ativa identificada", {
        description: "Não foi possível identificar o paciente desta consulta. Documento não emitido.",
      });
      return false;
    }
    return true;
  };

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
    if (!recMedicamento.trim() || !recPosologia.trim() || !recDuracao.trim()) return;
    if (!podeEmitir()) return;
    const medicamento = recMedicamento.trim();
    const obs = recObs.trim();
    emitirDocumento(
      {
        tipo: "receita",
        titulo: recTitulo.trim() || `Receita — ${medicamento}`,
        medico: sessao.nome,
        paciente: contraparteNome,
        medicamento,
        posologia: recPosologia.trim(),
        duracao: recDuracao.trim(),
        observacoes: obs,
        conteudo: `${medicamento} — ${recPosologia.trim()} por ${recDuracao.trim()}.${obs ? ` ${obs}` : ""}`,
      },
      pacienteIdAtual,
    );
    toast.success("Receita emitida", {
      description: "Disponível no painel do paciente. Documento sem assinatura digital ICP-Brasil.",
    });
    limparReceita();
    setModalReceita(false);
  };

  const salvarAtestado = (e: React.FormEvent) => {
    e.preventDefault();
    const dias = parseInt(atestDias, 10);
    if (!Number.isFinite(dias) || dias < 1 || !atestObs.trim()) return;
    if (!podeEmitir()) return;
    const cid = atestCid.trim();
    const obs = atestObs.trim();
    const rotuloDias = `${dias} ${dias === 1 ? "dia" : "dias"}`;
    emitirDocumento(
      {
        tipo: "atestado",
        titulo: `Atestado — ${rotuloDias} de afastamento`,
        medico: sessao.nome,
        paciente: contraparteNome,
        cid: cid || undefined,
        duracao: rotuloDias,
        observacoes: obs,
        conteudo: `Atesto para os devidos fins que o(a) paciente necessita de afastamento por ${rotuloDias}.${cid ? ` CID: ${cid}.` : ""} ${obs}`,
      },
      pacienteIdAtual,
    );
    toast.success("Atestado emitido", {
      description: "Disponível no painel do paciente. Documento sem assinatura digital ICP-Brasil.",
    });
    limparAtestado();
    setModalAtestado(false);
  };

  const salvarExame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exameNome.trim()) return;
    if (!podeEmitir()) return;
    emitirDocumento(
      {
        tipo: "exame_solicitado",
        titulo: `Solicitação de Exame — ${exameNome.trim()}`,
        medico: sessao.nome,
        paciente: contraparteNome,
        duracao: exameUrgencia,
        observacoes: exameObs.trim(),
        conteudo: `Solicita-se: ${exameNome.trim()} (urgência: ${exameUrgencia}).${exameObs.trim() ? ` ${exameObs.trim()}` : ""}`,
      },
      pacienteIdAtual,
    );
    toast.success("Exame solicitado", {
      description: "O pedido foi enviado ao painel do paciente.",
    });
    limparExame();
    setModalExame(false);
  };

  const encerrar = () => {
    // WebRTC real: avisa o outro participante e libera mídia/stream/PC
    encerrarChamada();
    // Concluir consulta é papel do médico (paciente só encerra a chamada).
    // C4: conclui SEMPRE a consulta desta sala (a mesma usada no WebRTC) —
    // nunca "a primeira confirmada da lista", que pode ser de outro paciente.
    if (role === "medico" && consultaAtual) {
      if (consultaAtual.status === "confirmada") {
        concluirConsulta(consultaAtual.id, anotacoes);
      } else {
        toast.info("Chamada encerrada", {
          description: "A consulta não foi marcada como concluída porque não está confirmada.",
        });
      }
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
          inserirModeloResumo={inserirModeloResumo}
        />
      </div>

      {/* Modal de Emissão de Receita */}
      {modalReceita && (
        <ModalBion
          aberto
          onFechar={() => setModalReceita(false)}
          titulo="Emitir Receita"
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
                <Pill className="w-5 h-5 text-primary" /> Emitir Receita
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
                <label className="font-bold block mb-1">Título da Receita (opcional)</label>
                <input
                  aria-label="Título da Receita"
                  value={recTitulo}
                  onChange={(e) => setRecTitulo(e.target.value)}
                  placeholder="Padrão: Receita — <medicamento>"
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Medicamento & Dosagem</label>
                  <input
                  aria-label="Medicamento & Dosagem"
                    value={recMedicamento}
                    onChange={(e) => setRecMedicamento(e.target.value)}
                    placeholder="Nome, concentração e forma"
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
                    placeholder="Ex.: 7 dias, uso contínuo"
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
                  placeholder="Dose, via, frequência e horário"
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
              Emitir e Disponibilizar ao Paciente
            </button>
          </form>
        </ModalBion>
      )}

      {/* Modal de Emissão de Atestado */}
      {modalAtestado && (
        <ModalBion
          aberto
          onFechar={() => setModalAtestado(false)}
          titulo="Emitir Atestado Médico"
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
                <Award className="w-5 h-5 text-primary" /> Emitir Atestado Médico
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
                  <label className="font-bold block mb-1">CID-10 (opcional)</label>
                  <input
                  aria-label="CID-10"
                    value={atestCid}
                    onChange={(e) => setAtestCid(e.target.value)}
                    placeholder="Somente com autorização do paciente"
                    className="w-full px-3 py-2 rounded-xl border bg-background"
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
              Emitir Atestado
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

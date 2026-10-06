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
  Clock,
  ArrowLeft,
} from "lucide-react";
import { useBion as useStore, type AnamneseResumo } from "@/lib/bion-store";
import { ModalBion } from "@/components/bion/ModalBion";
import { useTeleconsulta } from "@/lib/use-teleconsulta";
import { exibirForaDaJanela, textoForaDaJanela } from "@/lib/teleconsulta-logica";
import { ConsultaBarraSuperior } from "@/components/bion/consulta/BarraSuperior";
import { ConsultaAreaVideo } from "@/components/bion/consulta/AreaVideo";
import { ConsultaControlesMidia } from "@/components/bion/consulta/ControlesMidia";
import { ConsultaPainelLateral } from "@/components/bion/consulta/PainelLateral";
import { EncerrarAtendimento, type EscolhaEncerrar } from "@/components/bion/consulta/EncerrarAtendimento";
import { avisarDadosMedicoAlterados } from "@/components/bion/medico/useDadosMedico";

type Role = "paciente" | "medico" | "admin";

export function Consulta({
  onEnd,
  role,
  consultaId,
}: {
  onEnd: () => void;
  role: Role;
  /** `?consulta=<id>` da URL: a sala é DESTA consulta. Sem ele, adivinha (links antigos). */
  consultaId?: string;
}) {
  const {
    arquivos,
    adicionarArquivo,
    emitirDocumento,
    aplicarDelta,
    consultas,
    registrarAudit,
    sessao,
    pacientes,
    anamneses,
  } = useStore();

  // Consulta da sala (banco) — define a sala WebRTC.
  // Com `?consulta=<id>`: SEMPRE essa (o servidor confere se a pessoa participa).
  // Sem o parâmetro (links antigos): próxima confirmada futura (janela de 2h) →
  // primeira confirmada → primeira da lista.
  const consultaAtual = useMemo(() => {
    if (consultaId) return consultas.find((c) => c.id === consultaId);
    const limite = Date.now() - 2 * 3_600_000;
    const futura = consultas
      .filter((c) => c.status === "confirmada" && c.ts >= limite)
      .sort((a, b) => a.ts - b.ts)[0];
    return futura ?? consultas.find((c) => c.status === "confirmada") ?? consultas[0];
  }, [consultas, consultaId]);
  /** Id da sala: o da URL mesmo antes de o store carregar a consulta. */
  const idSala = consultaId ?? consultaAtual?.id;

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
  // Só por id: comparar por nome mostrava dados de um homônimo.
  const idPacienteSala = role === "medico" ? consultaAtual?.pacienteId : sessao.id;
  const dadosPaciente = idPacienteSala ? pacientes.find((p) => p.id === idPacienteSala) : undefined;

  // ── WebRTC REAL (Fase 2): mídia P2P + sinalização via banco ──
  const tele = useTeleconsulta(idSala);
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
    sair: sairDaChamada,
    outroSaiu,
    qualidade,
    reconectando,
    foraDaJanela,
  } = tele;
  // Sala fora da janela (409 do servidor) e sem chamada em andamento: mensagem
  // simples no lugar da área de espera (a Parte 3 redesenha esta tela).
  const salaForaDaJanela = exibirForaDaJanela(foraDaJanela, statusSala) ? foraDaJanela : null;

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
        entidadeId: idSala,
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
        entidadeId: idSala,
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

  // Médico: "Encerrar" abre a escolha (concluir / falta do paciente / falha
  // técnica / sair sem concluir). Regras do Alisson (06/10/2026): sem o
  // paciente na sala a consulta NÃO é concluída (o servidor também recusa).
  const [escolhaAberta, setEscolhaAberta] = useState(false);

  const sairDaSala = () => {
    // Só o médico encerra a chamada para os dois. O paciente SAI (o médico
    // vê "Paciente saiu da chamada" e pode esperar ele voltar).
    if (role === "medico") encerrarChamada();
    else sairDaChamada();
    onEnd();
  };

  const encerrar = () => {
    if (role === "medico" && idSala) {
      setEscolhaAberta(true);
      return;
    }
    // Paciente só sai da chamada (não encerra a consulta).
    sairDaSala();
  };

  /** Executa a escolha do médico. Devolve a recusa do servidor (fica no modal) ou null. */
  const executarEscolha = async (escolha: EscolhaEncerrar): Promise<string | null> => {
    if (!idSala) return "Nenhuma consulta identificada nesta sala.";
    if (escolha === "sair") {
      setEscolhaAberta(false);
      toast.info("Você saiu sem concluir", {
        description: "Dá para marcar falta do paciente ou falha técnica pela agenda até 23:30 de hoje.",
      });
      sairDaSala();
      return null;
    }
    // C4: SEMPRE a consulta desta sala (a mesma usada no WebRTC).
    const req =
      escolha === "concluir"
        ? fetch(`/api/consultas/${encodeURIComponent(idSala)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao: "concluir", resumo: anotacoes }),
          })
        : fetch(`/api/medico/consultas/${encodeURIComponent(idSala)}/desfecho`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo: escolha }),
          });
    let res: Response;
    try {
      res = await req;
    } catch {
      return "Falha de conexão com o servidor.";
    }
    const json = (await res.json().catch(() => null)) as ({ erro?: string } & Record<string, unknown>) | null;
    if (!res.ok) return json?.erro ?? `Não foi possível concluir a operação (erro ${res.status}).`;
    aplicarDelta(json);
    avisarDadosMedicoAlterados();
    setEscolhaAberta(false);
    if (escolha === "concluir") {
      toast.success("Consulta concluída");
    } else if (escolha === "falta_paciente") {
      toast.success("Falta do paciente registrada", {
        description: "Você recebe normalmente. O paciente foi avisado e pode pedir reembolso em até 7 dias.",
      });
    } else {
      toast.success("Falha técnica registrada", {
        description: "O paciente foi avisado e escolhe entre remarcar sem custo ou o reembolso.",
      });
    }
    sairDaSala();
    return null;
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
          {salaForaDaJanela ? (
            <AvisoForaDaJanela textos={textoForaDaJanela(salaForaDaJanela, Date.now())} onVoltar={onEnd} />
          ) : (
          <>
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
            outroSaiu={outroSaiu}
            qualidade={qualidade}
            reconectando={reconectando}
            role={role}
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
          </>
          )}
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

      {role === "medico" ? (
        <EncerrarAtendimento
          aberto={escolhaAberta}
          consultaId={idSala}
          outroOnline={outroOnline}
          onFechar={() => setEscolhaAberta(false)}
          onEscolher={executarEscolha}
        />
      ) : null}

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

/** Sala fora da janela: "A sala abre às HH:MM" / "A sala já fechou" + Voltar (visual mínimo). */
function AvisoForaDaJanela({
  textos,
  onVoltar,
}: {
  textos: { titulo: string; detalhe: string };
  onVoltar: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="aspect-video lg:aspect-auto lg:flex-1 lg:min-h-[320px] w-full shrink-0 lg:shrink rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-white/10 flex items-center justify-center shadow-2xl p-6"
    >
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-16 h-16 rounded-3xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
          <Clock className="w-7 h-7 text-white" />
        </div>
        <div>
          <div className="text-lg font-bold">{textos.titulo}</div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">{textos.detalhe}</p>
        </div>
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold transition"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
      </div>
    </div>
  );
}

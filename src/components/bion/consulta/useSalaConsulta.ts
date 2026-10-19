"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBion as useStore, type AnamneseResumo } from "@/lib/bion-store";
import { useTeleconsulta } from "@/lib/use-teleconsulta";
import { exibirForaDaJanela } from "@/lib/teleconsulta-logica";

export type PapelSala = "paciente" | "medico" | "admin";

/**
 * Estado e ações COMUNS da sala de teleconsulta (paciente, médico e admin).
 * Movido de Consulta.tsx sem mudar comportamento: a tela de cada papel
 * (medico/ChamadaMedico.tsx, paciente/ChamadaPaciente.tsx) usa este hook e
 * acrescenta só o que é dela (emissão de documentos e desfecho no médico).
 */
export function useSalaConsulta({
  role,
  consultaId,
  onEnd,
}: {
  role: PapelSala;
  consultaId?: string;
  onEnd: () => void;
}) {
  const { arquivos, adicionarArquivo, consultas, registrarAudit, sessao, pacientes, anamneses } = useStore();

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
  // Sala fora da janela (409 do servidor) e sem chamada em andamento: mensagem
  // simples no lugar da área de espera (a Parte 3 redesenha esta tela).
  const salaForaDaJanela = exibirForaDaJanela(tele.foraDaJanela, tele.status) ? tele.foraDaJanela : null;

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
  const { streamLocalRef, streamRemotoRef, localPronto, remotoPronto } = tele;
  useEffect(() => {
    if (videoLocalRef.current) videoLocalRef.current.srcObject = streamLocalRef.current;
  }, [streamLocalRef, localPronto]);
  useEffect(() => {
    if (videoRemotoRef.current) videoRemotoRef.current.srcObject = streamRemotoRef.current;
  }, [streamRemotoRef, remotoPronto]);

  // Anotações médicas do prontuário — SEMPRE vazias ao iniciar (o resumo
  // salvo na conclusão é o real da consulta; nada pré-preenchido de demo).
  const [anotacoes, setAnotacoes] = useState("");

  // Chat na chamada (REAL — via sinalização WebRTC)
  const [chatInput, setChatInput] = useState("");

  // Cronômetro da chamada. Para com o 404 (consulta não encontrada): a chamada
  // (polling, ICE, PeerConnection e câmera) já foi desligada em teleconsulta-chamada.ts.
  const naoEncontrada = tele.naoEncontrada;
  useEffect(() => {
    if (naoEncontrada) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [naoEncontrada]);

  const tempo = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;

  // Wrappers dos controles de mídia do hook (mantêm nomes locais estáveis)
  const toggleMicLocal = () => tele.toggleMic();
  const toggleCamLocal = () => tele.toggleCam();

  const toggleTela = async () => {
    if (tele.compartilhando) {
      tele.pararCompartilhamento();
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
      await tele.compartilharTela();
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
    tele.enviarChat(chatInput);
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

  const sairDaSala = () => {
    // Só o médico encerra a chamada para os dois. O paciente SAI (o médico
    // vê "Paciente saiu da chamada" e pode esperar ele voltar).
    if (role === "medico") tele.encerrar();
    else tele.sair();
    onEnd();
  };

  return {
    sessao,
    arquivos,
    consultaAtual,
    idSala,
    anamneseAtual,
    contraparteNome,
    contraparteDetalhe,
    iniciais,
    dadosPaciente,
    tele,
    salaForaDaJanela,
    videoLocalRef,
    videoRemotoRef,
    fileRef,
    aba,
    setAba,
    tempo,
    anotacoes,
    setAnotacoes,
    chatInput,
    setChatInput,
    toggleMicLocal,
    toggleCamLocal,
    toggleTela,
    enviarArquivo,
    enviarChat,
    inserirModeloResumo,
    sairDaSala,
  };
}

export type SalaConsulta = ReturnType<typeof useSalaConsulta>;

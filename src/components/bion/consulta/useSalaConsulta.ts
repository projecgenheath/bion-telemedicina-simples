"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useBion as useStore, type AnamneseResumo } from "@/lib/bion-store";
import { useTeleconsulta } from "@/lib/use-teleconsulta";
import { exibirForaDaJanela, restanteDoSlot } from "@/lib/teleconsulta-logica";

export type PapelSala = "paciente" | "medico" | "admin";

/**
 * Resumo clínico do paciente para o cartão da sala (só o médico carrega):
 * é o subconjunto de segurança do GET da evolução — alergias em destaque,
 * comorbidades, tipo sanguíneo e medicamentos em uso. Antes o cartão
 * mostrava "ver prontuário" justamente na aba Prontuário.
 */
export type ResumoClinicoSala = {
  alergias: string[];
  comorbidades: string[];
  tipoSanguineo: string;
  medicamentosEmUso: { id: string; nome: string; dose: string | null; controlado: boolean }[];
};

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
  const { arquivos, adicionarArquivo, consultas, registrarAudit, sessao, pacientes, anamneses, carregando, aplicarDelta } =
    useStore();

  // Consulta da sala — ESTRITA, sem adivinhação: a sala é EXATAMENTE a
  // consulta do `?consulta=<id>`. Sem id, sem consulta encontrada no store
  // ou com participante divergente, NÃO se escolhe outra consulta
  // (a escolha automática antiga podia abrir a sala errada e deixar a tela
  // em "Aguardando o outro participante" para sempre). A tela de erro
  // explícita vive na página (/consulta/page.tsx), única montagem da sala;
  // aqui o hook só garante: nada de tele, câmera ou cronômetro sem uma
  // consulta válida, e expõe os flags para quem for renderizar o erro.
  const consultaAtual = useMemo(() => {
    if (!consultaId) return undefined;
    return consultas.find((c) => c.id === consultaId);
  }, [consultas, consultaId]);
  /** Id da sala: exatamente o da URL, mesmo antes de o store carregar a consulta. */
  const idSala = consultaId;
  // Participante divergente (só quando os dois ids existem no store; sem
  // id, o servidor decide com 403 — o store não deve inventar um não).
  // Admin não entra na sala (o roteador o desvia), então não é barrado aqui.
  const participanteInvalido =
    role !== "admin" &&
    consultaAtual !== undefined &&
    sessao.id !== undefined &&
    sessao.id !== "" &&
    consultaAtual.medicoId !== undefined &&
    consultaAtual.pacienteId !== undefined &&
    sessao.id !== consultaAtual.medicoId &&
    sessao.id !== consultaAtual.pacienteId;
  /** Store já carregou e não há id válido / consulta / participante. */
  const consultaInvalida =
    !carregando && (consultaId === undefined || consultaAtual === undefined || participanteInvalido);
  const consultaValida = consultaAtual !== undefined && !participanteInvalido;
  /** Mesmo critério do servidor: em_espera só entra na sala depois de paga. */
  const pagamentoPendente = consultaAtual?.status === "em_espera" && consultaAtual.pago !== true;
  /** Sem consulta válida ou sem pagamento, o tele nem monta (sem polling, sem câmera). */
  const teleBloqueada = consultaInvalida || pagamentoPendente;

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

  // Cartão clínico da sala (só médico): reaproveita a MESMA chamada do
  // PainelEvolucao (GET /api/medico/consultas/[id]/evolucao), que já
  // devolve alergias/comorbidades/tipo sanguíneo e medicamentos em uso —
  // sem endpoint novo. Falha de rede/permissão deixa o resumo nulo e o
  // cartão cai para a exibição anterior (nada de erro inventado na sala).
  const [resumoClinico, setResumoClinico] = useState<ResumoClinicoSala | null>(null);
  useEffect(() => {
    if (role !== "medico" || !consultaValida || !idSala) return;
    let vivo = true;
    fetch(`/api/medico/consultas/${encodeURIComponent(idSala)}/evolucao`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { paciente?: { alergias?: string[]; comorbidades?: string[]; tipoSanguineo?: string }; medicamentosEmUso?: ResumoClinicoSala["medicamentosEmUso"] } | null) => {
        if (!vivo || !j?.paciente) return;
        setResumoClinico({
          alergias: j.paciente.alergias ?? [],
          comorbidades: j.paciente.comorbidades ?? [],
          tipoSanguineo: j.paciente.tipoSanguineo ?? "",
          medicamentosEmUso: (j.medicamentosEmUso ?? []).map((m) => ({
            id: m.id,
            nome: m.nome,
            dose: m.dose ?? null,
            controlado: !!m.controlado,
          })),
        });
      })
      .catch(() => {
        /* resumo é apoio à decisão: a sala segue sem ele */
      });
    return () => {
      vivo = false;
    };
  }, [role, consultaValida, idSala]);

  // ── WebRTC REAL (Fase 2): mídia P2P + sinalização via banco ──
  // Bloqueada (sem idSala): o hook do tele devolve o estado inicial, sem
  // polling e sem pedir câmera — nunca "aguardando" uma sala que não existe.
  const tele = useTeleconsulta(teleBloqueada ? undefined : idSala);
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

  // ── Resumo da consulta (painel lateral) com AUTOSSALVAMENTO ──
  // Item 27 (sala unificada): o texto lateral é o Consulta.resumoMedico —
  // destino DIFERENTE do rascunho da Evolucao (seções estruturadas que
  // autossalvam no PUT da evolução). Como os destinos são outros, os
  // campos não se unificam; o que faltava era o lateral salvar sozinho
  // como a evolução já salvava — antes ele só era gravado no "concluir"
  // e se perdia ao sair sem concluir. Autosave com debounce de 1,2 s
  // (mesmo ritmo do PainelEvolucao) pela ação "salvarResumo" do PATCH
  // da consulta, que grava SÓ o resumo, sem mudar status.
  const [anotacoes, setAnotacoesEstado] = useState("");
  // Estado do salvamento do resumo, no vocabulário do PainelEvolucao:
  // "salvando" cobre o debounce pendente e o voo da requisição; "erro"
  // é falha de salvamento (o texto continua NÃO salvo).
  const [resumoStatus, setResumoStatus] = useState<"ok" | "salvando" | "erro">("ok");
  const anotacoesRef = useRef("");
  /** Último texto que o servidor confirmou ter gravado. */
  const ultimoResumoSalvoRef = useRef("");
  const timerResumoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumoMontadoRef = useRef(true);
  // M-8 (mesmo cuidado do PainelEvolucao): o timer do autosave morre na
  // desmontagem — e respostas tardias não escrevem em tela desmontada.
  useEffect(() => {
    resumoMontadoRef.current = true;
    return () => {
      resumoMontadoRef.current = false;
      if (timerResumoRef.current) clearTimeout(timerResumoRef.current);
    };
  }, []);

  const salvarResumoAgora = useCallback(
    async (texto: string) => {
      if (!idSala) return;
      setResumoStatus("salvando");
      const res = await fetch(`/api/consultas/${encodeURIComponent(idSala)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvarResumo", resumo: texto }),
      }).catch(() => null);
      if (!resumoMontadoRef.current) return;
      if (res?.ok) {
        ultimoResumoSalvoRef.current = texto;
        // Mantém o store em sincronia (consulta.resumoMedico = o salvo).
        const json = (await res.json().catch(() => null)) as unknown;
        if (json && resumoMontadoRef.current) aplicarDelta(json);
        // Se o texto mudou durante o voo, a digitação já agendou o
        // próximo salvamento: o status continua "salvando" até lá.
        if (anotacoesRef.current === texto) setResumoStatus("ok");
      } else {
        // 409 de consulta encerrada também cai aqui: o texto não foi
        // gravado e o indicador mostra "Não salvou", sem esconder.
        setResumoStatus("erro");
      }
    },
    [idSala, aplicarDelta],
  );

  const agendarSalvarResumo = useCallback(() => {
    if (timerResumoRef.current) clearTimeout(timerResumoRef.current);
    timerResumoRef.current = setTimeout(() => void salvarResumoAgora(anotacoesRef.current), 1200);
  }, [salvarResumoAgora]);

  /** Retry imediato do indicador de erro (mesmo padrão do PainelEvolucao). */
  const tentarSalvarResumoDeNovo = useCallback(() => {
    if (timerResumoRef.current) clearTimeout(timerResumoRef.current);
    void salvarResumoAgora(anotacoesRef.current);
  }, [salvarResumoAgora]);

  // Setter público do resumo: TODA escrita (digitação, ditado, modelo)
  // passa por aqui e agenda o autossalvamento — só para o médico, que é
  // quem escreve o resumo (o textarea é desabilitado nos demais papéis).
  const setAnotacoes = useCallback(
    (v: string) => {
      anotacoesRef.current = v;
      setAnotacoesEstado(v);
      if (role !== "medico" || !idSala || !consultaValida) return;
      if (v === ultimoResumoSalvoRef.current) {
        // Voltou exatamente ao texto já salvo: nada pendente.
        if (timerResumoRef.current) clearTimeout(timerResumoRef.current);
        setResumoStatus("ok");
        return;
      }
      setResumoStatus("salvando");
      agendarSalvarResumo();
    },
    [role, idSala, consultaValida, agendarSalvarResumo],
  );

  // Hidratação (item 27): reabrir a sala com resumo já salvo (de uma
  // entrada anterior) mostra ESSE texto — nunca uma caixa vazia por
  // cima do que está gravado. O wire já traz resumoMedico na consulta.
  // Uma vez por consulta; se o médico já digitou algo nesta sala antes
  // de o store carregar, o texto da tela manda e o autosave o persiste.
  const resumoHidratadoRef = useRef<string | null>(null);
  useEffect(() => {
    if (role !== "medico" || !consultaAtual || resumoHidratadoRef.current === consultaAtual.id) return;
    resumoHidratadoRef.current = consultaAtual.id;
    if (anotacoesRef.current !== "") {
      // Digitou antes da hidratação: persiste o texto da tela.
      if (anotacoesRef.current !== ultimoResumoSalvoRef.current) {
        setResumoStatus("salvando");
        agendarSalvarResumo();
      }
      return;
    }
    const salvo = consultaAtual.resumoMedico ?? "";
    ultimoResumoSalvoRef.current = salvo;
    anotacoesRef.current = salvo;
    setAnotacoesEstado(salvo);
  }, [role, consultaAtual, agendarSalvarResumo]);

  /** Há texto do resumo ainda NÃO salvo (debounce pendente ou erro). */
  const resumoPendente = resumoStatus !== "ok";

  // Chat na chamada (REAL — via sinalização WebRTC)
  const [chatInput, setChatInput] = useState("");

  // Cronômetro da chamada. Só roda com consulta válida e paga: para com o
  // 404 (consulta não encontrada — polling, ICE, PeerConnection e câmera já
  // foram desligados em teleconsulta-chamada.ts) e nunca conta para uma
  // sala inválida ou com pagamento pendente (o tempo volta a zero).
  const naoEncontrada = tele.naoEncontrada;
  useEffect(() => {
    if (naoEncontrada || !consultaValida || pagamentoPendente) {
      setSegundos(0);
      return;
    }
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [naoEncontrada, consultaValida, pagamentoPendente]);

  const tempo = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;

  // Tempo até o fim do slot agendado (dataInicio + duração padrão), ao
  // lado do cronômetro crescente: referência para gerir o ritmo da
  // consulta. É derivado de Date.now() a cada render; o intervalo de 1 s
  // do cronômetro acima garante um render por segundo enquanto a sala
  // está válida, então o valor não fica velho.
  const restanteSlot =
    consultaValida && consultaAtual?.ts ? restanteDoSlot(consultaAtual.ts, Date.now()) : null;

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
    } catch (e) {
      // Cancelar o seletor de tela é normal (AbortError) e fica em silêncio;
      // qualquer outro erro (permissão, tela em uso) precisa aparecer.
      if ((e as Error)?.name !== "AbortError") {
        toast.error("Não foi possível compartilhar a tela. Tente novamente.");
      }
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
        // Upload real: sem `file` o store só grava metadados e o exame
        // nunca chega ao servidor (o anexo "existia" só na tela).
        file: f,
        pacienteId: idPacienteSala,
        consultaId: consultaAtual?.id,
      }),
    );
  };

  const enviarChat = async () => {
    if (!chatInput.trim()) return;
    const texto = chatInput;
    // Só limpa depois da confirmação: em falha, o texto fica no campo e o
    // erro aparece, em vez de a mensagem sumir sem ter sido entregue.
    const ok = (await tele.enviarChat(texto)) ?? false;
    if (ok) setChatInput("");
    else toast.error("Não foi possível enviar a mensagem. Verifique a conexão e tente novamente.");
  };

  // Insere um MODELO estruturado (sem conteúdo clínico inventado) que o
  // médico preenche com os dados reais da consulta.
  const aplicarModeloResumo = () => {
    setAnotacoes(
      `EVOLUÇÃO CLÍNICA — ${contraparteNome} (${consultaAtual?.especialidade ?? "Consulta"})
• Queixa principal: —
• Histórico atual: —
• Exame físico: —
• Hipótese diagnóstica: —
• Conduta: —`,
    );
  };

  // O1: com texto já digitado, inserir o modelo NÃO substitui em
  // silêncio — trocar o conteúdo aqui apaga o que o médico escreveu
  // (e a substituição também é autossalvada, então seria definitiva).
  // Abre a confirmação (modal na SalaConsultaTela, mesmo padrão do
  // "sair sem concluir") e só aplica com a ação explícita do médico.
  // Texto vazio (ou só espaços) segue direto, sem fricção.
  const [confirmarModeloResumo, setConfirmarModeloResumo] = useState(false);
  const inserirModeloResumo = () => {
    if (anotacoes.trim()) {
      setConfirmarModeloResumo(true);
      return;
    }
    aplicarModeloResumo();
  };
  const confirmarInsercaoModeloResumo = () => {
    aplicarModeloResumo();
    setConfirmarModeloResumo(false);
  };
  const cancelarInsercaoModeloResumo = () => setConfirmarModeloResumo(false);

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
    consultaValida,
    consultaInvalida,
    pagamentoPendente,
    idSala,
    anamneseAtual,
    contraparteNome,
    contraparteDetalhe,
    iniciais,
    dadosPaciente,
    resumoClinico,
    restanteSlot,
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
    resumoStatus,
    resumoPendente,
    tentarSalvarResumoDeNovo,
    chatInput,
    setChatInput,
    toggleMicLocal,
    toggleCamLocal,
    toggleTela,
    enviarArquivo,
    enviarChat,
    inserirModeloResumo,
    confirmarModeloResumo,
    confirmarInsercaoModeloResumo,
    cancelarInsercaoModeloResumo,
    sairDaSala,
  };
}

export type SalaConsulta = ReturnType<typeof useSalaConsulta>;

"use client";

import { useEffect, useRef, useState } from "react";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
  CreditCard,
  FileUp,
  Lock,
  Send,
  Sparkles,
  Star,
  Stethoscope,
  X,
} from "lucide-react";
import { useBion, type AnamneseResumo } from "@/lib/bion-store";
import { diasDoAgendamento } from "@/components/bion/agendamento/horarios";
import { agendaLivreDoMedico } from "./agenda-medico";
import { useDiasBloqueados } from "./useDiasBloqueados";
import {
  type Msg,
  type Etapa,
  type AnamneseAtiva,
  type RespostaAnamnese,
  ETAPAS_ANAMNESE,
  JANELA_TRIAGEM_MS,
  triagemDisponivel,
} from "./chat-bion-types";
import { ChatListaMensagens } from "./ChatListaMensagens";

/**
 * BION IA do app do paciente — conversa livre (LLM real) + ações estruturadas:
 *  - Agendar consulta: wizard com PAGAMENTO; o pagamento CONFIRMA a consulta
 *    no agenda e a BION IA conduz a TRIAGEM (anamnese) em storytelling —
 *    disponível logo após a confirmação ATÉ 5 MINUTOS ANTES do horário;
 *  - Durante a triagem a IA pergunta por documentos/exames → caixa de upload
 *    → leitura pela IA (laudos laboratoriais são processados e extraídos);
 *  - Enviar laudo avulso: PDF/foto lido com verificação de segurança do nome.
 */

export function ChatBion({
  aberto,
  onFechar,
  aoEnviarExame,
  aoAbrirTriagem,
}: {
  aberto: boolean;
  onFechar: () => void;
  aoEnviarExame?: () => void;
  aoAbrirTriagem?: (info: { consultaId: string; medico: string; especialidade: string; quando: string }) => void;
}) {
  const {
    sessao,
    medicos,
    consultas,
    anamneses,
    aplicarEstadoFresco,
    aplicarDelta,
    concluirAnamnese,
    pularAnamnese,
    registrarDocAnamnese,
  } = useBion();

  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [segundosEspera, setSegundosEspera] = useState(0);
  const [ultimaFalha, setUltimaFalha] = useState<string | null>(null);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(null);
  // dia = rótulo exibido ("Hoje", "Amanhã", "D Mês"); diaIso = chave do dia no
  // fuso da clínica (o rótulo muda de sentido na virada do dia, o ISO não).
  const [escolha, setEscolha] = useState<{
    especialidade?: string;
    medico?: string;
    dia?: string;
    diaIso?: string;
    hora?: string;
  }>({});
  const [metodo, setMetodo] = useState<"pix" | "cartao" | null>(null);
  const [pagando, setPagando] = useState(false);
  const [anamneseAtiva, setAnamneseAtiva] = useState<AnamneseAtiva | null>(null);
  const [enviandoLaudo, setEnviandoLaudo] = useState(false);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const histAnamneseRef = useRef<{ remetente: "usuario" | "ia"; texto: string }[]>([]);

  const medicosAtivos = medicos.filter((m) => m.status === "ativo");

  // Agenda LIVRE do profissional escolhido — a MESMA do fluxo de agendamento
  // (AgendamentoFluxo): fuso de São Paulo (não o relógio do navegador), sem
  // horários passados, sem horários já ocupados por consultas conhecidas, sem
  // horários em que o próprio paciente já tem consulta e sem os dias inteiros
  // bloqueados pelo médico. O servidor continua validando (409).
  const medicoEscolhido = escolha.medico ? medicosAtivos.find((m) => m.nome === escolha.medico) : undefined;
  const { bloqueados, recarregar: recarregarBloqueios } = useDiasBloqueados(medicoEscolhido?.id);
  const agendaChat = medicoEscolhido
    ? diasDoAgendamento(agendaLivreDoMedico(medicoEscolhido, consultas, undefined, 7, bloqueados), consultas)
    : [];

  // Triagens em andamento de consultas confirmadas dentro da janela (retomada)
  const anamnesesPendentes = anamneses
    .filter((a) => a.status === "em_andamento")
    .filter((a) => {
      const c = consultas.find((x) => x.id === a.consultaId);
      return c && triagemDisponivel(c);
    });

  useEffect(() => {
    if (aberto && mensagens.length === 0) {
      setMensagens([
        {
          remetente: "ia",
          texto: `Olá, ${sessao.nome.split(" ")[0]}! Sou a **BION IA**. Posso agendar consulta, ler um laudo (PDF ou foto) e tirar dúvidas de saúde. A **triagem** é opcional e fica no card da consulta, não neste chat. Como posso ajudar?`,
        },
      ]);
    }
  }, [aberto, mensagens.length, sessao.nome]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, etapa, pensando, anamneseAtiva, segundosEspera]);

  useEffect(() => {
    if (!pensando) {
      setSegundosEspera(0);
      return;
    }
    const id = setInterval(() => setSegundosEspera((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [pensando]);

  /* ------------------------------ anamnese ------------------------------ */

  const rotuloQuando = (data: string, hora: string) => `${data} às ${hora}`;

  const iniciarAnamnese = async (consultaId: string, info: { medico: string; especialidade: string; quando: string; avisoPrevio?: string }) => {
    setAnamneseAtiva({ consultaId, etapa: "identificacao", ...info });
    histAnamneseRef.current = [];
    setPensando(true);
    if (info.avisoPrevio) {
      setMensagens((m) => [...m, { remetente: "ia", texto: info.avisoPrevio!, tipo: "anamnese" }]);
      histAnamneseRef.current.push({ remetente: "ia", texto: info.avisoPrevio });
    }
    try {
      const res = await fetch("/api/anamnese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, historico: [] }),
      });
      const json = (await res.json()) as RespostaAnamnese;
      if (!res.ok || !json.texto) throw new Error(json.erro ?? "Falha");
      aplicarDelta(json);
      const sufixoPerfil = json.perfilAtualizado?.length && !json.texto.includes("Perfil atualizado")
        ? `\n\n**Perfil atualizado:** ${json.perfilAtualizado.join(", ")}.`
        : "";
      const texto = json.texto + sufixoPerfil;
      setMensagens((m) => [...m, { remetente: "ia", texto, tipo: "anamnese", fonte: json.fonte }]);
      histAnamneseRef.current.push({ remetente: "ia", texto: json.texto });
      setAnamneseAtiva((a) => (a ? { ...a, etapa: json.etapa ?? a.etapa } : a));
    } catch {
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: "Não consegui iniciar a triagem agora — a conexão com a nuvem falhou. Toque em “Continuar triagem” em instantes.", tipo: "erro" },
      ]);
      setAnamneseAtiva(null);
    } finally {
      setPensando(false);
    }
  };

  const retomarAnamnese = (a: AnamneseResumo) => {
    const c = consultas.find((x) => x.id === a.consultaId);
    if (!c) return;
    aoAbrirTriagem?.({
      consultaId: a.consultaId,
      medico: a.medico,
      especialidade: a.especialidade,
      quando: `${c.data} às ${c.hora}`,
    });
    onFechar();
  };

  // A triagem NÃO acontece neste chat — se algo ainda ativar o modo antigo, abre os cards.
  useEffect(() => {
    if (!anamneseAtiva) return;
    aoAbrirTriagem?.({
      consultaId: anamneseAtiva.consultaId,
      medico: anamneseAtiva.medico,
      especialidade: anamneseAtiva.especialidade,
      quando: anamneseAtiva.quando,
    });
    setAnamneseAtiva(null);
    onFechar();
  }, [anamneseAtiva, aoAbrirTriagem, onFechar]);

  const enviarAnamnese = async (textoEntrada: string) => {
    const t = textoEntrada.trim();
    if (!t || pensando || !anamneseAtiva) return;
    const { consultaId } = anamneseAtiva;
    setMensagens((m) => [...m, { remetente: "usuario", texto: t }]);
    histAnamneseRef.current.push({ remetente: "usuario", texto: t });
    setEntrada("");
    setPensando(true);
    try {
      const res = await fetch("/api/anamnese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, mensagem: t, historico: histAnamneseRef.current.slice(-14) }),
      });
      const json = (await res.json()) as RespostaAnamnese;
      if (!res.ok || !json.texto) throw new Error(json.erro ?? "Falha");
      aplicarDelta(json);
      const sufixoPerfil = json.perfilAtualizado?.length && !json.texto.includes("Perfil atualizado")
        ? `\n\n**Perfil atualizado:** ${json.perfilAtualizado.join(", ")}.`
        : "";
      const texto = json.texto + sufixoPerfil;
      setMensagens((m) => [...m, { remetente: "ia", texto, tipo: "anamnese", fonte: json.fonte }]);
      histAnamneseRef.current.push({ remetente: "ia", texto: json.texto });
      setAnamneseAtiva((a) => (a ? { ...a, etapa: json.etapa ?? a.etapa } : a));
    } catch {
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: "Não consegui responder agora — a conexão com a nuvem falhou. Tente enviar novamente.", tipo: "erro" },
      ]);
    } finally {
      setPensando(false);
    }
  };

  const concluirAnamneseAgora = async () => {
    if (!anamneseAtiva || pensando) return;
    setPensando(true);
    const { consultaId, medico, especialidade, quando } = anamneseAtiva;
    try {
      const okFeito = await concluirAnamnese(consultaId);
      if (!okFeito) throw new Error("falha");
      setMensagens((m) => [
        ...m,
        {
          remetente: "ia",
          texto: `Tudo pronto! Sua triagem foi enviada para ${medico}. Te vejo na consulta de **${especialidade}** (${quando}) — cuide-se!`,
          tipo: "sucesso-agendamento",
        },
      ]);
      histAnamneseRef.current = [];
      setAnamneseAtiva(null);
      toast.success("Triagem concluída e enviada ao médico.");
    } catch {
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: "Não consegui concluir agora por um problema de conexão. Tente novamente em instantes.", tipo: "erro" },
      ]);
    } finally {
      setPensando(false);
    }
  };

  const pularAnamneseAgora = async (consultaId?: string) => {
    const id = consultaId || anamneseAtiva?.consultaId;
    if (!id || pensando) return;
    setPensando(true);
    try {
      const okFeito = await pularAnamnese(id);
      if (!okFeito) throw new Error("falha");
      setMensagens((m) => [
        ...m,
        {
          remetente: "ia",
          texto: "Tudo bem — a triagem é **opcional**. Sua consulta segue confirmada. Se quiser fazer a triagem depois (até 5 minutos antes do horário), é só tocar em **Continuar triagem**.",
          tipo: "sucesso-agendamento",
        },
      ]);
      histAnamneseRef.current = [];
      setAnamneseAtiva(null);
      toast.message("Triagem dispensada — consulta mantida.");
    } catch {
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: "Não consegui registrar agora. Tente novamente em instantes.", tipo: "erro" },
      ]);
    } finally {
      setPensando(false);
    }
  };

  /* ------------------------ laudo / documentos --------------------------- */

  const iniciarExame = () => {
    setMensagens((m) => [
      ...m,
      { remetente: "usuario", texto: "Quero enviar um laudo de exame" },
      { remetente: "ia", texto: "Envie o **PDF ou uma foto do laudo**. Por segurança, eu verifico o nome completo no documento antes de atualizar seus resultados — o nome precisa ser igual ao da sua conta." },
    ]);
    inputArquivoRef.current?.click();
  };

  const anexarDocumentoAnamnese = () => {
    setMensagens((m) => [
      ...m,
      { remetente: "ia", texto: "Ótimo! Anexe o **exame ou documento** (PDF ou foto). Eu leio, confiro seu nome e deixo disponível para o médico na sua anamnese — se for laudo laboratorial, os resultados já entram na sua linha do tempo de exames." },
    ]);
    inputArquivoRef.current?.click();
  };

  const aoEscolherArquivo = async (arquivo: File) => {
    const emAnamnese = Boolean(anamneseAtiva);
    setEnviandoLaudo(true);
    setMensagens((m) => [...m, { remetente: "usuario", texto: `[Documento anexado] ${arquivo.name}` }]);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const res = await fetch("/api/bion-ia/exame", { method: "POST", body: form });
      const json = (await res.json()) as {
        ok?: boolean;
        mensagem?: string;
        erro?: string;
        nomeVerificado?: string;
        examesSalvos?: { titulo: string; itens: { nome: string; valor: number; unidade?: string }[] }[];
        dados?: unknown;
      };

      if (json.ok && json.examesSalvos?.length) {
        // Laudo pela IA ainda devolve estado fresco (rota pesada rara) —
        // contrato compatível com aplicarEstadoFresco.
        if (json.dados) aplicarEstadoFresco(json.dados);
        const resumo = json.examesSalvos
          .map((e) => `• **${e.titulo}** — ${e.itens.slice(0, 4).map((i) => `${i.nome} ${i.valor}${i.unidade ?? ""}`).join(", ")}${e.itens.length > 4 ? "…" : ""}`)
          .join("\n");
        setMensagens((m) => [
          ...m,
          { remetente: "ia", texto: `Lendo o laudo de ${json.nomeVerificado}…\n\n${resumo}\n\n${json.examesSalvos!.length} grupo(s) de resultados atualizados na sua linha do tempo de exames.`, tipo: "sucesso-exame" },
        ]);
        if (emAnamnese && anamneseAtiva) {
          registrarDocAnamnese(anamneseAtiva.consultaId, {
            nome: arquivo.name,
            tipo: "exame laboratorial",
            exameImportado: true,
            resumo: json.examesSalvos.map((e) => e.titulo).join(", ").slice(0, 300),
          });
          await enviarAnamnese("Pronto, enviei o documento com os resultados.");
        }
        toast.success("Exame importado pela BION IA.");
        aoEnviarExame?.();
      } else if (json.ok) {
        // Documento lido, mas sem resultados laboratoriais — ainda vale como documento da anamnese
        if (emAnamnese && anamneseAtiva) {
          registrarDocAnamnese(anamneseAtiva.consultaId, {
            nome: arquivo.name,
            tipo: "documento",
            exameImportado: false,
          });
          setMensagens((m) => [
            ...m,
            { remetente: "ia", texto: `${json.mensagem ?? "Documento recebido."}\n\nRegistrei o documento na sua anamnese — o médico terá acesso na consulta.`, tipo: "sucesso-exame" },
          ]);
          await enviarAnamnese("Pronto, enviei o documento.");
        } else {
          setMensagens((m) => [...m, { remetente: "ia", texto: json.mensagem ?? "Documento recebido.", tipo: "sucesso-exame" }]);
        }
        aoEnviarExame?.();
      } else {
        setMensagens((m) => [
          ...m,
          { remetente: "ia", texto: json.mensagem ?? json.erro ?? "Não foi possível ler o documento agora. Tente novamente.", tipo: "erro" },
        ]);
      }
    } catch {
      setMensagens((m) => [...m, { remetente: "ia", texto: "Falha de conexão ao enviar o documento. Tente novamente.", tipo: "erro" }]);
    } finally {
      setEnviandoLaudo(false);
      if (inputArquivoRef.current) inputArquivoRef.current.value = "";
    }
  };

  /* ------------------------------ agendamento ---------------------------- */

  const enviar = async (texto: string) => {
    const t = texto.trim();
    if (!t || pensando) return;
    const historico = [...mensagens, { remetente: "usuario" as const, texto: t }];
    setMensagens(historico);
    setEntrada("");
    setPensando(true);
    setUltimaFalha(null);
    setSegundosEspera(0);
    try {
      const res = await fetch("/api/bion-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: historico.filter((m) => m.texto.length < 500).slice(-4).map((m) => ({ remetente: m.remetente === "usuario" ? "usuario" : "ia", texto: m.texto.replace(/\*\*/g, "") })) }),
      });
      const json = (await res.json()) as { resposta?: string; fonte?: string; modelo?: string; erro?: string };
      if (!res.ok || !json.resposta) throw new Error(json.erro ?? "Falha");
      setMensagens((m) => [...m, { remetente: "ia", texto: json.resposta!, fonte: json.fonte, modelo: json.modelo }]);
    } catch (e) {
      const msg = e instanceof Error && e.message && e.message !== "Falha"
        ? e.message
        : "A BION IA não respondeu agora. Toque em Tentar de novo.";
      setUltimaFalha(t);
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: msg, tipo: "erro" },
      ]);
    } finally {
      setPensando(false);
    }
  };

  const interpretarIntencao = (texto: string) => {
    const t = texto.toLowerCase();
    if (/agend|marcar|marcacao|marcação|consulta|disponibilidade|horario|horário/.test(t) && etapa === null && !anamneseAtiva) {
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: "Claro! Vou te guiar no agendamento. Escolha a especialidade desejada:" },
      ]);
      setEscolha({});
      setEtapa("especialidade");
      return true;
    }
    return false;
  };

  const enviarComIntencao = (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    if (anamneseAtiva) {
      aoAbrirTriagem?.({
        consultaId: anamneseAtiva.consultaId,
        medico: anamneseAtiva.medico,
        especialidade: anamneseAtiva.especialidade,
        quando: anamneseAtiva.quando,
      });
      onFechar();
      return;
    }
    if (!interpretarIntencao(t)) void enviar(t);
  };

  const iniciarAgendamento = () => {
    setMensagens((m) => [...m, { remetente: "usuario", texto: "Quero agendar uma consulta" }, { remetente: "ia", texto: "Perfeito! Escolha a especialidade desejada:" }]);
    setEscolha({});
    setEtapa("especialidade");
  };

  /** Pagamento (simulado) + criação da consulta — o pagamento confirma no agenda. */
  const pagarEAgendar = async () => {
    const { medico, especialidade, diaIso, hora } = escolha;
    if (!medico || !especialidade || !diaIso || !hora || pagando) return;
    const medicoRegistro = medicosAtivos.find((m) => m.nome === medico);
    const medicoId = medicoRegistro?.id;
    if (!medicoId) {
      toast.error("Médico não encontrado para o agendamento.");
      return;
    }
    // O horário ainda precisa estar livre (virada do dia, vaga ocupada, dia bloqueado).
    const diaAtual = agendaChat.find((d) => d.iso === diaIso);
    if (!diaAtual || !diaAtual.horarios.includes(hora)) {
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: "Esse horário não está mais disponível. Escolha outro dia ou horário, por favor.", tipo: "erro" },
      ]);
      setEscolha({ especialidade, medico });
      setEtapa("dia");
      return;
    }
    // Rótulo atual do dia ("Hoje" | "Amanhã" | "D Mês"), formato lido pelo servidor.
    const dia = diaAtual.rotulo;
    setPagando(true);
    // Recusa do servidor (ex.: 409 "O médico não atende neste dia.") — distinta de falha de rede.
    let recusa: { status: number; erro: string } | null = null;
    try {
      const res = await fetch("/api/consultas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicoId,
          data: dia,
          hora,
          motivoConsulta: `Agendamento pela BION IA — ${metodo === "pix" ? "Pix" : "Cartão"}`,
          valor: medicoRegistro?.valor ?? 0,
          metodo,
        }),
      });
      const json = ((await res.json().catch(() => null)) ?? {}) as { consultaCriada?: string; erro?: string } & Record<string, unknown>;
      if (!res.ok || !json.consultaCriada) {
        recusa = { status: res.status, erro: typeof json.erro === "string" ? json.erro : "" };
        throw new Error(recusa.erro || "Falha");
      }
      // Contrato delta: resposta contém APENAS a consulta criada (+ anamnese).
      aplicarDelta(json);

      const quando = rotuloQuando(dia, hora);
      setMensagens((m) => [
        ...m,
        {
          remetente: "ia",
          texto: `Pagamento confirmado. Sua consulta de **${especialidade}** com ${medico} está marcada para ${quando}. A triagem é opcional e abre em cards — fora deste chat.`,
          tipo: "sucesso-agendamento",
        },
      ]);
      setEtapa(null);
      setEscolha({});
      setMetodo(null);
      aoAbrirTriagem?.({
        consultaId: json.consultaCriada!,
        medico,
        especialidade,
        quando,
      });
    } catch {
      if (recusa?.status === 409) {
        // Horário/dia recusado (ocupado, dia bloqueado pelo médico…): mostra o
        // motivo do servidor e volta para a escolha do dia com a agenda atualizada.
        const motivo = recusa.erro || "Esse horário não está mais disponível.";
        recarregarBloqueios();
        setMensagens((m) => [
          ...m,
          { remetente: "ia", texto: `${motivo} Escolha outro dia ou horário, por favor — seu pagamento não foi debitado.`, tipo: "erro" },
        ]);
        setEscolha({ especialidade, medico });
        setEtapa("dia");
      } else if (recusa?.erro) {
        const motivo = recusa.erro;
        setMensagens((m) => [
          ...m,
          { remetente: "ia", texto: `Não consegui concluir o agendamento: ${motivo} Seu pagamento não foi debitado.`, tipo: "erro" },
        ]);
      } else {
        setMensagens((m) => [
          ...m,
          { remetente: "ia", texto: "Não consegui concluir o agendamento agora. Verifique sua conexão e tente novamente — seu pagamento não foi debitado.", tipo: "erro" },
        ]);
      }
    } finally {
      setPagando(false);
    }
  };

  /* --------------------------- opções do wizard --------------------------- */

  type OpcoesEtapa = {
    titulo: string;
    opcoes: { rotulo: string; valor: string; sub?: string }[];
    escolher: (v: string) => void;
  };

  const opcoesEtapas = (): OpcoesEtapa | null => {
    if (etapa === "especialidade") {
      return {
        titulo: "Especialidade",
        opcoes: [...new Set(medicosAtivos.map((m) => m.especialidade))].map((e) => ({ rotulo: e, valor: e })),
        escolher: (v: string) => {
          setEscolha((c) => ({ ...c, especialidade: v, medico: undefined }));
          setMensagens((m) => [...m, { remetente: "usuario", texto: v }, { remetente: "ia", texto: `Ótimo — ${v}. Escolha o profissional:` }]);
          setEtapa("medico");
        },
      };
    }
    if (etapa === "medico") {
      return {
        titulo: "Profissional",
        opcoes: medicosAtivos
          .filter((m) => m.especialidade === escolha.especialidade)
          .map((m) => ({ rotulo: m.nome, valor: m.nome, sub: `R$ ${m.valor} · ${m.avaliacao.toFixed(1)} (${m.numAvaliacoes})` })),
        escolher: (v: string) => {
          setEscolha((c) => ({ ...c, medico: v }));
          setMensagens((m) => [...m, { remetente: "usuario", texto: v }, { remetente: "ia", texto: `Escolha o dia para a consulta com ${v}:` }]);
          setEtapa("dia");
        },
      };
    }
    if (etapa === "dia") {
      // Só dias com horário livre (agenda do médico, próximos 7 dias).
      if (!agendaChat.length) {
        return {
          titulo: "Dia",
          opcoes: [{ rotulo: "Sem horários livres nos próximos 7 dias", valor: "" }],
          escolher: () => {
            setMensagens((m) => [...m, { remetente: "ia", texto: "Este profissional não tem horários livres nos próximos 7 dias — escolha outro profissional, por favor." }]);
            setEscolha((c) => ({ especialidade: c.especialidade }));
            setEtapa("medico");
          },
        };
      }
      return {
        titulo: "Dia",
        opcoes: agendaChat.map((d) => ({ rotulo: d.rotulo, valor: d.iso, sub: d.sem })),
        escolher: (v: string) => {
          const d = agendaChat.find((x) => x.iso === v);
          if (!d) return;
          setEscolha((c) => ({ ...c, dia: d.rotulo, diaIso: d.iso, hora: undefined }));
          setMensagens((m) => [...m, { remetente: "usuario", texto: d.rotulo }, { remetente: "ia", texto: "Agora escolha o horário:" }]);
          setEtapa("hora");
        },
      };
    }
    if (etapa === "hora") {
      // Horários livres do dia escolhido (já sem passados/ocupados/bloqueados).
      const horarios = agendaChat.find((d) => d.iso === escolha.diaIso)?.horarios ?? [];
      if (!horarios.length) {
        return {
          titulo: "Horário",
          opcoes: [{ rotulo: "Sem horários disponíveis neste dia", valor: "" }],
          escolher: () => {
            setMensagens((m) => [...m, { remetente: "ia", texto: "Esse dia não tem mais horários livres — escolha outro dia, por favor." }]);
            setEscolha((c) => ({ especialidade: c.especialidade, medico: c.medico }));
            setEtapa("dia");
          },
        };
      }
      return {
        titulo: "Horário",
        opcoes: horarios.slice(0, 12).map((h) => ({ rotulo: h, valor: h })),
        escolher: (v: string) => {
          setEscolha((c) => ({ ...c, hora: v }));
          setMensagens((m) => [...m, { remetente: "usuario", texto: v }, { remetente: "ia", texto: "Confira os dados e escolha a forma de pagamento:" }]);
          setEtapa("confirmar");
        },
      };
    }
    return null;
  };

  const opcoes = opcoesEtapas();

  const dialogoRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(aberto, onFechar);
  useFocoDialogo(aberto, onFechar, dialogoRef);

  if (!aberto) return null;

  return (
    <div ref={dialogoRef} className="bpp-sobreposicao absolute inset-0 z-50 flex flex-col bp-painel" role="dialog" aria-modal="true" aria-label="Conversa com a BION IA">
      <input
        ref={inputArquivoRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void aoEscolherArquivo(f);
        }}
      />

      {/* Cabeçalho */}
      <header className="px-5 py-4 bp-safe-top border-b border-bion-ink/8 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-bion-sea to-bion-ink text-white inline-flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-bion-ink dark:text-bion-paper">BION IA</div>
            <div className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">
              {pensando || enviandoLaudo || pagando ? "Digitando…" : "Online · responde na hora"}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar conversa" className="rounded-full p-2.5 bp-glass text-bion-ink dark:text-bion-paper">
            <X className="w-5 h-5" />
          </button>
        </div>

      </header>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto bp-coluna px-5 py-4 space-y-3">
        <ChatListaMensagens mensagens={mensagens} pensando={pensando} segundosEspera={segundosEspera} />
        {ultimaFalha && !pensando ? (
          <button
            type="button"
            onClick={() => void enviar(ultimaFalha)}
            className="rounded-full px-4 py-2 text-sm font-semibold bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-600/40 dark:border-amber-400/30 w-fit"
          >
            Tentar de novo
          </button>
        ) : null}

        {/* Confirmação + pagamento do agendamento */}
        {etapa === "confirmar" && (() => {
          const medicoRegistro = medicosAtivos.find((m) => m.nome === escolha.medico);
          return (
            <div className="bp-glass p-5 text-bion-ink dark:text-bion-paper">
              <div className="font-bold mb-2">Resumo do agendamento</div>
              <ul className="text-sm space-y-1 mb-4">
                <li><strong>Especialidade:</strong> {escolha.especialidade}</li>
                <li><strong>Profissional:</strong> {escolha.medico}</li>
                <li><strong>Data:</strong> {escolha.dia} às {escolha.hora}</li>
                <li><strong>Valor:</strong> R$ {medicoRegistro?.valor ?? 0}</li>
              </ul>
              <div className="text-xs font-bold uppercase tracking-wide opacity-80 mb-2 inline-flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Forma de pagamento
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {([
                  { id: "pix", nome: "Pix" },
                  { id: "cartao", nome: "Cartão" },
                ] as const).map((m2) => (
                  <button type="button"
                    key={m2.id}
                    onClick={() => setMetodo(m2.id)}
                    aria-pressed={metodo === m2.id}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      metodo === m2.id
                        ? "border-bion-sea bg-bion-sea/10 dark:border-sky-300 dark:bg-sky-300/10"
                        : "border-bion-ink/15 dark:border-white/15"
                    }`}
                  >
                    {m2.nome}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => void pagarEAgendar()}
                  disabled={!metodo || pagando}
                  className="bp-acao flex-1 py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Lock className="w-4 h-4" /> Pagar R$ {medicoRegistro?.valor ?? 0} e agendar
                </button>
                <button type="button"
                  onClick={() => {
                    setEtapa(null);
                    setEscolha({});
                    setMetodo(null);
                    setMensagens((m) => [...m, { remetente: "ia", texto: "Sem problemas — o agendamento foi cancelado, nada foi cobrado. Posso ajudar em outra coisa?" }]);
                  }}
                  className="rounded-full border border-bion-ink/20 dark:border-white/20 px-5 py-3 text-sm font-semibold text-bion-ink dark:text-bion-paper"
                >
                  Cancelar
                </button>
              </div>
              <p className="text-xs opacity-80 mt-2">O pagamento confirma sua consulta. A triagem é opcional e fica disponível até 5 minutos antes do horário.</p>
            </div>
          );
        })()}

        {/* Etapa documentos da anamnese: caixa de upload */}
        {anamneseAtiva?.etapa === "documentos" && (
          <div className="bp-glass p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-bion-ink dark:text-bion-paper mb-1">
              <FileUp className="w-4 h-4" /> Exame ou documento para o médico?
            </div>
            <p className="text-xs opacity-80 mb-3">Anexe PDF ou foto — a IA confere seu nome no documento antes de processar.</p>
            <div className="flex gap-2">
              <button type="button" onClick={anexarDocumentoAnamnese} className="bp-acao flex-1 py-3 text-sm inline-flex items-center justify-center gap-2">
                <FileUp className="w-4 h-4" /> Anexar documento
              </button>
              <button type="button"
                onClick={() => void enviarAnamnese("Não tenho nenhum documento para enviar.")}
                className="rounded-full border border-bion-ink/20 dark:border-white/20 px-4 py-3 text-sm font-semibold text-bion-ink dark:text-bion-paper"
              >
                Não tenho
              </button>
            </div>
          </div>
        )}

        {/* Etapa fechamento: revisão e conclusão */}
        {anamneseAtiva?.etapa === "fechamento" && !pensando && (
          <div className="bp-glass p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-bion-ink dark:text-bion-paper mb-1">
              <BadgeCheck className="w-4 h-4" /> Tudo pronto para o médico
            </div>
            <p className="text-xs opacity-80 mb-3">Ao concluir, o médico recebe sua triagem antes do atendimento.</p>
            <button type="button" onClick={() => void concluirAnamneseAgora()} className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2">
              <BadgeCheck className="w-4 h-4" /> Concluir triagem e enviar ao médico
            </button>
            <button type="button" onClick={() => void pularAnamneseAgora()} className="w-full mt-2 py-2 text-xs text-muted-foreground underline">
              Pular triagem (opcional)
            </button>
          </div>
        )}

        {/* Retomada: triagens em andamento de consultas confirmadas na janela */}
        {mensagens.length > 0 && etapa === null && !anamneseAtiva && anamnesesPendentes.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs opacity-80">Triagem opcional — ajuda o médico, mas você pode pular.</p>
            <div className="flex flex-wrap gap-2">
            {anamnesesPendentes.map((a) => {
              const c = consultas.find((x) => x.id === a.consultaId);
              return (
                <div key={a.id} className="flex flex-wrap gap-2 items-center">
                <button type="button"
                  onClick={() => retomarAnamnese(a)}
                  className="rounded-full bg-emerald-600/10 border border-emerald-600/30 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:text-emerald-200 inline-flex items-center gap-1.5"
                >
                  <Stethoscope className="w-4 h-4" />
                  Continuar triagem — {a.especialidade} com {a.medico}
                  {c ? ` · ${c.data} às ${c.hora}` : ""}
                </button>
                <button type="button"
                  onClick={() => void pularAnamneseAgora(a.consultaId)}
                  className="rounded-full bg-muted border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/80"
                >
                  Pular triagem
                </button>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Opções da etapa atual do wizard */}
        {opcoes && (
          <div className="bp-glass p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wide text-bion-ink/75 dark:text-bion-paper/75">{opcoes.titulo}</span>
              {etapa !== "especialidade" && (
                <button type="button"
                  onClick={() => {
                    const anterior: Record<string, Etapa> = { medico: "especialidade", dia: "medico", hora: "dia", confirmar: "hora" };
                    const volta = (etapa && anterior[etapa]) || null;
                    if (volta) {
                      setEtapa(volta);
                      setEscolha((c) => (volta === "especialidade" ? {} : volta === "medico" ? { especialidade: c.especialidade } : volta === "dia" ? { especialidade: c.especialidade, medico: c.medico } : { ...c, hora: undefined }));
                    }
                  }}
                  className="text-xs font-semibold text-bion-sea dark:text-sky-300 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> voltar
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {opcoes.opcoes.map((o) => (
                <button type="button"
                  key={o.valor}
                  onClick={() => opcoes.escolher(o.valor)}
                  className="text-left rounded-2xl bg-white/60 dark:bg-white/8 border border-bion-ink/10 dark:border-white/10 px-4 py-3 text-sm font-semibold text-bion-ink dark:text-bion-paper hover:border-bion-sea/40 transition"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{o.rotulo}</span>
                    {opcoes.titulo === "Profissional" && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                  </div>
                  {o.sub && <div className="text-xs font-normal opacity-80 mt-0.5">{o.sub}</div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Atalhos úteis durante a anamnese */}
        {anamneseAtiva && !pensando && !["documentos", "fechamento"].includes(anamneseAtiva.etapa) && (
          <div className="flex gap-2 overflow-x-auto bp-coluna">
            {["Não sei informar", "Pode pular esta parte", "Voltar um pouco: quero corrigir algo"].map((chip) => (
              <button type="button"
                key={chip}
                onClick={() => void enviarAnamnese(chip)}
                className="shrink-0 rounded-full bg-bion-sea/10 dark:bg-sky-400/10 border border-bion-sea/25 dark:border-sky-300/25 px-4 py-2 text-xs font-semibold text-bion-sea dark:text-sky-300"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Chips iniciais quando só existe a saudação */}
        {mensagens.length === 1 && etapa === null && !anamneseAtiva && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={iniciarAgendamento} className="rounded-full bg-bion-sea/10 dark:bg-sky-400/10 border border-bion-sea/25 dark:border-sky-300/25 px-4 py-2.5 text-sm font-semibold text-bion-sea dark:text-sky-300">
              Agendar consulta
            </button>
            <button type="button" onClick={iniciarExame} className="rounded-full bg-bion-sea/10 dark:bg-sky-400/10 border border-bion-sea/25 dark:border-sky-300/25 px-4 py-2.5 text-sm font-semibold text-bion-sea dark:text-sky-300">
              Enviar laudo de exame
            </button>
          </div>
        )}

        <div ref={fimRef} />
      </div>

      {/* Entrada */}
      <div className="px-5 pb-5 bp-safe-bottom">
        <div className="bp-glass flex items-center gap-2 !rounded-full p-2 pl-5">
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviarComIntencao(entrada);
              }
            }}
            placeholder={anamneseAtiva ? "Conte com suas palavras…" : "Pergunte à BION IA…"}
            aria-label={anamneseAtiva ? "Resposta para a anamnese" : "Mensagem para a BION IA"}
            disabled={pensando || enviandoLaudo || (etapa !== null && !anamneseAtiva)}
            className="flex-1 bg-transparent outline-none text-sm text-bion-ink dark:text-bion-paper placeholder:text-bion-ink/60 dark:placeholder:text-white/60 disabled:opacity-50"
          />
          {!anamneseAtiva && (
            <button type="button"
              onClick={iniciarExame}
              disabled={enviandoLaudo || etapa !== null}
              aria-label="Anexar laudo de exame"
              className="p-2.5 rounded-full text-bion-ink/75 dark:text-bion-paper/75 hover:bg-bion-ink/5 dark:hover:bg-white/10 disabled:opacity-40"
            >
              <FileUp className="w-5 h-5" />
            </button>
          )}
          <button type="button"
            onClick={() => enviarComIntencao(entrada)}
            disabled={!entrada.trim() || pensando || enviandoLaudo || (etapa !== null && !anamneseAtiva)}
            aria-label="Enviar mensagem"
            className="bp-acao w-11 h-11 inline-flex items-center justify-center disabled:opacity-40"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

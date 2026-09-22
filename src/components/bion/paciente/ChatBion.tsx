"use client";

import { useEffect, useRef, useState } from "react";
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
import { MESES_AGENDA } from "./constantes";

/**
 * BION IA do app do paciente — conversa livre (LLM real) + ações estruturadas:
 *  - Agendar consulta: wizard com PAGAMENTO; o pagamento CONFIRMA a consulta
 *    no agenda e a BION IA conduz a TRIAGEM (anamnese) em storytelling —
 *    disponível logo após a confirmação ATÉ 5 MINUTOS ANTES do horário;
 *  - Durante a triagem a IA pergunta por documentos/exames → caixa de upload
 *    → leitura pela IA (laudos laboratoriais são processados e extraídos);
 *  - Enviar laudo avulso: PDF/foto lido com verificação de segurança do nome.
 */

type Msg = {
  remetente: "usuario" | "ia";
  texto: string;
  tipo?: "sucesso-agendamento" | "sucesso-exame" | "erro" | "anamnese";
  fonte?: string;
};
type Etapa = null | "especialidade" | "medico" | "dia" | "hora" | "confirmar";

/** Etapas da triagem — mesma ordem canônica da rota /api/anamnese. */
const ETAPAS_ANAMNESE = [
  { id: "identificacao", rotulo: "Identificação" },
  { id: "queixa", rotulo: "Queixa principal" },
  { id: "historia", rotulo: "História da doença" },
  { id: "sistemas", rotulo: "Revisão de sistemas" },
  { id: "antecedentes", rotulo: "Antecedentes pessoais" },
  { id: "familia", rotulo: "Antecedentes familiares" },
  { id: "habitos", rotulo: "Hábitos de vida" },
  { id: "gineco", rotulo: "História ginecológica" },
  { id: "psicossocial", rotulo: "Bem-estar e rotina" },
  { id: "medicamentos", rotulo: "Medicamentos" },
  { id: "documentos", rotulo: "Documentos e exames" },
  { id: "fechamento", rotulo: "Revisão final" },
];

type AnamneseAtiva = {
  consultaId: string;
  medico: string;
  especialidade: string;
  quando: string;
  etapa: string;
};

type RespostaAnamnese = {
  texto?: string;
  etapa?: string;
  etapa_concluida?: boolean;
  perfilAtualizado?: string[];
  dados?: unknown;
  erro?: string;
  concluida?: boolean;
  fonte?: string;
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Janela da triagem: fecha 5 minutos antes do início da consulta (mesma regra do servidor). */
const JANELA_TRIAGEM_MS = 5 * 60_000;

/** Triagem disponível = consulta paga/confirmada e ainda faltam >5 min para o início. */
function triagemDisponivel(c: { status: string; pago?: boolean; dataISO?: string; ts: number }): boolean {
  if (!(c.status === "confirmada" || c.status === "pendente_anamnese")) return false;
  if (c.pago === false) return false;
  const inicio = c.dataISO ? new Date(c.dataISO).getTime() : c.ts;
  return Date.now() < inicio - JANELA_TRIAGEM_MS;
}

export function ChatBion({ aberto, onFechar, aoEnviarExame }: { aberto: boolean; onFechar: () => void; aoEnviarExame?: () => void }) {
  const {
    sessao,
    medicos,
    consultas,
    anamneses,
    aplicarEstadoFresco,
    aplicarDelta,
    concluirAnamnese,
    registrarDocAnamnese,
  } = useBion();

  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(null);
  const [escolha, setEscolha] = useState<{ especialidade?: string; medico?: string; dia?: string; hora?: string }>({});
  const [metodo, setMetodo] = useState<"pix" | "cartao" | null>(null);
  const [pagando, setPagando] = useState(false);
  const [anamneseAtiva, setAnamneseAtiva] = useState<AnamneseAtiva | null>(null);
  const [enviandoLaudo, setEnviandoLaudo] = useState(false);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const histAnamneseRef = useRef<{ remetente: "usuario" | "ia"; texto: string }[]>([]);

  const medicosAtivos = medicos.filter((m) => m.status === "ativo");

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
          texto: `Olá, ${sessao.nome.split(" ")[0]}! Sou a BION IA. Eu **agendo suas consultas** — o pagamento já confirma no agenda, e eu faço sua **triagem** (anamnese) com calma, disponível até 5 minutos antes do horário, para o médico já te conhecer antes do atendimento. Também tiro dúvidas de saúde e leio seus laudos (PDF ou foto). Como posso ajudar?`,
        },
      ]);
    }
  }, [aberto, mensagens.length, sessao.nome]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, etapa, pensando, anamneseAtiva]);

  if (!aberto) return null;

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
      if (json.dados) aplicarEstadoFresco(json.dados);
      const texto = json.texto + (json.perfilAtualizado?.length ? `\n\n**Perfil atualizado:** ${json.perfilAtualizado.join(", ")}.` : "");
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
    setMensagens((m) => [...m, { remetente: "usuario", texto: "Quero continuar minha triagem" }]);
    void iniciarAnamnese(a.consultaId, {
      medico: a.medico,
      especialidade: a.especialidade,
      quando: `${c.data} às ${c.hora}`,
    });
  };

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
      if (json.dados) aplicarEstadoFresco(json.dados);
      const texto =
        json.texto +
        (json.perfilAtualizado?.length ? `\n\n**Perfil atualizado:** ${json.perfilAtualizado.join(", ")}.` : "");
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
    try {
      const res = await fetch("/api/bion-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: historico.map((m) => ({ remetente: m.remetente === "usuario" ? "usuario" : "ia", texto: m.texto.replace(/\*\*/g, "") })) }),
      });
      const json = (await res.json()) as { resposta?: string; fonte?: string; erro?: string };
      if (!res.ok || !json.resposta) throw new Error(json.erro ?? "Falha");
      setMensagens((m) => [...m, { remetente: "ia", texto: json.resposta!, fonte: json.fonte }]);
    } catch {
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: "Não consegui responder agora — a conexão com a nuvem falhou. Tente novamente em instantes.", tipo: "erro" },
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
      void enviarAnamnese(t);
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
    const { medico, especialidade, dia, hora } = escolha;
    if (!medico || !especialidade || !dia || !hora || pagando) return;
    const medicoRegistro = medicosAtivos.find((m) => m.nome === medico);
    const medicoId = medicoRegistro?.id;
    if (!medicoId) {
      toast.error("Médico não encontrado para o agendamento.");
      return;
    }
    setPagando(true);
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
      const json = (await res.json()) as { consultaCriada?: string; erro?: string } & Record<string, unknown>;
      if (!res.ok || !json.consultaCriada) throw new Error(json.erro ?? "Falha");
      // Contrato delta: resposta contém APENAS a consulta criada (+ anamnese).
      aplicarDelta(json);

      const quando = rotuloQuando(dia, hora);
      setMensagens((m) => [
        ...m,
        {
          remetente: "ia",
          texto: `Pagamento de **R$ ${medicoRegistro?.valor ?? 0}** confirmado (método: ${metodo === "pix" ? "Pix" : "Cartão"}). Sua consulta de **${especialidade}** com ${medico} está **confirmada** para ${quando}.\n\nAgora vamos fazer sua **triagem** — uma conversa tranquila, no seu ritmo, que fica disponível até **5 minutos antes** do horário. Eu já tenho seus dados do perfil; você confirma e me conta o que está sentindo, e o médico chega à consulta já sabendo da sua história.`,
          tipo: "anamnese",
        },
      ]);
      setEtapa(null);
      setEscolha({});
      setMetodo(null);
      await iniciarAnamnese(json.consultaCriada!, { medico, especialidade, quando });
    } catch {
      setMensagens((m) => [
        ...m,
        { remetente: "ia", texto: "Não consegui concluir o agendamento agora. Verifique sua conexão e tente novamente — seu pagamento não foi debitado.", tipo: "erro" },
      ]);
    } finally {
      setPagando(false);
    }
  };

  /* --------------------------- opções do wizard --------------------------- */

  const diasDisponiveis = () => {
    const dias: { rotulo: string; sub: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dias.push({
        rotulo: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${d.getDate()} ${MESES_AGENDA[d.getMonth()]}`,
        sub: DIAS_SEMANA[d.getDay()],
      });
    }
    return dias;
  };

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
      return {
        titulo: "Dia",
        opcoes: diasDisponiveis().map((d) => ({ rotulo: d.rotulo, valor: d.rotulo, sub: d.sub })),
        escolher: (v: string) => {
          setEscolha((c) => ({ ...c, dia: v }));
          setMensagens((m) => [...m, { remetente: "usuario", texto: v }, { remetente: "ia", texto: "Agora escolha o horário:" }]);
          setEtapa("hora");
        },
      };
    }
    if (etapa === "hora") {
      const medico = medicosAtivos.find((m) => m.nome === escolha.medico);
      let horarios = medico?.horariosDisponiveis?.length ? medico.horariosDisponiveis : ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"];
      // "Hoje": só horários com folga suficiente para o pagamento + triagem (10 min)
      if (escolha.dia === "Hoje") {
        const agora = new Date(Date.now() + 10 * 60_000);
        const limiteMin = agora.getHours() * 60 + agora.getMinutes();
        horarios = horarios.filter((h) => {
          const [hh, mm] = h.split(":").map(Number);
          return hh * 60 + mm >= limiteMin;
        });
      }
      if (!horarios.length) {
        return {
          titulo: "Horário",
          opcoes: [{ rotulo: "Sem horários disponíveis hoje", valor: "" }],
          escolher: () => {
            setMensagens((m) => [...m, { remetente: "ia", texto: "Para hoje a janela de triagem já passou — escolha outro dia, por favor." }]);
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bp-painel" role="dialog" aria-modal="true" aria-label="Conversa com a BION IA">
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
      <header className="px-5 py-4 bp-safe-top border-b border-[#0a1f44]/8 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#123e7d] to-[#0a1f44] text-white inline-flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[#0a1f44] dark:text-[#f2f6fc]">BION IA</div>
            <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {pensando || enviandoLaudo || pagando ? "Digitando…" : anamneseAtiva ? "Triagem em andamento" : "Online · responde na hora"}
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar conversa" className="rounded-full p-2.5 bp-glass text-[#0a1f44] dark:text-[#f2f6fc]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progresso da anamnese */}
        {anamneseAtiva && (() => {
          const idx = Math.max(0, ETAPAS_ANAMNESE.findIndex((e) => e.id === anamneseAtiva.etapa));
          const atual = ETAPAS_ANAMNESE[idx] ?? ETAPAS_ANAMNESE[0];
          const pct = Math.round(((idx + 1) / ETAPAS_ANAMNESE.length) * 100);
          return (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#0a1f44]/60 dark:text-white/55">
                <span className="inline-flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5" />
                  Triagem — {atual.rotulo}
                </span>
                <span>{idx + 1}/{ETAPAS_ANAMNESE.length}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#0a1f44]/10 dark:bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#123e7d] to-[#0a1f44] dark:from-sky-400 dark:to-sky-200 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 text-[10px] text-[#0a1f44]/45 dark:text-white/40">
                Disponível até 5 minutos antes da consulta ({anamneseAtiva.quando})
              </div>
            </div>
          );
        })()}
      </header>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto bp-coluna px-5 py-4 space-y-3">
        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.remetente === "usuario" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                m.remetente === "usuario"
                  ? "bp-acao rounded-3xl rounded-br-md"
                  : `bp-glass rounded-3xl rounded-bl-md text-[#0a1f44] dark:text-[#f2f6fc] ${m.tipo === "erro" ? "border-2 border-amber-500/60" : ""} ${m.tipo?.startsWith("sucesso") ? "border-2 border-emerald-500/60" : ""} ${m.tipo === "anamnese" ? "border-l-4 border-l-[#123e7d] dark:border-l-sky-300" : ""}`
              }`}
            >
              {m.texto.split("**").map((parte, j) => (j % 2 === 1 ? <strong key={j}>{parte}</strong> : <span key={j}>{parte}</span>))}
              {m.remetente === "ia" && m.fonte && (
                <div className="text-[10px] mt-2 opacity-40" aria-hidden="true">
                  {m.fonte === "local" ? "modo básico · sem IA generativa" : m.fonte === "publico" ? "IA generativa · nomes protegidos" : "IA generativa"}
                </div>
              )}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="flex justify-start">
            <div className="bp-glass px-4 py-3 rounded-3xl rounded-bl-md">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="w-2 h-2 rounded-full bg-[#0a1f44]/40 dark:bg-white/40 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Confirmação + pagamento do agendamento */}
        {etapa === "confirmar" && (() => {
          const medicoRegistro = medicosAtivos.find((m) => m.nome === escolha.medico);
          return (
            <div className="bp-glass p-5 text-[#0a1f44] dark:text-[#f2f6fc]">
              <div className="font-bold mb-2">Resumo do agendamento</div>
              <ul className="text-sm space-y-1 mb-4">
                <li><strong>Especialidade:</strong> {escolha.especialidade}</li>
                <li><strong>Profissional:</strong> {escolha.medico}</li>
                <li><strong>Data:</strong> {escolha.dia} às {escolha.hora}</li>
                <li><strong>Valor:</strong> R$ {medicoRegistro?.valor ?? 0}</li>
              </ul>
              <div className="text-xs font-bold uppercase tracking-wide opacity-60 mb-2 inline-flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Forma de pagamento
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {([
                  { id: "pix", nome: "Pix" },
                  { id: "cartao", nome: "Cartão" },
                ] as const).map((m2) => (
                  <button
                    key={m2.id}
                    onClick={() => setMetodo(m2.id)}
                    aria-pressed={metodo === m2.id}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      metodo === m2.id
                        ? "border-[#123e7d] bg-[#123e7d]/10 dark:border-sky-300 dark:bg-sky-300/10"
                        : "border-[#0a1f44]/15 dark:border-white/15"
                    }`}
                  >
                    {m2.nome}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void pagarEAgendar()}
                  disabled={!metodo || pagando}
                  className="bp-acao flex-1 py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Lock className="w-4 h-4" /> Pagar R$ {medicoRegistro?.valor ?? 0} e agendar
                </button>
                <button
                  onClick={() => {
                    setEtapa(null);
                    setEscolha({});
                    setMetodo(null);
                    setMensagens((m) => [...m, { remetente: "ia", texto: "Sem problemas — o agendamento foi cancelado, nada foi cobrado. Posso ajudar em outra coisa?" }]);
                  }}
                  className="rounded-full border border-[#0a1f44]/20 dark:border-white/20 px-5 py-3 text-sm font-semibold text-[#0a1f44] dark:text-[#f2f6fc]"
                >
                  Cancelar
                </button>
              </div>
              <p className="text-[11px] opacity-50 mt-2">O pagamento confirma sua consulta no agenda, e a triagem com a BION IA fica disponível até 5 minutos antes do horário.</p>
            </div>
          );
        })()}

        {/* Etapa documentos da anamnese: caixa de upload */}
        {anamneseAtiva?.etapa === "documentos" && (
          <div className="bp-glass p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0a1f44] dark:text-[#f2f6fc] mb-1">
              <FileUp className="w-4 h-4" /> Exame ou documento para o médico?
            </div>
            <p className="text-xs opacity-60 mb-3">Anexe PDF ou foto — a IA confere seu nome no documento antes de processar.</p>
            <div className="flex gap-2">
              <button onClick={anexarDocumentoAnamnese} className="bp-acao flex-1 py-3 text-sm inline-flex items-center justify-center gap-2">
                <FileUp className="w-4 h-4" /> Anexar documento
              </button>
              <button
                onClick={() => void enviarAnamnese("Não tenho nenhum documento para enviar.")}
                className="rounded-full border border-[#0a1f44]/20 dark:border-white/20 px-4 py-3 text-sm font-semibold text-[#0a1f44] dark:text-[#f2f6fc]"
              >
                Não tenho
              </button>
            </div>
          </div>
        )}

        {/* Etapa fechamento: revisão e conclusão */}
        {anamneseAtiva?.etapa === "fechamento" && !pensando && (
          <div className="bp-glass p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0a1f44] dark:text-[#f2f6fc] mb-1">
              <BadgeCheck className="w-4 h-4" /> Tudo pronto para o médico
            </div>
            <p className="text-xs opacity-60 mb-3">Ao concluir, o médico recebe sua triagem antes do atendimento.</p>
            <button onClick={() => void concluirAnamneseAgora()} className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2">
              <BadgeCheck className="w-4 h-4" /> Concluir triagem e enviar ao médico
            </button>
          </div>
        )}

        {/* Retomada: triagens em andamento de consultas confirmadas na janela */}
        {mensagens.length > 0 && etapa === null && !anamneseAtiva && anamnesesPendentes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {anamnesesPendentes.map((a) => {
              const c = consultas.find((x) => x.id === a.consultaId);
              return (
                <button
                  key={a.id}
                  onClick={() => retomarAnamnese(a)}
                  className="rounded-full bg-emerald-600/10 border border-emerald-600/30 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5"
                >
                  <Stethoscope className="w-4 h-4" />
                  Continuar triagem — {a.especialidade} com {a.medico}
                  {c ? ` · ${c.data} às ${c.hora}` : ""}
                </button>
              );
            })}
          </div>
        )}

        {/* Opções da etapa atual do wizard */}
        {opcoes && (
          <div className="bp-glass p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wide text-[#0a1f44]/60 dark:text-[#f2f6fc]/60">{opcoes.titulo}</span>
              {etapa !== "especialidade" && (
                <button
                  onClick={() => {
                    const anterior: Record<string, Etapa> = { medico: "especialidade", dia: "medico", hora: "dia", confirmar: "hora" };
                    const volta = (etapa && anterior[etapa]) || null;
                    if (volta) {
                      setEtapa(volta);
                      setEscolha((c) => (volta === "especialidade" ? {} : volta === "medico" ? { especialidade: c.especialidade } : volta === "dia" ? { especialidade: c.especialidade, medico: c.medico } : { ...c, hora: undefined }));
                    }
                  }}
                  className="text-xs font-semibold text-[#123e7d] dark:text-sky-300 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> voltar
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {opcoes.opcoes.map((o) => (
                <button
                  key={o.valor}
                  onClick={() => opcoes.escolher(o.valor)}
                  className="text-left rounded-2xl bg-white/60 dark:bg-white/8 border border-[#0a1f44]/10 dark:border-white/10 px-4 py-3 text-sm font-semibold text-[#0a1f44] dark:text-[#f2f6fc] hover:border-[#123e7d]/40 transition"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{o.rotulo}</span>
                    {opcoes.titulo === "Profissional" && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                  </div>
                  {o.sub && <div className="text-xs font-normal opacity-60 mt-0.5">{o.sub}</div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Atalhos úteis durante a anamnese */}
        {anamneseAtiva && !pensando && !["documentos", "fechamento"].includes(anamneseAtiva.etapa) && (
          <div className="flex gap-2 overflow-x-auto bp-coluna">
            {["Não sei informar", "Pode pular esta parte", "Voltar um pouco: quero corrigir algo"].map((chip) => (
              <button
                key={chip}
                onClick={() => void enviarAnamnese(chip)}
                className="shrink-0 rounded-full bg-[#123e7d]/10 dark:bg-sky-400/10 border border-[#123e7d]/25 dark:border-sky-300/25 px-4 py-2 text-xs font-semibold text-[#123e7d] dark:text-sky-300"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Chips iniciais quando só existe a saudação */}
        {mensagens.length === 1 && etapa === null && !anamneseAtiva && (
          <div className="flex flex-wrap gap-2">
            <button onClick={iniciarAgendamento} className="rounded-full bg-[#123e7d]/10 dark:bg-sky-400/10 border border-[#123e7d]/25 dark:border-sky-300/25 px-4 py-2.5 text-sm font-semibold text-[#123e7d] dark:text-sky-300">
              Agendar consulta
            </button>
            <button onClick={iniciarExame} className="rounded-full bg-[#123e7d]/10 dark:bg-sky-400/10 border border-[#123e7d]/25 dark:border-sky-300/25 px-4 py-2.5 text-sm font-semibold text-[#123e7d] dark:text-sky-300">
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
            className="flex-1 bg-transparent outline-none text-sm text-[#0a1f44] dark:text-[#f2f6fc] placeholder:text-[#0a1f44]/40 dark:placeholder:text-white/40 disabled:opacity-50"
          />
          {!anamneseAtiva && (
            <button
              onClick={iniciarExame}
              disabled={enviandoLaudo || etapa !== null}
              aria-label="Anexar laudo de exame"
              className="p-2.5 rounded-full text-[#0a1f44]/60 dark:text-white/60 hover:bg-[#0a1f44]/5 dark:hover:bg-white/10 disabled:opacity-40"
            >
              <FileUp className="w-5 h-5" />
            </button>
          )}
          <button
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

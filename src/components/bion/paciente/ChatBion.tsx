"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, FileUp, Send, Sparkles, Star, X } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { MESES_AGENDA } from "./constantes";

/**
 * BION IA do app do paciente — conversa livre (LLM real) + ações estruturadas:
 *  - Agendar consulta: assistente guiado (especialidade → médico → dia → hora);
 *  - Enviar laudo: PDF/foto lido pela IA com verificação de segurança do nome.
 */

type Msg = { remetente: "usuario" | "ia"; texto: string; tipo?: "sucesso-agendamento" | "sucesso-exame" | "erro" };
type Etapa = null | "especialidade" | "medico" | "dia" | "hora" | "confirmar";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function ChatBion({ aberto, onFechar, aoEnviarExame }: { aberto: boolean; onFechar: () => void; aoEnviarExame?: () => void }) {
  const {
    sessao,
    medicos,
    adicionarConsulta,
    aplicarEstadoFresco,
    exames,
  } = useBion();

  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(null);
  const [escolha, setEscolha] = useState<{ especialidade?: string; medico?: string; dia?: string; hora?: string }>({});
  const [enviandoLaudo, setEnviandoLaudo] = useState(false);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const medicosAtivos = medicos.filter((m) => m.status === "ativo");

  useEffect(() => {
    if (aberto && mensagens.length === 0) {
      setMensagens([
        {
          remetente: "ia",
          texto: `Olá, ${sessao.nome.split(" ")[0]}! Sou a BION IA. Posso tirar dúvidas sobre saúde, **agendar consultas** e **ler seus laudos de exame** (PDF ou foto). Como posso ajudar?`,
        },
      ]);
    }
  }, [aberto, mensagens.length, sessao.nome]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, etapa, pensando]);

  if (!aberto) return null;

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
      const json = (await res.json()) as { resposta?: string; erro?: string };
      if (!res.ok || !json.resposta) throw new Error(json.erro ?? "Falha");
      setMensagens((m) => [...m, { remetente: "ia", texto: json.resposta! }]);
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
    if (/agend|marcar|marcacao|marcação|consulta|disponibilidade|horario|horário/.test(t) && etapa === null) {
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
    if (!interpretarIntencao(t)) void enviar(t);
  };

  const iniciarAgendamento = () => {
    setMensagens((m) => [...m, { remetente: "usuario", texto: "Quero agendar uma consulta" }, { remetente: "ia", texto: "Perfeito! Escolha a especialidade desejada:" }]);
    setEscolha({});
    setEtapa("especialidade");
  };

  const iniciarExame = () => {
    setMensagens((m) => [
      ...m,
      { remetente: "usuario", texto: "Quero enviar um laudo de exame" },
      { remetente: "ia", texto: "Envie o **PDF ou uma foto do laudo**. Por segurança, eu verifico o nome completo no documento antes de atualizar seus resultados — o nome precisa ser igual ao da sua conta." },
    ]);
    inputArquivoRef.current?.click();
  };

  const aoEscolherArquivo = async (arquivo: File) => {
    setEnviandoLaudo(true);
    setMensagens((m) => [...m, { remetente: "usuario", texto: `[Laudo anexado] ${arquivo.name}` }]);
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
        toast.success("Exame importado pela BION IA.");
        aoEnviarExame?.();
      } else {
        setMensagens((m) => [
          ...m,
          { remetente: "ia", texto: json.mensagem ?? json.erro ?? "Não foi possível ler o laudo agora. Tente novamente.", tipo: "erro" },
        ]);
      }
    } catch {
      setMensagens((m) => [...m, { remetente: "ia", texto: "Falha de conexão ao enviar o laudo. Tente novamente.", tipo: "erro" }]);
    } finally {
      setEnviandoLaudo(false);
      if (inputArquivoRef.current) inputArquivoRef.current.value = "";
    }
  };

  const confirmarAgendamento = () => {
    const { medico, especialidade, dia, hora } = escolha;
    if (!medico || !especialidade || !dia || !hora) return;
    adicionarConsulta({
      paciente: sessao.nome,
      medico,
      especialidade,
      data: dia,
      hora,
      motivoConsulta: "Agendamento pela BION IA",
      valor: `R$ ${medicosAtivos.find((m) => m.nome === medico)?.valor ?? 0}`,
      pago: true,
    });
    setMensagens((m) => [
      ...m,
      {
        remetente: "ia",
        texto: `Consulta agendada: **${especialidade}** com ${medico}, ${dia} às ${hora}. Você receberá uma confirmação e já pode conversar com o médico na aba de mensagens.`,
        tipo: "sucesso-agendamento",
      },
    ]);
    setEtapa(null);
    setEscolha({});
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
      const horarios = medico?.horariosDisponiveis?.length ? medico.horariosDisponiveis : ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"];
      return {
        titulo: "Horário",
        opcoes: horarios.slice(0, 12).map((h) => ({ rotulo: h, valor: h })),
        escolher: (v: string) => {
          setEscolha((c) => ({ ...c, hora: v }));
          setMensagens((m) => [...m, { remetente: "usuario", texto: v }, { remetente: "ia", texto: "Confira os dados do agendamento:" }]);
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
      <header className="flex items-center gap-3 px-5 py-4 bp-safe-top border-b border-[#0a1f44]/8 dark:border-white/10">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#123e7d] to-[#0a1f44] text-white inline-flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[#0a1f44] dark:text-[#f2f6fc]">BION IA</div>
          <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            {pensando || enviandoLaudo ? "Digitando…" : "Online · responde na hora"}
          </div>
        </div>
        <button onClick={onFechar} aria-label="Fechar conversa" className="rounded-full p-2.5 bp-glass text-[#0a1f44] dark:text-[#f2f6fc]">
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto bp-coluna px-5 py-4 space-y-3">
        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.remetente === "usuario" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                m.remetente === "usuario"
                  ? "bp-acao rounded-3xl rounded-br-md"
                  : `bp-glass rounded-3xl rounded-bl-md text-[#0a1f44] dark:text-[#f2f6fc] ${m.tipo === "erro" ? "border-2 border-amber-500/60" : ""} ${m.tipo?.startsWith("sucesso") ? "border-2 border-emerald-500/60" : ""}`
              }`}
            >
              {m.texto.split("**").map((parte, j) => (j % 2 === 1 ? <strong key={j}>{parte}</strong> : <span key={j}>{parte}</span>))}
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

        {/* Confirmação do agendamento */}
        {etapa === "confirmar" && (
          <div className="bp-glass p-5 text-[#0a1f44] dark:text-[#f2f6fc]">
            <div className="font-bold mb-2">Resumo do agendamento</div>
            <ul className="text-sm space-y-1 mb-4">
              <li><strong>Especialidade:</strong> {escolha.especialidade}</li>
              <li><strong>Profissional:</strong> {escolha.medico}</li>
              <li><strong>Data:</strong> {escolha.dia} às {escolha.hora}</li>
              <li><strong>Valor:</strong> R$ {medicosAtivos.find((m) => m.nome === escolha.medico)?.valor ?? 0} (pago na plataforma)</li>
            </ul>
            <div className="flex gap-2">
              <button onClick={confirmarAgendamento} className="bp-acao flex-1 py-3 text-sm inline-flex items-center justify-center gap-2">
                <Send className="w-4 h-4" /> Confirmar agendamento
              </button>
              <button
                onClick={() => {
                  setEtapa(null);
                  setEscolha({});
                  setMensagens((m) => [...m, { remetente: "ia", texto: "Sem problemas — o agendamento foi cancelado. Posso ajudar em outra coisa?" }]);
                }}
                className="rounded-full border border-[#0a1f44]/20 dark:border-white/20 px-5 py-3 text-sm font-semibold text-[#0a1f44] dark:text-[#f2f6fc]"
              >
                Cancelar
              </button>
            </div>
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
                    const anterior: Record<string, Etapa> = { medico: "especialidade", dia: "medico", hora: "dia" };
                    const volta = (etapa && anterior[etapa]) || null;
                    if (volta) {
                      setEtapa(volta);
                      setEscolha((c) => (volta === "especialidade" ? {} : volta === "medico" ? { especialidade: c.especialidade } : volta === "dia" ? { especialidade: c.especialidade, medico: c.medico } : c));
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

        {/* Chips iniciais quando só existe a saudação */}
        {mensagens.length === 1 && etapa === null && (
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
        {exames.length === 0 && mensagens.length > 1 && etapa === null && (
          <div className="flex gap-2 mb-3 overflow-x-auto bp-coluna">
            <button onClick={iniciarAgendamento} className="shrink-0 rounded-full bg-[#123e7d]/10 dark:bg-sky-400/10 border border-[#123e7d]/25 dark:border-sky-300/25 px-4 py-2 text-xs font-semibold text-[#123e7d] dark:text-sky-300">
              Agendar consulta
            </button>
            <button onClick={iniciarExame} className="shrink-0 rounded-full bg-[#123e7d]/10 dark:bg-sky-400/10 border border-[#123e7d]/25 dark:border-sky-300/25 px-4 py-2 text-xs font-semibold text-[#123e7d] dark:text-sky-300 inline-flex items-center gap-1.5">
              <FileUp className="w-3.5 h-3.5" /> Enviar laudo
            </button>
          </div>
        )}
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
            placeholder="Pergunte à BION IA…"
            aria-label="Mensagem para a BION IA"
            disabled={pensando || etapa !== null}
            className="flex-1 bg-transparent outline-none text-sm text-[#0a1f44] dark:text-[#f2f6fc] placeholder:text-[#0a1f44]/40 dark:placeholder:text-white/40 disabled:opacity-50"
          />
          <button
            onClick={iniciarExame}
            disabled={enviandoLaudo || etapa !== null}
            aria-label="Anexar laudo de exame"
            className="p-2.5 rounded-full text-[#0a1f44]/60 dark:text-white/60 hover:bg-[#0a1f44]/5 dark:hover:bg-white/10 disabled:opacity-40"
          >
            <FileUp className="w-5 h-5" />
          </button>
          <button
            onClick={() => enviarComIntencao(entrada)}
            disabled={!entrada.trim() || pensando || etapa !== null}
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

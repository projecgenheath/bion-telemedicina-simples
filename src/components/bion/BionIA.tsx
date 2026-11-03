"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Pill,
  ClipboardList,
  Stethoscope,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Shield,
  RefreshCw,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { toast } from "sonner";
import {
  ErroBionIa,
  aceitarCopilotMedico,
  consultarAceiteCopilotMedico,
  perguntarBionIa,
  textoParaCopiar,
} from "@/lib/bion-ia-cliente";
import { detalheConsultaIa } from "@/lib/auditoria-ia";
import { TEXTO_AVISO_COPILOT_MEDICO, TEXTO_CAIXA_COPILOT_MEDICO } from "@/lib/aceite-copilot-medico";
import { inline } from "@/lib/markdown-simples";
import { BlocoRaciocinio } from "./BlocoRaciocinio";
import { ConsentimentoIA } from "./paciente/ConsentimentoIA";
// M22: o ConsentimentoIA usa as classes bpp-sheet (tema do app do paciente,
// escopo .bp-app-paciente em paciente.css). A página clássica importa o CSS
// e monta a folha dentro de um invólucro .bp-app-paciente — sem isso a folha
// do aceite abriria sem fundo/botões nesta página.
import "./paciente/paciente.css";

type MensagemIA = {
  id: string;
  remetente: "usuario" | "ia";
  texto: string;
  hora: string;
  sugestoes?: string[];
  /** Raciocínio (bloco fechado); copiar/inserir usa só `texto`. */
  raciocinio?: string;
};

/* B27: o motor de respostas fixas (RESPOSTAS_BASE/respostaLocal) foi
   REMOVIDO — nunca era chamado (a resposta vem de perguntarBionIa) e o
   texto morto incluía posologia genérica pronta, um risco se um dia fosse
   religado como fallback. */

export function BionIA() {
  const { sessao, registrarAudit } = useBion();
  const isMedico = sessao.role === "medico";

  const promptsSugeridos = isMedico
    ? [
        "Buscar código CID-10 para Cefaleia e Gripe",
        "Sugestão de conduta para Hipertensão Estágio 1",
        "Minha receita digital tem assinatura ICP-Brasil?",
        "Gerar modelo de anamnese para teleconsulta de retorno",
      ]
    : [
        "Como devo tomar minha Losartana 50mg?",
        "Preciso de quanto tempo de jejum para fazer exames?",
        "Como funciona o atestado digital?",
        "O que fazer em caso de dor de cabeça constante?",
      ];

  const [mensagens, setMensagens] = useState<MensagemIA[]>([
    {
      id: "ia-intro",
      remetente: "ia",
      texto: isMedico
        ? `Olá, **${sessao.nome}**! Sou o **BION Copilot IA**. Posso ajudar com consulta rápida de CID-10, sugestão de condutas clínicas baseadas em diretrizes, modelos de prescrição e resumos de prontuário.`
        : `Olá, **${sessao.nome}**! Sou a **BION Saúde IA**. Estou aqui para esclarecer dúvidas sobre seus remédios, explicar como se preparar para exames laboratoriais e fornecer orientações preventivas em linguagem simples.`,
      hora: "Agora",
    },
  ]);
  const [entrada, setEntrada] = useState("");
  const [digitando, setDigitando] = useState(false);
  // M22: estado real da IA para o selo (pausada quando o servidor responde
  // bion_ia_pausada; volta a ativa no próximo sucesso) e o portão jurídico —
  // a pergunta que esbarrou no aceite pendente, repetida após o "Li e concordo".
  const [iaPausada, setIaPausada] = useState(false);
  const [aceitePendente, setAceitePendente] = useState<string | null>(null);
  // LGPD (Copilot do médico): null = verificando; false = falta o aceite.
  const [aceiteCopilot, setAceiteCopilot] = useState<boolean | null>(isMedico ? null : true);
  const [caixaCopilot, setCaixaCopilot] = useState(false);
  const [salvandoAceite, setSalvandoAceite] = useState(false);
  useEffect(() => {
    if (!isMedico) return;
    let vivo = true;
    void consultarAceiteCopilotMedico().then((v) => {
      if (vivo) setAceiteCopilot(v);
    });
    return () => {
      vivo = false;
    };
  }, [isMedico]);
  const bloqueadoCopilot = isMedico && aceiteCopilot !== true;
  const confirmarAceiteCopilot = async () => {
    if (!caixaCopilot || salvandoAceite) return;
    setSalvandoAceite(true);
    const okAceite = await aceitarCopilotMedico();
    setSalvandoAceite(false);
    if (okAceite) setAceiteCopilot(true);
    else toast.error("Não consegui registrar seu aceite agora. Tente novamente.");
  };

  const enviarMensagem = async (textoEnviar?: string) => {
    const txt = (textoEnviar ?? entrada).trim();
    if (!txt || digitando) return;
    if (bloqueadoCopilot) return;

    const novaMsgUsuario: MensagemIA = {
      id: `usr-${Date.now()}`,
      remetente: "usuario",
      texto: txt,
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };

    const historico = [...mensagens, novaMsgUsuario].slice(-12);
    setMensagens(historico);
    if (!textoEnviar) setEntrada("");
    setDigitando(true);
    registrarAudit({
      acao: "IA_CONSULTA_REALIZADA",
      categoria: "sistema",
      severidade: "info",
      entidade: "bion-ia",
      // LGPD: o texto da pergunta NÃO vai para a auditoria (nenhum perfil).
      detalhes: detalheConsultaIa(isMedico ? "MEDICO" : sessao.role),
    });

    let resposta = "";
    let raciocinio = "";
    // M22 (consentimento): como no ChatBion, a pergunta que esbarrou no
    // portão sai da lista — ela é reenviada depois do aceite.
    let tirarPergunta = false;
    try {
      // JSON/NDJSON tratados em perguntarBionIa: AbortController, HTML 504 e
      // falhas de cliente reportadas ao monitor (sem PII). O raciocínio do
      // modelo chega em canal separado (r.raciocinio) e só aparece no
      // BlocoRaciocinio; nunca entra na resposta nem no texto copiado.
      const r = await perguntarBionIa(historico.map((m) => ({ remetente: m.remetente, texto: m.texto })));
      resposta = r.texto;
      raciocinio = r.raciocinio;
      setIaPausada(false);
    } catch (e) {
      if (e instanceof ErroBionIa && e.tipo === "pausada") {
        // Pausa da BION IA (opt-in, bion_ia_pausada): aviso amigável, não erro.
        setIaPausada(true);
        resposta = e.message || "A BION IA volta em breve.";
      } else if (e instanceof ErroBionIa && e.tipo === "aceite_copilot") {
        // Servidor recusou (aceite ausente/desatualizado): volta a caixa de aceite.
        setAceiteCopilot(false);
        setCaixaCopilot(false);
        tirarPergunta = true;
        resposta = e.message;
      } else if (e instanceof ErroBionIa && e.tipo === "consentimento") {
        // Portão jurídico (mesmo fluxo do ChatBion): nada foi enviado à IA;
        // abre a folha de aceite e a pergunta é repetida após o aceite.
        setAceitePendente(txt);
        tirarPergunta = true;
        resposta = e.message;
      } else {
        const aviso =
          e instanceof Error && e.message
            ? e.message
            : "A BION IA está um pouco sobrecarregada agora. Aguarde alguns segundos e envie de novo.";
        // Mantém o texto parcial já recebido (não descarta a resposta cortada).
        const parcial = e instanceof ErroBionIa ? e.parcial.trim() : "";
        resposta = parcial ? `${parcial}\n\n_(${aviso})_` : aviso;
      }
    }

    const novaMsgIA: MensagemIA = {
      id: `ia-${Date.now()}`,
      remetente: "ia",
      texto: resposta,
      ...(raciocinio ? { raciocinio } : {}),
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };

    setMensagens((prev) => [...(tirarPergunta ? prev.slice(0, -1) : prev), novaMsgIA]);
    setDigitando(false);
  };

  const horaAgora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft text-primary text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Inteligência Artificial Clínica BION</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {isMedico ? "BION Copilot Médico IA" : "BION Saúde IA"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isMedico
              ? "Apoio clínico à decisão, CID-10, posologia e elaboração de conduta rápida."
              : "Tire dúvidas sobre receitas, preparo de exames e orientações de saúde."}
          </p>
        </div>
      </div>

      {/* Caixa do Chat */}
      <div className="relative bg-card border rounded-3xl overflow-hidden shadow-sm flex flex-col min-h-[520px]">
        {/* Banner informativo */}
        <div className="bg-muted/70 px-5 py-2.5 border-b flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-primary" /> Suas interações são confidenciais e
            protegidas pela LGPD.
          </span>
          <span className={`font-semibold ${iaPausada ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-200"}`}>
            {iaPausada ? "● IA pausada" : "● IA Ativa"}
          </span>
        </div>

        {/* LGPD: aviso fixo do Copilot do médico (texto do Jurídico) */}
        {isMedico && (
          <div role="note" className="px-5 py-3 border-b bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{TEXTO_AVISO_COPILOT_MEDICO}</span>
          </div>
        )}
        {isMedico && aceiteCopilot === false && (
          <div className="px-5 py-4 border-b bg-card space-y-3">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={caixaCopilot}
                onChange={(e) => setCaixaCopilot(e.target.checked)}
              />
              <span>{TEXTO_CAIXA_COPILOT_MEDICO}</span>
            </label>
            <button
              type="button"
              disabled={!caixaCopilot || salvandoAceite}
              onClick={() => void confirmarAceiteCopilot()}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {salvandoAceite ? "Registrando..." : "Confirmar e usar o Copilot"}
            </button>
          </div>
        )}

        {/* Portão jurídico da IA (mesmo componente/fluxo do ChatBion) */}
        {aceitePendente !== null && (
          <div className="bp-app-paciente">
            <ConsentimentoIA
              onAceito={() => {
                const t = aceitePendente;
                setAceitePendente(null);
                setMensagens((prev) => [
                  ...prev,
                  { id: `ia-aceite-${Date.now()}`, remetente: "ia", texto: "Obrigado! Aceite registrado.", hora: horaAgora() },
                ]);
                void enviarMensagem(t);
              }}
              onRecusar={() => {
                setAceitePendente(null);
                setMensagens((prev) => [
                  ...prev,
                  {
                    id: `ia-recusa-${Date.now()}`,
                    remetente: "ia",
                    texto: "Tudo bem. Sem o aceite, a BION IA fica pausada para você. O agendamento e as consultas continuam normais.",
                    hora: horaAgora(),
                  },
                ]);
              }}
            />
          </div>
        )}

        {/* Mensagens */}
        <div className="flex-1 p-5 md:p-6 space-y-4 overflow-y-auto">
          {mensagens.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.remetente === "usuario" ? "justify-end" : "justify-start"}`}
            >
              {msg.remetente === "ia" && (
                <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-5 h-5" />
                </div>
              )}

              <div
                className={`max-w-[85%] md:max-w-[75%] rounded-3xl px-5 py-3.5 text-xs md:text-sm leading-relaxed shadow-sm ${
                  msg.remetente === "usuario"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted border text-foreground rounded-tl-sm"
                }`}
              >
                {/* M22: markdown inline (negrito/itálico/código) em vez de
                    texto cru — sem isso a saudação e as respostas mostravam
                    os ** literais. O renderizador de blocos (MarkdownSimples)
                    é para documentos; na bolha, o `inline` do mesmo módulo
                    preserva as quebras de linha do chat. */}
                <div className="whitespace-pre-wrap">{inline(msg.texto, msg.id)}</div>
                {msg.remetente === "ia" && msg.id !== "ia-intro" && (
                  <>
                    <BlocoRaciocinio raciocinio={msg.raciocinio} />
                    <button
                      type="button"
                      onClick={async () => {
                        // B27: copiar dá feedback — antes a falha era
                        // engolida em silêncio (catch vazio).
                        try {
                          if (!navigator.clipboard) throw new Error("clipboard indisponível");
                          await navigator.clipboard.writeText(textoParaCopiar(msg));
                          toast.success("Resposta copiada.");
                        } catch {
                          toast.error("Não foi possível copiar a resposta.");
                        }
                      }}
                      className="mt-2 text-xs font-semibold underline opacity-80"
                    >
                      {isMedico ? "Copiar resposta (para a evolução)" : "Copiar resposta"}
                    </button>
                  </>
                )}
                <div
                  className={`text-xs mt-2 text-right ${
                    msg.remetente === "usuario"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {msg.hora}
                </div>
              </div>

              {msg.remetente === "usuario" && (
                <div
                  className="w-9 h-9 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shrink-0 shadow-sm"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  <User className="w-5 h-5" />
                </div>
              )}
            </div>
          ))}

          {digitando && (
            <div className="flex gap-3 items-center">
              <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="bg-muted border rounded-2xl px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary motion-safe:animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-primary motion-safe:animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-primary motion-safe:animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1">BION IA pensando...</span>
              </div>
            </div>
          )}
        </div>

        {/* Sugestões Rápidas */}
        <div className="px-5 py-2.5 border-t bg-muted/40 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-muted-foreground shrink-0">Sugestões:</span>
          {promptsSugeridos.map((p, i) => (
            <button type="button"
              key={i}
              onClick={() => enviarMensagem(p)}
              disabled={bloqueadoCopilot}
              className="text-xs px-3 py-1.5 rounded-full bg-card border hover:border-primary hover:text-primary transition shrink-0 whitespace-nowrap"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Campo de Entrada */}
        <div className="p-4 border-t bg-card flex items-center gap-3">
          <input
                  aria-label="Sua pergunta para a BION IA"
            value={entrada}
            disabled={bloqueadoCopilot}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") enviarMensagem();
            }}
            placeholder={
              isMedico
                ? "Pergunte sobre CID-10, orientações de posologia ou diretrizes clínicas..."
                : "Tire dúvidas sobre receitas, como tomar remédios ou preparo de exames..."
            }
            className="flex-1 bg-muted px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background border border-transparent focus:border-border transition"
          />
          <button type="button"
            onClick={() => enviarMensagem()}
            disabled={bloqueadoCopilot}
            className="disabled:opacity-50 w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 active:scale-95 transition shadow-sm shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

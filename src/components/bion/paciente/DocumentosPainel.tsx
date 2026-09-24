"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  ClipboardList,
  FileText,
  FileUp,
  MessageCircle,
  Pill,
  Printer,
  Send,
  X,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { toast } from "sonner";

/**
 * Página 4 do app do paciente (gesto direita → esquerda):
 *  1. Documentos por consulta realizada (atestados, receitas, pedidos de
 *     exames e prontuário) com visualização e impressão;
 *  2. Ao rolar para baixo: mensagens com os médicos das consultas — aberta do
 *     agendamento até 30 dias depois da consulta (validado também no servidor).
 */

const JANELA_DIAS = 30;

const ICONE_DOC = {
  receita: Pill,
  atestado: FileText,
  exame_solicitado: ClipboardList,
  prontuario: BadgeCheck,
} as const;

const ROTULO_DOC = {
  receita: "Receita médica",
  atestado: "Atestado",
  exame_solicitado: "Pedido de exames",
  prontuario: "Prontuário da consulta",
} as const;

function Visualizador({
  titulo,
  corpo,
  onFechar,
}: {
  titulo: string;
  corpo: string[];
  onFechar: () => void;
}) {
  // A11Y (auditoria FASE 3): ESC fecha o documento — caminho de teclado
  // equivalente ao clique no fundo escurecido e ao botão de fechar.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Documento: ${titulo}`}>
      {/* A11Y: fundo clicável agora é button real (tabIndex=-1 o mantém fora
          da ordem de tabulação — fechar por teclado é papel do ESC/botão). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Fechar documento"
        className="absolute inset-0 bg-bion-ink/60 backdrop-blur-sm cursor-default"
        onClick={onFechar}
      />
      <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto bp-coluna rounded-3xl bg-white dark:bg-bion-night p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-bion-ink dark:text-bion-paper">{titulo}</h3>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              aria-label="Imprimir documento"
              className="bp-acao px-4 py-2 text-xs inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button onClick={onFechar} aria-label="Fechar documento" className="rounded-full p-2 bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="bp-impressao space-y-2 text-sm leading-relaxed text-bion-ink dark:text-bion-paper whitespace-pre-line border-t border-bion-ink/10 dark:border-white/10 pt-4">
          {corpo.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="pt-4 text-xs opacity-60">Documento assinado digitalmente — BION Telemedicina.</p>
        </div>
      </div>
    </div>
  );
}

export function DocumentosPainel() {
  const { consultas, documentos, sessao, mensagens, enviarMensagem, marcarConversaLida } = useBion();
  const [consultaSelecionada, setConsultaSelecionada] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<{ titulo: string; corpo: string[] } | null>(null);
  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const realizadas = useMemo(
    () =>
      consultas
        .filter((c) => c.paciente === sessao.nome && (c.status === "concluida" || c.status === "confirmada"))
        .sort((a, b) => b.ts - a.ts),
    [consultas, sessao.nome],
  );

  const documentosDaConsulta = (consultaId: string) => {
    const c = realizadas.find((x) => x.id === consultaId);
    if (!c) return [];
    const ini = c.ts - 2 * 86_400_000;
    const fim = c.ts + 7 * 86_400_000;
    const docs = documentos
      .filter((d) => d.medico === c.medico && d.paciente === sessao.nome)
      .filter((d) => {
        const t = new Date(d.data.split(" ").reverse().join("/")).getTime();
        const t1 = new Date(d.data.replace(/(\d{2}) (\w{3}) (\d{4})/, "$2 $1 $3")).getTime();
        const ts = Number.isNaN(t) ? (Number.isNaN(t1) ? c.ts : t1) : t;
        return ts >= ini && ts <= fim;
      });
    const lista = docs.map((d) => ({
      id: d.id,
      tipo: d.tipo as keyof typeof ICONE_DOC,
      titulo: ROTULO_DOC[d.tipo as keyof typeof ROTULO_DOC] ?? d.titulo,
      data: d.data,
      corpo: [
        `${d.titulo}`,
        d.tipo === "receita" && d.medicamento ? `Medicamento: ${d.medicamento}` : "",
        d.tipo === "receita" && d.posologia ? `Posologia: ${d.posologia}` : "",
        d.tipo === "receita" && d.duracao ? `Duração: ${d.duracao}` : "",
        d.cid ? `CID: ${d.cid}` : "",
        d.conteudo,
        d.observacoes ? `Observações: ${d.observacoes}` : "",
        ``,
        `Dr(a). ${d.medico}`,
      ].filter((l) => l !== ""),
    }));
    if (c.resumoMedico) {
      lista.unshift({
        id: `prontuario-${c.id}`,
        tipo: "prontuario" as const,
        titulo: ROTULO_DOC.prontuario,
        data: c.data,
        corpo: [
          `Consulta: ${c.especialidade} · ${c.data} às ${c.hora}`,
          `Profissional: ${c.medico}`,
          ``,
          c.resumoMedico,
        ],
      });
    }
    return lista;
  };

  /* -------------------------- mensagens (30 dias) ------------------------- */

  const contatos = useMemo(() => {
    const porMedico = new Map<string, { id: string; nome: string; ultima: number }>();
    for (const c of consultas.filter((x) => x.paciente === sessao.nome && x.status !== "cancelada")) {
      if (!c.medicoId) continue;
      const atual = porMedico.get(c.medicoId);
      if (!atual || c.ts > atual.ultima) porMedico.set(c.medicoId, { id: c.medicoId, nome: c.medico, ultima: c.ts });
    }
    return [...porMedico.values()]
      .map((m) => {
        const fim = m.ultima + JANELA_DIAS * 86_400_000;
        return {
          ...m,
          aberta: Date.now() <= fim,
          fimDias: Math.max(0, Math.ceil((fim - Date.now()) / 86_400_000)),
          naoLidas: mensagens.filter((msg) => msg.deId === m.id && msg.paraId === sessao.id && !msg.lida).length,
        };
      })
      .sort((a, b) => b.ultima - a.ultima);
  }, [consultas, sessao.nome, sessao.id, mensagens]);

  const conversa = useMemo(() => {
    if (!conversaAtiva) return [];
    return mensagens
      .filter(
        (m) =>
          (m.deId === conversaAtiva && m.paraId === sessao.id) ||
          (m.deId === sessao.id && m.paraId === conversaAtiva),
      )
      .sort((a, b) => a.ts - b.ts);
  }, [mensagens, conversaAtiva, sessao.id]);

  const contatoAtivo = contatos.find((c) => c.id === conversaAtiva);

  return (
    <div className="px-5 py-6 space-y-4 bp-safe-top pb-24">
      {visualizando && <Visualizador titulo={visualizando.titulo} corpo={visualizando.corpo} onFechar={() => setVisualizando(null)} />}

      {/* ------------------------------ Documentos ------------------------------ */}
      <section aria-label="Documentos das consultas">
        <h2 className="text-2xl font-black text-bion-ink dark:text-bion-paper">Documentos</h2>
        <p className="text-sm text-bion-ink/60 dark:text-bion-paper/60 mb-4">
          Escolha uma consulta realizada para ver ou imprimir seus documentos.
        </p>

        {realizadas.length === 0 ? (
          <div className="bp-glass p-6 text-center text-sm text-bion-ink/60 dark:text-bion-paper/60">
            Nenhuma consulta ainda. Após a primeira teleconsulta, seus documentos aparecem aqui.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto bp-coluna pb-1 -mx-1 px-1">
            {realizadas.map((c) => (
              <button
                key={c.id}
                onClick={() => setConsultaSelecionada(c.id)}
                aria-pressed={consultaSelecionada === c.id}
                className={`shrink-0 rounded-2xl px-4 py-3 text-left transition border ${
                  consultaSelecionada === c.id
                    ? "bp-acao border-transparent"
                    : "bp-glass border-transparent text-bion-ink dark:text-bion-paper"
                }`}
              >
                <div className="text-sm font-bold">{c.especialidade}</div>
                <div className={`text-xs ${consultaSelecionada === c.id ? "opacity-80" : "opacity-60"}`}>
                  {c.data} · {c.medico.split(" ").slice(-1)[0]}
                </div>
              </button>
            ))}
          </div>
        )}

        {consultaSelecionada && (
          <div className="mt-4 space-y-2">
            {documentosDaConsulta(consultaSelecionada).length === 0 ? (
              <div className="bp-glass p-5 text-sm text-bion-ink/60 dark:text-bion-paper/60">
                Nenhum documento emitido para esta consulta.
              </div>
            ) : (
              documentosDaConsulta(consultaSelecionada).map((d) => {
                const Icone = ICONE_DOC[d.tipo] ?? FileText;
                return (
                  <div key={d.id} className="bp-glass p-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-bion-sea/10 dark:bg-sky-400/10 text-bion-sea dark:text-sky-300 inline-flex items-center justify-center shrink-0">
                      <Icone className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-bion-ink dark:text-bion-paper">{d.titulo}</div>
                      <div className="text-xs opacity-60">{d.data}</div>
                    </div>
                    <button
                      onClick={() => setVisualizando({ titulo: d.titulo, corpo: d.corpo })}
                      className="rounded-full border border-bion-sea/25 dark:border-sky-300/25 px-4 py-2 text-xs font-bold text-bion-sea dark:text-sky-300"
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => setVisualizando({ titulo: d.titulo, corpo: d.corpo })}
                      aria-label={`Imprimir ${d.titulo}`}
                      className="rounded-full p-2.5 bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* ------------------------------ Mensagens ------------------------------ */}
      <section aria-label="Mensagens com médicos" className="pt-2">
        <h2 className="text-2xl font-black text-bion-ink dark:text-bion-paper">Mensagens</h2>
        <p className="text-sm text-bion-ink/60 dark:text-bion-paper/60 mb-4">
          Converse com o médico da sua consulta — do agendamento até 30 dias depois dela.
        </p>

        {conversaAtiva && contatoAtivo ? (
          <div className="bp-glass overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-bion-ink/8 dark:border-white/10">
              <button
                onClick={() => {
                  setConversaAtiva(null);
                }}
                aria-label="Voltar para contatos"
                className="rounded-full p-2 bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-bion-ink dark:text-bion-paper truncate">{contatoAtivo.nome}</div>
                <div className="text-xs opacity-60">{contatoAtivo.aberta ? `Conversa aberta por ${contatoAtivo.fimDias} dia(s)` : "Janela encerrada"}</div>
              </div>
            </div>

            <div className="h-72 overflow-y-auto bp-coluna px-4 py-3 space-y-2">
              {conversa.length === 0 ? (
                <p className="text-sm opacity-60 text-center pt-16">Envie a primeira mensagem para {contatoAtivo.nome.split(" ")[0]}.</p>
              ) : (
                conversa.map((m) => (
                  <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 text-sm ${m.minha ? "bp-acao rounded-3xl rounded-br-md" : "bg-white/60 dark:bg-white/10 text-bion-ink dark:text-bion-paper rounded-3xl rounded-bl-md"}`}>
                      {m.texto}
                      <div className={`text-[10px] mt-1 ${m.minha ? "opacity-70" : "opacity-50"}`}>{m.quando}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 flex gap-2 border-t border-bion-ink/8 dark:border-white/10">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (!contatoAtivo.aberta) {
                      toast.error("A janela de 30 dias desta conversa já encerrou.");
                      return;
                    }
                    if (texto.trim()) {
                      enviarMensagem(contatoAtivo.id, texto.trim());
                      setTexto("");
                    }
                  }
                }}
                disabled={!contatoAtivo.aberta}
                placeholder={contatoAtivo.aberta ? "Escreva sua mensagem…" : "Janela de 30 dias encerrada"}
                aria-label="Nova mensagem"
                className="bp-entrada flex-1 px-4 py-3 text-sm disabled:opacity-50"
              />
              <button
                onClick={() => {
                  if (!contatoAtivo.aberta) {
                    toast.error("A janela de 30 dias desta conversa já encerrou.");
                    return;
                  }
                  if (texto.trim()) {
                    enviarMensagem(contatoAtivo.id, texto.trim());
                    setTexto("");
                  }
                }}
                disabled={!contatoAtivo.aberta || !texto.trim()}
                aria-label="Enviar mensagem"
                className="bp-acao w-12 h-12 inline-flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {contatos.length === 0 ? (
              <div className="bp-glass p-6 text-center text-sm text-bion-ink/60 dark:text-bion-paper/60">
                Após agendar sua primeira consulta, o médico ficará disponível aqui.
              </div>
            ) : (
              contatos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setConversaAtiva(c.id);
                    marcarConversaLida(c.id);
                  }}
                  className="w-full bp-glass p-4 flex items-center gap-3 text-left"
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-bion-sea to-bion-ink text-white inline-flex items-center justify-center text-sm font-bold shrink-0">
                    {c.nome.split(" ").slice(-1)[0][0]}
                    {c.nome[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-bion-ink dark:text-bion-paper truncate">{c.nome}</div>
                    <div className="text-xs opacity-60 flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" /> {c.aberta ? "Conversa disponível" : "Janela de 30 dias encerrada"}
                    </div>
                  </div>
                  {c.naoLidas > 0 && (
                    <span className="shrink-0 min-w-6 h-6 px-2 rounded-full bg-bion-sea text-white text-xs font-bold inline-flex items-center justify-center">
                      {c.naoLidas}
                    </span>
                  )}
                </button>
              ))
            )}
            <p className="text-xs opacity-50 flex items-center gap-1.5 pt-1">
              <FileUp className="w-3.5 h-3.5" /> Laudos enviados pela BION IA também aparecem no seu histórico de uploads.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

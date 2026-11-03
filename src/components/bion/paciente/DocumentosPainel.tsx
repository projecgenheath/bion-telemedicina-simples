"use client";

import { BotaoPagarStripe } from "./BotaoPagarStripe";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
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
import { EstadoVazio } from "./EstadosPaciente";
import { CalendarPlus, RotateCcw } from "lucide-react";
import { podeRenovarReceita, pedidoDaReceita, PRAZO_RETORNO_DIAS, ROTULO_STATUS_RENOVACAO } from "@/lib/atendimento-tipo";
import { MarcarRetornoSheet } from "./MarcarRetornoSheet";
import { RenovarReceitaSheet } from "./RenovarReceitaSheet";
import { usePedidosRenovacao } from "./usePedidosRenovacao";
import { EtiquetaTipo } from "./tipo-atendimento-ui";
import { CLASSE_ETIQUETA } from "./etiqueta-consulta";

/**
 * Página 4 do app do paciente (gesto direita → esquerda):
 *  1. Documentos por consulta REALIZADA (status "concluida"; antes entravam
 *     também as confirmadas, ainda por acontecer) — atestados, receitas,
 *     pedidos de exames e prontuário, com visualização e impressão;
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
  imprimir = false,
  onFechar,
}: {
  titulo: string;
  corpo: string[];
  /** Fase 3: o botão de impressora da lista abre o documento JÁ imprimindo. */
  imprimir?: boolean;
  onFechar: () => void;
}) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, onFechar);
  useFocoDialogo(true, onFechar, dialogoRef);
  useEffect(() => {
    if (!imprimir) return;
    // Espera o documento pintar (a regra @media print só mostra .bp-impressao).
    const id = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(id);
  }, [imprimir]);

  return (
    <div ref={dialogoRef} className="absolute inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Documento: ${titulo}`}>
      {/* A11Y: fundo clicável agora é button real (tabIndex=-1 o mantém fora
          da ordem de tabulação — fechar por teclado é papel do ESC/botão). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Fechar documento"
        className="bpp-veu-doc absolute inset-0 bg-bion-ink/60 backdrop-blur-sm cursor-default"
        onClick={onFechar}
      />
      <div className="bpp-surgir relative w-full max-w-lg max-h-[88vh] overflow-y-auto bp-coluna rounded-3xl bg-white dark:bg-bion-night p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-bion-ink dark:text-bion-paper">{titulo}</h3>
          <div className="flex gap-2 shrink-0">
            <button type="button"
              onClick={() => window.print()}
              aria-label="Imprimir documento"
              className="bpp-toque bp-acao px-4 min-h-11 text-xs inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button type="button" onClick={onFechar} aria-label="Fechar documento" className="bpp-toque w-11 h-11 inline-flex items-center justify-center rounded-full bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="bp-impressao space-y-2 text-sm leading-relaxed text-bion-ink dark:text-bion-paper whitespace-pre-line border-t border-bion-ink/10 dark:border-white/10 pt-4">
          {corpo.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="pt-4 text-xs opacity-80">Documento sem assinatura digital ICP-Brasil — BION Telemedicina.</p>
        </div>
      </div>
    </div>
  );
}

export function DocumentosPainel({
  conversaAtiva,
  onConversa,
  onAgendar,
}: {
  /** Conversa aberta (id do médico). Fica no PacienteApp para o aviso do Início abrir direto. */
  conversaAtiva: string | null;
  onConversa: (medicoId: string | null) => void;
  onAgendar: () => void;
}) {
  const { consultas, documentos, medicos, sessao, mensagens, enviarMensagem, marcarConversaLida, naoLidasMensagens } = useBion();
  const [consultaSelecionada, setConsultaSelecionada] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<{ titulo: string; corpo: string[]; imprimir?: boolean } | null>(null);
  const setConversaAtiva = onConversa;
  const [texto, setTexto] = useState("");
  const [retornoDe, setRetornoDe] = useState<string | null>(null);
  const [renovando, setRenovando] = useState<{ id: string; medicamento: string; medico: string } | null>(null);
  const [cancelandoPedido, setCancelandoPedido] = useState<string | null>(null);
  const renovacao = usePedidosRenovacao(sessao.role === "paciente");

  const realizadas = useMemo(
    () =>
      consultas
        .filter((c) => c.paciente === sessao.nome && c.status === "concluida")
        .sort((a, b) => b.ts - a.ts),
    [consultas, sessao.nome],
  );

  const documentosDaConsulta = (consultaId: string) => {
    const c = realizadas.find((x) => x.id === consultaId);
    if (!c) return [];
    const ini = c.ts - 2 * 86_400_000;
    const fim = c.ts + 7 * 86_400_000;
    const docs = documentos.filter((d) => {
      // A7: documento COM consulta vinculada pertence a ela — e só a ela.
      if (d.consultaId) return d.consultaId === c.id;
      // Sem vínculo (legado, ex.: receita renovada fora de consulta): mantém o
      // recorte médico/paciente/janela, mas sobre a data ISO de criação —
      // nunca sobre o texto localizado de exibição (`d.data`): o parse dele
      // com new Date() dava NaN em 7 dos 12 meses e o documento aparecia sob
      // qualquer consulta concluída do mesmo médico.
      if (d.medico !== c.medico || d.paciente !== sessao.nome) return false;
      const ts = d.criadoEm ? new Date(d.criadoEm).getTime() : NaN;
      return !Number.isNaN(ts) && ts >= ini && ts <= fim;
    });
    const lista = docs.map((d) => ({
      id: d.id,
      tipo: d.tipo as keyof typeof ICONE_DOC,
      titulo: ROTULO_DOC[d.tipo as keyof typeof ROTULO_DOC] ?? d.titulo,
      data: d.data,
      original: d as (typeof documentos)[number] | undefined,
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
        original: undefined,
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

  // Calculado uma vez por render (antes rodava 2 vezes).
  const docsSelecionados = consultaSelecionada ? documentosDaConsulta(consultaSelecionada) : [];

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

  // Conversa em tela cheia no celular (< 768px): trava a rolagem da página,
  // acompanha o teclado (visualViewport) e fecha com o "voltar" do Android.
  const conversaAberta = Boolean(conversaAtiva && contatoAtivo);
  const [celular, setCelular] = useState(false);
  const [alturaVisivel, setAlturaVisivel] = useState<number | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const atualizar = () => setCelular(mq.matches);
    atualizar();
    mq.addEventListener("change", atualizar);
    return () => mq.removeEventListener("change", atualizar);
  }, []);
  useVoltarFecha(conversaAberta, () => setConversaAtiva(null));
  const telaCheia = conversaAberta && celular;
  useEffect(() => {
    if (!telaCheia) return;
    const html = document.documentElement;
    const antes = { body: document.body.style.overflow, html: html.style.overflow };
    document.body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    const vv = window.visualViewport;
    const ajustar = () => setAlturaVisivel(vv ? vv.height : null);
    ajustar();
    vv?.addEventListener("resize", ajustar);
    vv?.addEventListener("scroll", ajustar);
    return () => {
      document.body.style.overflow = antes.body;
      html.style.overflow = antes.html;
      vv?.removeEventListener("resize", ajustar);
      vv?.removeEventListener("scroll", ajustar);
      setAlturaVisivel(null);
    };
  }, [telaCheia]);
  const fimListaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fimListaRef.current?.scrollIntoView({ block: "end" });
  }, [conversa.length, conversaAtiva, alturaVisivel]);

  return (
    <div className="px-5 py-6 space-y-4 bp-safe-top pb-24">
      {visualizando && <Visualizador titulo={visualizando.titulo} corpo={visualizando.corpo} imprimir={visualizando.imprimir} onFechar={() => setVisualizando(null)} />}

      {/* ------------------------------ Documentos ------------------------------ */}
      <section aria-label="Documentos das consultas">
        <h2 className="text-2xl font-black text-bion-ink dark:text-bion-paper">Documentos</h2>
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mb-4">
          Escolha uma consulta realizada para ver ou imprimir seus documentos.
        </p>

        {realizadas.length === 0 ? (
          <EstadoVazio
            icone={<FileText className="w-6 h-6" />}
            titulo="Nenhuma consulta realizada ainda"
            texto="Depois da sua primeira teleconsulta, receitas, atestados e pedidos de exame aparecem aqui."
            acao={{ rotulo: "Agendar consulta", onClick: onAgendar }}
          />
        ) : (
          <div className="flex gap-2 overflow-x-auto bp-coluna pb-1 -mx-1 px-1">
            {realizadas.map((c) => (
              <button type="button"
                key={c.id}
                onClick={() => setConsultaSelecionada(c.id)}
                aria-pressed={consultaSelecionada === c.id}
                className={`bpp-toque shrink-0 rounded-2xl px-4 py-3 text-left transition border ${
                  consultaSelecionada === c.id
                    ? "bp-acao border-transparent"
                    : "bp-glass border-transparent text-bion-ink dark:text-bion-paper"
                }`}
              >
                <div className="text-sm font-bold">{c.especialidade}</div>
                <div className={`text-xs ${consultaSelecionada === c.id ? "opacity-80" : "opacity-80"}`}>
                  {c.data} · {c.medico.split(" ").slice(-1)[0]}
                </div>
              </button>
            ))}
          </div>
        )}

        {consultaSelecionada && (
          <div className="mt-4 space-y-2">
            {(() => {
              const c = realizadas.find((x) => x.id === consultaSelecionada);
              if (!c) return null;
              const noPrazo = Date.now() - c.ts <= PRAZO_RETORNO_DIAS * 86_400_000;
              return (
                <div className="bp-glass p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-bion-ink dark:text-bion-paper inline-flex items-center gap-2 flex-wrap">
                      {c.especialidade} · {c.data} <EtiquetaTipo consulta={c} />
                    </div>
                    <div className="text-xs opacity-80">
                      {noPrazo ? `Retorno com ${c.medico}, com a triagem já preenchida.` : `O retorno pode ser marcado até ${PRAZO_RETORNO_DIAS} dias depois da consulta.`}
                    </div>
                  </div>
                  {noPrazo ? (
                    <button
                      type="button"
                      onClick={() => setRetornoDe(c.id)}
                      className="bpp-toque bp-acao shrink-0 min-h-11 rounded-full px-4 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <CalendarPlus className="w-4 h-4" aria-hidden /> Marcar retorno
                    </button>
                  ) : null}
                </div>
              );
            })()}
            {docsSelecionados.length === 0 ? (
              <EstadoVazio icone={<ClipboardList className="w-6 h-6" />} titulo="Nenhum documento nesta consulta" texto="Se o médico emitir algo, aparece aqui." />
            ) : (
              docsSelecionados.map((d) => {
                const Icone = ICONE_DOC[d.tipo] ?? FileText;
                return (
                  <div key={d.id} className="bp-glass p-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-bion-sea/10 dark:bg-sky-400/10 text-bion-sea dark:text-sky-300 inline-flex items-center justify-center shrink-0">
                      <Icone className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-bion-ink dark:text-bion-paper">{d.titulo}</div>
                      <div className="text-xs opacity-80">{d.data}</div>
                      {(() => {
                        const o = d.original;
                        if (!o || o.tipo !== "receita" || !renovacao.disponivel) return null;
                        const pedido = pedidoDaReceita(renovacao.pedidos, o.id);
                        if (pedido) {
                          const r = ROTULO_STATUS_RENOVACAO[pedido.status];
                          const classe = r.tom === "ok" ? CLASSE_ETIQUETA.ok : r.tom === "pendente" ? CLASSE_ETIQUETA.pagamento : r.tom === "info" ? CLASSE_ETIQUETA.remarcacao : CLASSE_ETIQUETA.neutro;
                          return (
                            <div className="mt-1.5">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${classe}`}>Renovação: {r.texto}</span>
                              {pedido.mensagemMedico ? <p className="mt-1 text-xs opacity-80">{pedido.mensagemMedico}</p> : null}
                              {pedido.status === "pendente" || pedido.status === "aguardando_pagamento" ? (
                                cancelandoPedido === pedido.id ? (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar cancelamento">
                                    <span className="text-xs font-semibold">Cancelar este pedido?</span>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const r = await renovacao.cancelar(pedido.id);
                                        setCancelandoPedido(null);
                                        if (r.ok) toast.success("Pedido de renovação cancelado.");
                                        else toast.error(r.erro ?? "Não foi possível cancelar.");
                                      }}
                                      className="bpp-toque min-h-9 rounded-full px-3 text-xs font-bold bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300"
                                    >
                                      Sim, cancelar
                                    </button>
                                    <button type="button" onClick={() => setCancelandoPedido(null)} className="bpp-toque min-h-9 rounded-full px-3 text-xs font-bold bg-bion-ink/8 dark:bg-white/10">
                                      Voltar
                                    </button>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => setCancelandoPedido(pedido.id)} className="mt-1 block text-xs font-bold underline">
                                    Cancelar pedido
                                  </button>
                                )
                              ) : null}
                              {pedido.status === "aguardando_pagamento" && pedido.pagamentoId ? (
                                <BotaoPagarStripe pagamentoId={pedido.pagamentoId} rotulo="Pagar com cartão" className="mt-1.5" />
                              ) : null}
                              {pedido.status !== "pendente" && pedido.status !== "aguardando_pagamento" ? (
                                <button type="button" onClick={() => setRenovando({ id: o.id, medicamento: o.medicamento ?? "", medico: o.medico })} className="mt-1 block text-xs font-bold underline">
                                  Pedir de novo
                                </button>
                              ) : null}
                            </div>
                          );
                        }
                        if (!podeRenovarReceita(o)) {
                          return <div className="mt-1 text-xs opacity-80">Renovação só em consulta (medicamento controlado ou sem nome).</div>;
                        }
                        return (
                          <button
                            type="button"
                            onClick={() => setRenovando({ id: o.id, medicamento: o.medicamento ?? "", medico: o.medico })}
                            className="bpp-toque mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 min-h-9 text-xs font-bold bg-sky-600/15 text-sky-900 dark:text-sky-100"
                          >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden /> Renovar receita
                          </button>
                        );
                      })()}
                    </div>
                    <button type="button"
                      onClick={() => setVisualizando({ titulo: d.titulo, corpo: d.corpo })}
                      className="bpp-toque min-h-11 rounded-full border border-bion-sea/25 dark:border-sky-300/25 px-4 py-2 text-xs font-bold text-bion-sea dark:text-sky-300"
                    >
                      Ver
                    </button>
                    <button type="button"
                      onClick={() => setVisualizando({ titulo: d.titulo, corpo: d.corpo, imprimir: true })}
                      aria-label={`Imprimir ${d.titulo}`}
                      className="bpp-toque w-11 h-11 inline-flex items-center justify-center rounded-full bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper"
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
        <h2 className="text-2xl font-black text-bion-ink dark:text-bion-paper inline-flex items-center gap-2">
          Mensagens
          {naoLidasMensagens > 0 ? (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-600 text-white text-xs font-black leading-5 text-center">
              {naoLidasMensagens > 9 ? "9+" : naoLidasMensagens}
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mb-4">
          Converse com o médico da sua consulta — do agendamento até 30 dias depois dela.
        </p>

        {conversaAtiva && contatoAtivo ? (
          <div
            role={telaCheia ? "dialog" : undefined}
            aria-modal={telaCheia ? true : undefined}
            aria-label={telaCheia ? `Conversa com ${contatoAtivo.nome}` : undefined}
            style={telaCheia ? { height: alturaVisivel ? `${alturaVisivel}px` : "100dvh" } : undefined}
            className={
              telaCheia
                ? "fixed inset-x-0 top-0 z-[85] flex flex-col overflow-hidden bg-bion-paper dark:bg-slate-950"
                : "bp-glass overflow-hidden flex flex-col min-h-[60vh] max-h-[80vh]"
            }
          >
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-bion-ink/8 dark:border-white/10">
              <button type="button"
                onClick={() => {
                  setConversaAtiva(null);
                }}
                aria-label="Voltar para contatos"
                className="bpp-toque w-11 h-11 inline-flex items-center justify-center rounded-full bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-bion-ink dark:text-bion-paper truncate">{contatoAtivo.nome}</div>
                <div className="text-xs opacity-80">{contatoAtivo.aberta ? `Conversa aberta por ${contatoAtivo.fimDias} dia(s)` : "Janela encerrada"}</div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bp-coluna px-4 py-3 space-y-2">
              {conversa.length === 0 ? (
                <p className="text-sm opacity-80 text-center pt-16">Envie a primeira mensagem para {contatoAtivo.nome.replace(/\.$/, "")}.</p>
              ) : (
                conversa.map((m) => (
                  <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 text-sm ${m.minha ? "bp-acao rounded-3xl rounded-br-md" : "bg-white/60 dark:bg-white/10 text-bion-ink dark:text-bion-paper rounded-3xl rounded-bl-md"}`}>
                      {m.texto}
                      <div className={`text-xs mt-1 ${m.minha ? "opacity-80" : "opacity-80"}`}>{m.quando}</div>
                    </div>
                  </div>
                ))
              )}
              <div ref={fimListaRef} />
            </div>

            <div className="shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 border-t border-bion-ink/8 dark:border-white/10">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    if (!contatoAtivo.aberta) {
                      toast.error("A janela de 30 dias desta conversa já encerrou.");
                      return;
                    }
                    // A8: só limpa o campo com a confirmação do servidor;
                    // em falha, o texto fica para tentar de novo.
                    if (texto.trim()) {
                      const ok = await enviarMensagem(contatoAtivo.id, texto.trim());
                      if (ok) setTexto("");
                    }
                  }
                }}
                disabled={!contatoAtivo.aberta}
                placeholder={contatoAtivo.aberta ? "Escreva sua mensagem…" : "Janela de 30 dias encerrada"}
                aria-label="Nova mensagem"
                className="bp-entrada flex-1 px-4 py-3 text-sm disabled:opacity-50"
              />
              <button type="button"
                onClick={async () => {
                  if (!contatoAtivo.aberta) {
                    toast.error("A janela de 30 dias desta conversa já encerrou.");
                    return;
                  }
                  // A8: idem Enter — texto preservado se o envio falhar.
                  if (texto.trim()) {
                    const ok = await enviarMensagem(contatoAtivo.id, texto.trim());
                    if (ok) setTexto("");
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
              <EstadoVazio
                icone={<MessageCircle className="w-6 h-6" />}
                titulo="Nenhuma conversa ainda"
                texto="Ao agendar uma consulta, você pode falar com o médico por aqui até 30 dias depois dela."
              />
            ) : (
              contatos.map((c) => (
                <button type="button"
                  key={c.id}
                  onClick={() => {
                    setConversaAtiva(c.id);
                    marcarConversaLida(c.id);
                  }}
                  className="bpp-toque w-full bp-glass p-4 flex items-center gap-3 text-left"
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-bion-sea to-bion-ink text-white inline-flex items-center justify-center text-sm font-bold shrink-0">
                    {c.nome.split(" ").slice(-1)[0][0]}
                    {c.nome[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-bion-ink dark:text-bion-paper truncate">{c.nome}</div>
                    <div className="text-xs opacity-80 flex items-center gap-1">
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
            <p className="text-xs opacity-80 flex items-center gap-1.5 pt-1">
              <FileUp className="w-3.5 h-3.5" /> Laudos enviados pela BION IA também aparecem no seu histórico de uploads.
            </p>
          </div>
        )}
      </section>

      {retornoDe && realizadas.find((c) => c.id === retornoDe) ? (
        <MarcarRetornoSheet origem={realizadas.find((c) => c.id === retornoDe)!} retornoSugeridoEm={realizadas.find((c) => c.id === retornoDe)!.retornoSugeridoEm ?? null} onFechar={() => setRetornoDe(null)} />
      ) : null}
      {renovando ? (
        <RenovarReceitaSheet
          medicamento={renovando.medicamento}
          medico={renovando.medico}
          valor={medicos.find((m) => m.nome === renovando.medico)?.valor}
          onPedir={(obs) => renovacao.pedir(renovando.id, obs)}
          onFechar={() => setRenovando(null)}
        />
      ) : null}
    </div>
  );
}

"use client";

import { BotaoPagarStripe } from "./BotaoPagarStripe";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import {
  ArrowLeft,
  BadgeCheck,
  ClipboardList,
  Download,
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
import type { Documento } from "@/lib/bion-tipos";
import { agruparDocumentosPaciente, arquivosDoMedico, ehPdf, nomeComTratamento, seloCancelado } from "./documentos-paciente";
import { acaoDocumento, baixarArquivoMedico, executar, resumoConsultaPDFBytes, type Acao } from "./acoes-documento";

/**
 * Página 4 do app do paciente (gesto direita → esquerda):
 *  1. Todos os documentos emitidos para o paciente, agrupados pela consulta
 *     de emissão (inclusive antes de a consulta ser concluída), mais
 *     "Outros documentos" (sem consulta) e "Arquivos do médico". Ver, Baixar
 *     PDF e Imprimir usam a via timbrada em PDF pelo helper comum
 *     (lib/nativo/arquivos): funcionam no navegador e no app Android;
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

type ItemDoc = {
  id: string;
  tipo: keyof typeof ICONE_DOC;
  titulo: string;
  subtitulo?: string;
  data: string;
  original?: Documento;
  corpo: string[];
  selo: string | null;
  /** Gera o PDF e executa a ação (via timbrada ou resumo da consulta). */
  acao: (a: Acao) => Promise<boolean>;
};

function Visualizador({
  item,
  onFechar,
}: {
  item: ItemDoc;
  onFechar: () => void;
}) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, onFechar);
  useFocoDialogo(true, onFechar, dialogoRef);
  const [ocupado, setOcupado] = useState<Acao | null>(null);
  const rodar = async (a: Acao) => {
    if (ocupado) return;
    setOcupado(a);
    try {
      await item.acao(a);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div ref={dialogoRef} className="absolute inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Documento: ${item.titulo}`}>
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
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-lg font-bold text-bion-ink dark:text-bion-paper">{item.titulo}</h3>
          <button type="button" onClick={onFechar} aria-label="Fechar documento" className="bpp-toque shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper">
            <X className="w-4 h-4" />
          </button>
        </div>
        {item.selo ? <SeloCancelado texto={item.selo} /> : null}
        {/* A impressão e o download usam a via timbrada em PDF (iframe na web,
            folha do sistema no app): a página do app não entra na impressão. */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button"
            onClick={() => void rodar("baixar")}
            disabled={ocupado !== null}
            className="bpp-toque bp-acao px-4 min-h-11 text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Download className="w-4 h-4" aria-hidden /> {ocupado === "baixar" ? "Gerando…" : "Baixar PDF"}
          </button>
          <button type="button"
            onClick={() => void rodar("imprimir")}
            disabled={ocupado !== null}
            className="bpp-toque min-h-11 rounded-full border border-bion-sea/25 dark:border-sky-300/25 px-4 text-xs font-bold inline-flex items-center gap-1.5 text-bion-sea dark:text-sky-300 disabled:opacity-60"
          >
            <Printer className="w-4 h-4" aria-hidden /> {ocupado === "imprimir" ? "Abrindo…" : "Imprimir"}
          </button>
        </div>
        <div className="bp-impressao space-y-2 text-sm leading-relaxed text-bion-ink dark:text-bion-paper whitespace-pre-line border-t border-bion-ink/10 dark:border-white/10 pt-4">
          {item.corpo.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="pt-4 text-xs opacity-80">Documento sem assinatura digital ICP-Brasil — BION Telemedicina.</p>
        </div>
      </div>
    </div>
  );
}

function SeloCancelado({ texto }: { texto: string }) {
  return (
    <span className="inline-flex mb-3 text-xs font-bold px-2.5 py-1 rounded-full bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300">
      {texto}
    </span>
  );
}

const ROTULO_STATUS_CONSULTA: Partial<Record<string, string>> = {
  confirmada: "Agendada",
  pendente_anamnese: "Agendada",
  em_espera: "Em andamento",
  aguardando_reagendamento: "Aguardando nova data",
  falta_paciente: "Falta registrada",
  cancelada: "Cancelada",
};

function itemDeDocumento(d: Documento): ItemDoc {
  // B11: título = medicamento (receita) ou o título próprio do documento;
  // o tipo desce para o subtítulo.
  const rotuloTipo = ROTULO_DOC[d.tipo as keyof typeof ROTULO_DOC] as string | undefined;
  const detalhe =
    d.tipo === "receita" && d.medicamento
      ? d.medicamento
      : d.titulo && d.titulo !== rotuloTipo
        ? d.titulo
        : "";
  return {
    id: d.id,
    tipo: (d.tipo === "exame" ? "exame_solicitado" : d.tipo) as keyof typeof ICONE_DOC,
    titulo: detalhe || rotuloTipo || d.titulo,
    subtitulo: detalhe ? rotuloTipo : undefined,
    data: d.data,
    original: d,
    selo: seloCancelado(d),
    acao: (a) => acaoDocumento(a, d),
    corpo: [
      `${d.titulo}`,
      d.tipo === "receita" && d.medicamento ? `Medicamento: ${d.medicamento}` : "",
      d.tipo === "receita" && d.posologia ? `Posologia: ${d.posologia}` : "",
      d.tipo === "receita" && d.duracao ? `Duração: ${d.duracao}` : "",
      d.cid ? `CID: ${d.cid}` : "",
      d.conteudo,
      d.observacoes ? `Observações: ${d.observacoes}` : "",
      ``,
      nomeComTratamento(d.medico),
    ].filter((l) => l !== ""),
  };
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
  const { consultas, documentosVisiveis, arquivos, medicos, sessao, mensagens, enviarMensagem, marcarConversaLida, naoLidasMensagens } = useBion();
  const [consultaSelecionada, setConsultaSelecionada] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<ItemDoc | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const setConversaAtiva = onConversa;
  const [texto, setTexto] = useState("");
  const [retornoDe, setRetornoDe] = useState<string | null>(null);
  const [renovando, setRenovando] = useState<{ id: string; medicamento: string; medico: string } | null>(null);
  const [cancelandoPedido, setCancelandoPedido] = useState<string | null>(null);
  const renovacao = usePedidosRenovacao(sessao.role === "paciente");

  // Todos os documentos do paciente, por consulta de emissão + "Outros".
  const { grupos, outros } = useMemo(
    () => agruparDocumentosPaciente({ consultas, documentos: documentosVisiveis, pacienteId: sessao.id, pacienteNome: sessao.nome }),
    [consultas, documentosVisiveis, sessao.id, sessao.nome],
  );
  const realizadas = useMemo(() => grupos.map((g) => g.consulta).filter((c) => c.status === "concluida"), [grupos]);
  const doMedico = useMemo(() => arquivosDoMedico(arquivos), [arquivos]);

  // B10: a aba abria "vazia" — pré-seleciona o grupo mais recente.
  useEffect(() => {
    if (grupos.length === 0) return;
    if (!consultaSelecionada || !grupos.some((g) => g.consulta.id === consultaSelecionada)) setConsultaSelecionada(grupos[0].consulta.id);
  }, [consultaSelecionada, grupos]);

  const grupoSelecionado = grupos.find((g) => g.consulta.id === consultaSelecionada) ?? null;
  const docsSelecionados: ItemDoc[] = (() => {
    if (!grupoSelecionado) return [];
    const c = grupoSelecionado.consulta;
    const lista = grupoSelecionado.documentos.map(itemDeDocumento);
    if (grupoSelecionado.prontuario) {
      const resumo = grupoSelecionado.prontuario;
      lista.unshift({
        id: `prontuario-${c.id}`,
        tipo: "prontuario",
        titulo: ROTULO_DOC.prontuario,
        subtitulo: undefined,
        data: c.data,
        original: undefined,
        selo: null,
        acao: (a) =>
          executar(
            a,
            resumoConsultaPDFBytes({ especialidade: c.especialidade, data: c.data, hora: c.hora, medico: c.medico, resumo, paciente: sessao.nome }),
            `prontuario-${c.especialidade}-${c.data}`,
          ),
        corpo: [`Consulta: ${c.especialidade} · ${c.data} às ${c.hora}`, `Profissional: ${c.medico}`, ``, resumo],
      });
    }
    return lista;
  })();
  const itensOutros = useMemo(() => outros.map(itemDeDocumento), [outros]);

  const rodar = async (chave: string, fn: () => Promise<boolean>) => {
    if (ocupado) return;
    setOcupado(chave);
    try {
      await fn();
    } finally {
      setOcupado(null);
    }
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

  const linhaDocumento = (d: ItemDoc) => {
    const Icone = ICONE_DOC[d.tipo] ?? FileText;
                return (
                  <div key={d.id} className="bp-glass p-4 flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-bion-sea/10 dark:bg-sky-400/10 text-bion-sea dark:text-sky-300 inline-flex items-center justify-center shrink-0">
                      <Icone className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-bion-ink dark:text-bion-paper break-words">{d.titulo}</div>
                      <div className="text-xs opacity-80">{d.subtitulo ? `${d.subtitulo} · ` : ""}{d.data}</div>
                      {d.selo ? <span className="mt-1 inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300">{d.selo}</span> : null}
                      {(() => {
                        const o = d.original;
                        if (!o || o.tipo !== "receita" || o.status === "cancelado" || !renovacao.disponivel) return null;
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
                                      className="bpp-toque min-h-11 rounded-full px-3.5 text-xs font-bold bg-red-600/10 text-red-800 dark:bg-red-400/15 dark:text-red-300"
                                    >
                                      Sim, cancelar
                                    </button>
                                    <button type="button" onClick={() => setCancelandoPedido(null)} className="bpp-toque min-h-11 rounded-full px-3.5 text-xs font-bold bg-bion-ink/8 dark:bg-white/10">
                                      Voltar
                                    </button>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => setCancelandoPedido(pedido.id)} className="bpp-toque mt-0.5 inline-flex items-center min-h-11 px-2 -ml-2 text-xs font-bold underline">
                                    Cancelar pedido
                                  </button>
                                )
                              ) : null}
                              {pedido.status === "aguardando_pagamento" && pedido.pagamentoId ? (
                                <BotaoPagarStripe pagamentoId={pedido.pagamentoId} rotulo="Pagar com cartão" className="mt-1.5" />
                              ) : null}
                              {pedido.status !== "pendente" && pedido.status !== "aguardando_pagamento" ? (
                                <button type="button" onClick={() => setRenovando({ id: o.id, medicamento: o.medicamento ?? "", medico: o.medico })} className="bpp-toque mt-0.5 inline-flex items-center min-h-11 px-2 -ml-2 text-xs font-bold underline">
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
                            className="bpp-toque mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-11 text-xs font-bold bg-sky-600/15 text-sky-900 dark:text-sky-100"
                          >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden /> Renovar receita
                          </button>
                        );
                      })()}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button type="button"
                        onClick={() => setVisualizando(d)}
                        className="bpp-toque shrink-0 min-h-11 rounded-full border border-bion-sea/25 dark:border-sky-300/25 px-4 py-2 text-xs font-bold text-bion-sea dark:text-sky-300"
                      >
                        Ver
                      </button>
                      <button type="button"
                        onClick={() => void rodar(`baixar-${d.id}`, () => d.acao("baixar"))}
                        disabled={ocupado !== null}
                        aria-label={`Baixar PDF de ${d.titulo}`}
                        className="bpp-toque shrink-0 min-h-11 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-bion-ink/5 dark:bg-white/10 text-xs font-bold text-bion-ink dark:text-bion-paper disabled:opacity-60"
                      >
                        <Download className="w-4 h-4" aria-hidden /> {ocupado === `baixar-${d.id}` ? "Gerando…" : "Baixar PDF"}
                      </button>
                      <button type="button"
                        onClick={() => void rodar(`imprimir-${d.id}`, () => d.acao("imprimir"))}
                        disabled={ocupado !== null}
                        aria-label={`Imprimir ${d.titulo}`}
                        className="bpp-toque shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper disabled:opacity-60"
                      >
                        <Printer className="w-4 h-4" aria-hidden />
                      </button>
                      </div>
                    </div>
                  </div>
                );
  };
  return (
    <div className="px-5 py-6 space-y-4 bp-safe-top pb-24">
      {visualizando && <Visualizador item={visualizando} onFechar={() => setVisualizando(null)} />}

      {/* ------------------------------ Documentos ------------------------------ */}
      <section aria-label="Documentos das consultas">
        <h2 className="text-2xl font-black text-bion-ink dark:text-bion-paper">Documentos</h2>
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mb-4">
          Receitas, atestados e pedidos de exame que o médico emitiu para você, por consulta. Veja, baixe o PDF ou imprima.
        </p>

        {grupos.length === 0 && itensOutros.length === 0 && doMedico.length === 0 ? (
          <EstadoVazio
            icone={<FileText className="w-6 h-6" />}
            titulo="Nenhum documento ainda"
            texto="Quando o médico emitir uma receita, um atestado ou um pedido de exame, ele aparece aqui."
            acao={{ rotulo: "Agendar consulta", onClick: onAgendar }}
          />
        ) : null}

        {grupos.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto bp-coluna pb-1 -mx-1 px-1" role="group" aria-label="Consultas">
            {grupos.map(({ consulta: c }) => (
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
                <div className="text-xs opacity-80">
                  {c.data} · {c.medico.split(" ").slice(-1)[0]}
                  {c.status !== "concluida" && ROTULO_STATUS_CONSULTA[c.status] ? ` · ${ROTULO_STATUS_CONSULTA[c.status]}` : ""}
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {grupoSelecionado && (
          <div className="mt-4 space-y-2">
            {(() => {
              const c = grupoSelecionado.consulta;
              if (c.status !== "concluida") {
                return (
                  <div className="bp-glass p-4 text-sm font-bold text-bion-ink dark:text-bion-paper inline-flex items-center gap-2 flex-wrap w-full">
                    {c.especialidade} · {c.data} <EtiquetaTipo consulta={c} />
                  </div>
                );
              }
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
              docsSelecionados.map((d) => linhaDocumento(d))
            )}
          </div>
        )}

        {itensOutros.length > 0 ? (
          <div className="mt-6 space-y-2" role="group" aria-labelledby="docs-outros">
            <h3 id="docs-outros" className="text-base font-bold text-bion-ink dark:text-bion-paper">Outros documentos</h3>
            <p className="text-xs opacity-80">Emitidos fora de uma consulta, como uma receita renovada.</p>
            {itensOutros.map((d) => linhaDocumento(d))}
          </div>
        ) : null}

        {doMedico.length > 0 ? (
          <div className="mt-6 space-y-2" role="group" aria-labelledby="docs-arquivos-medico">
            <h3 id="docs-arquivos-medico" className="text-base font-bold text-bion-ink dark:text-bion-paper">Arquivos do médico</h3>
            <p className="text-xs opacity-80">Laudos e arquivos que o médico enviou para você.</p>
            {doMedico.map((a) => (
              <div key={a.id} className="bp-glass p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-bion-sea/10 dark:bg-sky-400/10 text-bion-sea dark:text-sky-300 inline-flex items-center justify-center shrink-0">
                  <FileUp className="w-5 h-5" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-bion-ink dark:text-bion-paper break-words">{a.nome}</div>
                  <div className="text-xs opacity-80">{[a.consulta, a.data].filter(Boolean).join(" · ")}</div>
                </div>
                {a.storagePath ? (
                  <button type="button"
                    onClick={() => void rodar(`arq-${a.id}`, () => baixarArquivoMedico(a))}
                    disabled={ocupado !== null}
                    aria-label={`${ehPdf(a.nome) ? "Baixar PDF" : "Baixar"} ${a.nome}`}
                    className="bpp-toque shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full bg-bion-ink/5 dark:bg-white/10 text-bion-ink dark:text-bion-paper disabled:opacity-60"
                  >
                    <Download className="w-4 h-4" aria-hidden />
                  </button>
                ) : (
                  <span className="shrink-0 text-xs opacity-80 text-right max-w-[7rem]">Sem cópia para baixar</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
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

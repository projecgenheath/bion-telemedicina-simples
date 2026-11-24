"use client";

import { BotaoPagarStripe } from "./BotaoPagarStripe";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  ClipboardList,
  Download,
  Eye,
  FileText,
  FileUp,
  Pill,
  Printer,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import type { Documento } from "@/lib/bion-tipos";
import { useAppNativo } from "@/lib/useAppNativo";
import { toast } from "sonner";
import { CalendarPlus, RotateCcw } from "lucide-react";
import { pedidoDaReceita, PRAZO_RETORNO_DIAS, ROTULO_STATUS_RENOVACAO } from "@/lib/atendimento-tipo";
import { MarcarRetornoSheet } from "./MarcarRetornoSheet";
import { RenovarReceitaSheet } from "./RenovarReceitaSheet";
import { usePedidosRenovacao } from "./usePedidosRenovacao";
import { tipoDaConsulta } from "./tipo-atendimento-ui";
import { TelaMensagensPaciente } from "./etapa3/TelaMensagensPaciente";
import { aceitaPdf, entregarPdf, VisualizadorDocumento, type DadosVisualizador } from "./etapa4/VisualizadorDocumento";
import { avisoRenovacaoBloqueada, contarDocumentos, dataBR, iniciaisNome, seloCancelado } from "./etapa3/etapa3-dados";

/**
 * Página 4 do app do paciente (gesto direita → esquerda), etapa 3 do
 * redesign (desenho da ficha e das mensagens do médico), com duas abas:
 *  1. Documentos por consulta REALIZADA (status "concluida") — atestados,
 *     receitas, pedidos de exames e prontuário, com visualização, PDF e
 *     impressão; selo "Cancelado em dd/mm/aaaa" e aviso de renovação
 *     bloqueada vindos do documento (status/canceladoEm do servidor);
 *  2. Mensagens com os médicos das consultas (etapa3/TelaMensagensPaciente).
 */

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

export type VistaDocumentos = "documentos" | "mensagens";

export function DocumentosPainel({
  conversaAtiva,
  onConversa,
  onAgendar,
  vista = "documentos",
  onVista,
  onFechar,
  ativo = true,
}: {
  /** Conversa aberta (id do médico). Fica no PacienteApp para o aviso do Início abrir direto. */
  conversaAtiva: string | null;
  onConversa: (medicoId: string | null) => void;
  onAgendar: () => void;
  /** Aba aberta: Documentos ou Mensagens (o PacienteApp guarda, a navegação acende o item certo). */
  vista?: VistaDocumentos;
  onVista?: (v: VistaDocumentos) => void;
  /** Volta ao Início (botão do topo). */
  onFechar?: () => void;
  /** O painel está à vista (no computador a conversa mais recente só abre sozinha com ele aberto). */
  ativo?: boolean;
}) {
  const { consultas, documentos, medicos, sessao, naoLidasMensagens } = useBion();
  const [consultaSelecionada, setConsultaSelecionada] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<DadosVisualizador | null>(null);
  const noApp = useAppNativo();
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

  // B10: a aba abria "vazia" — só os chips, nenhum documento à vista.
  // Pré-seleciona a consulta realizada mais recente (realizadas já vem
  // ordenada da mais nova para a mais antiga).
  useEffect(() => {
    if (!consultaSelecionada && realizadas.length > 0) setConsultaSelecionada(realizadas[0].id);
  }, [consultaSelecionada, realizadas]);

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
    const lista = docs.map((d) => {
      // B11: o título específico era descartado e toda receita/atestado
      // virava o rótulo genérico do tipo — 2 receitas da mesma consulta
      // ficavam idênticas na lista. Título = medicamento (receita) ou o
      // título próprio do documento; o tipo desce para o subtítulo.
      const rotuloTipo = ROTULO_DOC[d.tipo as keyof typeof ROTULO_DOC] as string | undefined;
      const detalhe =
        d.tipo === "receita" && d.medicamento
          ? d.medicamento
          : d.titulo && d.titulo !== rotuloTipo
            ? d.titulo
            : "";
      return {
      id: d.id,
      tipo: d.tipo as keyof typeof ICONE_DOC,
      titulo: detalhe || rotuloTipo || d.titulo,
      subtitulo: detalhe ? rotuloTipo : undefined,
      rotuloTipo: rotuloTipo ?? d.titulo,
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
        seloCancelado(d) ? `${seloCancelado(d)} pelo médico.` : "",
        ``,
        `Dr(a). ${d.medico}`,
      ].filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== "")),
      };
    });
    if (c.resumoMedico) {
      lista.unshift({
        id: `prontuario-${c.id}`,
        tipo: "prontuario" as const,
        original: undefined,
        titulo: ROTULO_DOC.prontuario,
        subtitulo: undefined,
        rotuloTipo: "Resumo",
        data: dataBR(c.ts) || c.data,
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
  const consulta = realizadas.find((x) => x.id === consultaSelecionada) ?? null;
  const originais = docsSelecionados.flatMap((d) => (d.original ? [d.original] : []));
  const contagem = contarDocumentos(originais);
  const receitas = originais.filter((d) => d.tipo === "receita");
  // Só o que aparece nas consultas realizadas (o prontuário não conta como documento emitido).
  const totalDocumentos = realizadas.reduce((n, c) => n + documentosDaConsulta(c.id).filter((d) => d.tipo !== "prontuario").length, 0);

  const titulo = vista === "mensagens" ? "Mensagens" : "Documentos";
  const sub =
    vista === "mensagens"
      ? naoLidasMensagens > 0
        ? `${naoLidasMensagens} não lida${naoLidasMensagens > 1 ? "s" : ""}`
        : "Converse com o médico da sua consulta"
      : `${realizadas.length} consulta${realizadas.length === 1 ? "" : "s"} realizada${realizadas.length === 1 ? "" : "s"} · ${totalDocumentos} documento${totalDocumentos === 1 ? "" : "s"}`;

  const topo = (
    <header className="bp2-docs-topo">
      {onFechar ? (
        <button type="button" onClick={onFechar} aria-label="Voltar ao início" title="Voltar" className="bp2-redondo bp2-redondo-topo">
          <ArrowLeft className="h-[1.05rem] w-[1.05rem]" aria-hidden />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 id="bp2-docs-t" className="bp2-docs-titulo truncate">
          {titulo}
        </h2>
        <p className="truncate text-[12px] bp2-t-2">{sub}</p>
      </div>
      <div role="tablist" aria-label="Documentos e mensagens" className="bp2-abas">
        {(["documentos", "mensagens"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            id={`bp2-aba-${v}`}
            aria-selected={vista === v}
            aria-controls="bp2-docs-painel"
            onClick={() => onVista?.(v)}
            className="bp2-aba"
          >
            {v === "documentos" ? "Documentos" : "Mensagens"}
            {v === "mensagens" && naoLidasMensagens > 0 ? (
              <span className="bp2-aba-selo" aria-label={`${naoLidasMensagens} não lida${naoLidasMensagens > 1 ? "s" : ""}`}>
                {naoLidasMensagens > 9 ? "9+" : naoLidasMensagens}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </header>
  );

  const dadosDoVisualizador = (d: (typeof docsSelecionados)[number], pdf: Documento | null): DadosVisualizador => {
    const c = realizadas.find((x) => x.id === consultaSelecionada);
    return {
      titulo: d.titulo,
      corpo: d.corpo,
      documento: pdf ?? undefined,
      tipo: d.tipo === "receita" || d.tipo === "atestado" || d.tipo === "prontuario" ? d.tipo : "exame_solicitado",
      rotuloTipo: d.rotuloTipo,
      emitido: d.original?.criadoEm ? dataBR(d.original.criadoEm) : d.data,
      medico: d.original?.medico ?? c?.medico ?? "",
      especialidade: c?.especialidade,
      selo: seloCancelado(d.original),
    };
  };

  const acoesDoc = (d: (typeof docsSelecionados)[number]) => {
    const pdf = aceitaPdf(d.original) ? d.original : null;
    return (
      <div className="bp2-docs-acoes">
        <button
          type="button"
          data-ver-documento={d.id}
          onClick={() => setVisualizando(dadosDoVisualizador(d, pdf))}
          className="bp2-docs-ver"
          aria-label={`Ver ${d.titulo}`}
        >
          <Eye className="h-4 w-4" aria-hidden /> <span>Ver</span>
        </button>
        {pdf ? (
          <button type="button" onClick={() => void entregarPdf(pdf)} aria-label={`Baixar ou compartilhar PDF de ${d.titulo}`} title="PDF" className="bp2-icone-linha">
            <Download className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {/* No app a impressão não existe (WebView): o PDF acima substitui a impressora. */}
        {!noApp ? (
          <button
            type="button"
            onClick={() => setVisualizando({ ...dadosDoVisualizador(d, pdf), imprimir: true })}
            aria-label={`Imprimir ${d.titulo}`}
            title="Imprimir"
            className="bp2-icone-linha"
          >
            <Printer className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  };

  /* Renovação de uma receita: pedido em andamento, bloqueio ou botão para pedir. */
  const renovacaoDa = (o: Documento) => {
    const bloqueio = avisoRenovacaoBloqueada(o);
    const pedido = renovacao.disponivel ? pedidoDaReceita(renovacao.pedidos, o.id) : null;
    if (pedido) {
      const r = ROTULO_STATUS_RENOVACAO[pedido.status];
      return (
        <>
          <span className={`bp2-renov-estado bp2-renov-${r.tom}`}>Renovação: {r.texto}</span>
          {pedido.mensagemMedico ? <p className="bp2-renov-msg">{pedido.mensagemMedico}</p> : null}
          {bloqueio && pedido.status !== "pendente" && pedido.status !== "aguardando_pagamento" ? <p className="bp2-renov-bloqueio">{bloqueio}</p> : null}
          {pedido.status === "pendente" || pedido.status === "aguardando_pagamento" ? (
            cancelandoPedido === pedido.id ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar cancelamento">
                <span className="text-[12px] font-medium">Cancelar este pedido?</span>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await renovacao.cancelar(pedido.id);
                    setCancelandoPedido(null);
                    if (res.ok) toast.success("Pedido de renovação cancelado.");
                    else toast.error(res.erro ?? "Não foi possível cancelar.");
                  }}
                  className="bp2-renov-botao bp2-renov-perigo"
                >
                  Sim, cancelar
                </button>
                <button type="button" onClick={() => setCancelandoPedido(null)} className="bp2-renov-botao">
                  Voltar
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setCancelandoPedido(pedido.id)} className="bp2-renov-link">
                Cancelar pedido
              </button>
            )
          ) : null}
          {pedido.status === "aguardando_pagamento" && pedido.pagamentoId ? (
            <BotaoPagarStripe pagamentoId={pedido.pagamentoId} rotulo="Pagar com cartão" className="mt-1.5" />
          ) : null}
          {pedido.status !== "pendente" && pedido.status !== "aguardando_pagamento" && !bloqueio ? (
            <button type="button" onClick={() => setRenovando({ id: o.id, medicamento: o.medicamento ?? "", medico: o.medico })} className="bp2-renov-link">
              Pedir de novo
            </button>
          ) : null}
        </>
      );
    }
    if (bloqueio) return <p className="bp2-renov-bloqueio">{bloqueio}</p>;
    if (!renovacao.disponivel) return <p className="bp2-renov-msg">Renovação por mensagem indisponível agora.</p>;
    return (
      <button type="button" onClick={() => setRenovando({ id: o.id, medicamento: o.medicamento ?? "", medico: o.medico })} className="bp2-renov-pedir">
        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Renovar receita
      </button>
    );
  };

  const corpoDocumentos =
    realizadas.length === 0 || !consulta ? (
      <section className="bp2-cartao flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="bp2-assist-icone" aria-hidden>
          <FileText className="h-5 w-5" />
        </span>
        <h3 className="text-[15px] font-medium">Nenhuma consulta realizada ainda</h3>
        <p className="max-w-xs text-[13px] bp2-t-2">Depois da sua primeira teleconsulta, receitas, atestados e pedidos de exame aparecem aqui.</p>
        <button type="button" onClick={onAgendar} className="bp2-botao-azul mt-1 inline-flex h-11 items-center rounded-[0.6rem] px-5 text-[13px] font-medium">
          Agendar consulta
        </button>
      </section>
    ) : (
      (() => {
        const c = consulta;
        const noPrazo = Date.now() - c.ts <= PRAZO_RETORNO_DIAS * 86_400_000;
        const tipo = tipoDaConsulta(c) ?? "Consulta";
        return (
          <div className="bp2-docs-grade">
            {/* Cartão em degradê da consulta escolhida (desenho da "Ficha do paciente") */}
            <section className="bp2-ficha-cartao bp2-docs-ficha bp2-animar" aria-labelledby="bp2-docs-ficha-t" aria-live="polite">
              <div className="bp2-ficha-topo">
                <h3 id="bp2-docs-ficha-t" className="bp2-ficha-titulo">
                  Documentos
                  <br />
                  da consulta
                </h3>
              </div>
              <div className="bp2-ficha-pessoa">
                <span className="bp2-ficha-avatar" aria-hidden>
                  {iniciaisNome(c.medico)}
                </span>
                <div className="bp2-ficha-nome">
                  <strong>{c.medico}</strong>
                  <span>{c.especialidade}</span>
                </div>
              </div>
              <dl className="bp2-ficha-campos">
                <div>
                  <dt>Data</dt>
                  <dd className="tabular-nums">{dataBR(c.ts)}</dd>
                </div>
                <div>
                  <dt>Atendimento</dt>
                  <dd>{tipo}</dd>
                </div>
                <div>
                  <dt>Retorno</dt>
                  <dd>{noPrazo ? `Até ${dataBR(c.ts + PRAZO_RETORNO_DIAS * 86_400_000)}` : "Prazo encerrado"}</dd>
                </div>
              </dl>
              <dl className="bp2-ficha-sinais">
                <div>
                  <dt>Receitas</dt>
                  <dd>
                    <span className="bp2-ficha-valor tabular-nums">{contagem.receitas}</span>
                  </dd>
                </div>
                <div>
                  <dt>Atestados</dt>
                  <dd>
                    <span className="bp2-ficha-valor tabular-nums">{contagem.atestados}</span>
                  </dd>
                </div>
                <div>
                  <dt>Pedidos de exame</dt>
                  <dd>
                    <span className="bp2-ficha-valor tabular-nums">{contagem.pedidos}</span>
                  </dd>
                </div>
              </dl>
              {noPrazo ? (
                <button type="button" onClick={() => setRetornoDe(c.id)} className="bp2-ficha-acao" aria-label={`Marcar retorno com ${c.medico}, com a triagem já preenchida`}>
                  <CalendarPlus className="h-4 w-4" aria-hidden /> Marcar retorno
                </button>
              ) : null}
            </section>

            {/* Consultas realizadas (escolha) */}
            <section className="bp2-cartao bp2-docs-consultas bp2-animar bp2-animar-d1" aria-labelledby="bp2-docs-cons-t">
              <div className="bp2-ficha-cab">
                <h3 id="bp2-docs-cons-t" className="bp2-ficha-titulo">
                  Consultas
                  <br />
                  realizadas
                </h3>
                <span className="bp2-docs-conta bp2-t-2">{realizadas.length}</span>
              </div>
              <ul className="bp2-docs-cons-lista">
                {realizadas.map((x) => {
                  const ativa = x.id === consultaSelecionada;
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        aria-pressed={ativa}
                        onClick={() => setConsultaSelecionada(x.id)}
                        className="bp2-docs-cons"
                        aria-label={`${x.especialidade} com ${x.medico}, ${dataBR(x.ts)}`}
                      >
                        <span aria-hidden className="bp2-avatar bp2-docs-cons-avatar">
                          {iniciaisNome(x.medico)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate bp2-docs-cons-nome">{x.especialidade}</span>
                          <span className="block truncate bp2-docs-cons-sub">
                            {dataBR(x.ts)} · {x.medico}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Documentos da consulta: tabela no computador, lista no celular */}
            <section className="bp2-cartao bp2-docs-lista bp2-animar bp2-animar-d2" aria-labelledby="bp2-docs-lista-t">
              <div className="bp2-ficha-cab bp2-ficha-cab-hist">
                <h3 id="bp2-docs-lista-t" className="bp2-ficha-titulo">
                  Documentos <span className="bp2-t-2">· {docsSelecionados.length}</span>
                </h3>
              </div>
              {docsSelecionados.length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] bp2-t-2">Nenhum documento nesta consulta. Se o médico emitir algo, aparece aqui.</p>
              ) : (
                <div className="bp2-ficha-rolagem">
                  <table className="bp2-docs-tabela">
                    <caption className="sr-only">Documentos da consulta de {c.especialidade} em {dataBR(c.ts)}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Documento</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">Emitido em</th>
                        <th scope="col">Situação</th>
                        <th scope="col">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {docsSelecionados.map((d) => {
                        const Icone = ICONE_DOC[d.tipo] ?? FileText;
                        const selo = seloCancelado(d.original);
                        const bloqueio = d.original ? avisoRenovacaoBloqueada(d.original) : null;
                        const emitido = d.original?.criadoEm ? dataBR(d.original.criadoEm) : d.data;
                        return (
                          <tr key={d.id} className={selo ? "bp2-docs-cancelado" : undefined} data-documento={d.id}>
                            <td>
                              <span className="bp2-docs-nome">
                                <span aria-hidden className={`bp2-docs-icone bp2-docs-icone-${d.tipo}`}>
                                  <Icone />
                                </span>
                                <span className="min-w-0">
                                  <span className="block bp2-docs-titulo-doc">{d.titulo}</span>
                                  {bloqueio && d.tipo === "receita" ? <span className="block bp2-docs-nota">{bloqueio}</span> : null}
                                </span>
                              </span>
                            </td>
                            <td className="bp2-t-2">{d.rotuloTipo}</td>
                            <td className="tabular-nums bp2-t-2">{emitido}</td>
                            <td>
                              {selo ? (
                                <span className="bp2-selo-cancelado">
                                  <Ban className="h-3 w-3" aria-hidden /> {selo}
                                </span>
                              ) : (
                                <span className="bp2-selo-valido">{d.tipo === "prontuario" ? "Disponível" : "Válido"}</span>
                              )}
                            </td>
                            <td>{acoesDoc(d)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="bp2-docs-rodape">
                <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden /> Laudos enviados pela BION IA também aparecem no seu histórico de uploads.
              </p>
            </section>

            {/* Renovação de receitas (lavanda, como "Exames e documentos" da ficha) */}
            <section className="bp2-docs-renov bp2-animar bp2-animar-d3" aria-labelledby="bp2-docs-renov-t">
              <div className="bp2-ficha-cab">
                <h3 id="bp2-docs-renov-t" className="bp2-ficha-titulo">
                  Renovação
                  <br />
                  de receitas
                </h3>
              </div>
              {receitas.length === 0 ? (
                <p className="bp2-vazio">Nenhuma receita nesta consulta.</p>
              ) : (
                <ul>
                  {receitas.map((o) => (
                    <li key={o.id} className="bp2-renov-item">
                      <span className="block bp2-prox-nome">
                        <Pill className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                        {o.medicamento || o.titulo}
                      </span>
                      <span className="block bp2-prox-sub">
                        {dataBR(o.criadoEm ?? null) || o.data}
                        {seloCancelado(o) ? ` · ${seloCancelado(o)}` : ""}
                      </span>
                      <div className="bp2-renov-corpo">{renovacaoDa(o)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
      })()
    );

  return (
    <div className={`bp2-docs bp2-e3 bp2-v2 ${vista === "mensagens" ? "bp2-docs-vista-msg" : ""}`}>
      {visualizando && <VisualizadorDocumento dados={visualizando} paciente={sessao.nome} onFechar={() => setVisualizando(null)} />}
      {topo}
      <div id="bp2-docs-painel" role="tabpanel" aria-labelledby={`bp2-aba-${vista}`} className="bp2-docs-corpo">
        {vista === "mensagens" ? (
          <TelaMensagensPaciente ativo={ativo} conversaAtiva={conversaAtiva} onConversa={onConversa} onDocumentos={() => onVista?.("documentos")} onAgendar={onAgendar} />
        ) : (
          corpoDocumentos
        )}
      </div>

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

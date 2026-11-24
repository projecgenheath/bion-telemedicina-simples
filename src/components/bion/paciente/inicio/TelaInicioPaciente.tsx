"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  HeartPulse,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import type { Consulta } from "@/lib/bion-tipos";
import { SALA_ABRE_ANTES_MIN } from "@/lib/janela-sala";
import { botaoPrincipalProxima, type AcaoSala } from "../entrada-sala";
import type { EtiquetaConsulta, StatusTriagem, TomEtiqueta } from "../etiqueta-consulta";
import { tipoDaConsulta } from "../tipo-atendimento-ui";
import { ContagemConsulta } from "../AvisosInicio";
import { acaoPrioritaria, diaPorExtenso, filtrarHistorico, historicoConsultas, iniciaisNome, plural } from "./inicio-dados";

const MAX_CARROSSEL = 5;
const LIMITE_TABELA = 7; // a ref. 12 mostra 7 linhas

/** Cor de texto (AA) do estado da consulta nas listas. */
const COR_TOM: Record<TomEtiqueta, string> = {
  pagamento: "bp2-t-laranja",
  sala: "bp2-t-verde",
  remarcacao: "bp2-t-azul",
  triagem: "bp2-t-laranja",
  ok: "bp2-t-verde",
  neutro: "bp2-t-2",
};
const ICONE_TOM: Record<TomEtiqueta, typeof CircleAlert | null> = {
  pagamento: CircleAlert,
  sala: Video,
  remarcacao: Clock3,
  triagem: CircleAlert,
  ok: CircleCheck,
  neutro: null,
};

function Avatar({ nome, foto, tamanho = "md" }: { nome: string; foto?: string | null; tamanho?: "md" | "lg" | "xl" }) {
  const t =
    tamanho === "xl" ? "h-12 w-12 text-sm lg:h-[3.25rem] lg:w-[3.25rem] lg:text-[15px]" : tamanho === "lg" ? "h-11 w-11 text-[13px]" : "h-9 w-9 text-xs";
  if (foto) return <img src={foto} alt="" className={`${t} shrink-0 rounded-full object-cover`} />;
  return (
    <span aria-hidden className={`bp2-avatar ${t} grid shrink-0 place-items-center rounded-full font-medium`}>
      {iniciaisNome(nome)}
    </span>
  );
}

/** Botão preto redondo com seta, encaixado no recorte do canto do cartão. */
function BotaoSeta({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <span className="bp2-recorte">
      <button type="button" onClick={onClick} aria-label={rotulo} title={rotulo} className="bp2-seta grid h-10 w-10 place-items-center rounded-full">
        <ArrowUpRight className="h-[1.05rem] w-[1.05rem]" aria-hidden />
      </button>
    </span>
  );
}

function Estado({ e }: { e: EtiquetaConsulta }) {
  const Icone = ICONE_TOM[e.tom];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[13px] ${COR_TOM[e.tom]}`}>
      {e.texto}
      {Icone ? <Icone className="h-3.5 w-3.5" aria-hidden /> : null}
    </span>
  );
}

export type PropsInicioPaciente = {
  nome: string;
  foto?: string | null;
  saudacao: string;
  agora: number;
  /** Consultas do paciente (todas), já filtradas por pacienteId. */
  minhas: Consulta[];
  proximas: Consulta[];
  etiquetaDe: (c: Consulta) => EtiquetaConsulta;
  acaoSala: (c: Consulta) => AcaoSala;
  statusTriagem: (consultaId: string) => StatusTriagem;
  janelaTriagem: (c: Consulta) => boolean;
  /** Botão de pagar (Stripe) da consulta, quando ela aguarda pagamento. */
  botaoPagar: (c: Consulta) => ReactNode;
  documentos: number;
  naoLidas: number;
  ultimaNaoLidaDe?: { medicoId: string; nome: string } | null;
  naoLidasDoRemetente: number;
  aguardandoReagendamento?: Consulta | null;
  /** Avisos e cartões de ação (notificações, reagendamento, multa, falta, reembolso). */
  avisos: ReactNode;
  /** Aviso "Mensagem nova" — some quando o cartão "Requer sua atenção" já mostra a mensagem. */
  avisoMensagem?: ReactNode;
  onEntrar: (c: Consulta) => void;
  onTriagem: (consultaId: string) => void;
  onRemarcar: (consultaId: string) => void;
  onCancelar: (consultaId: string) => void;
  onAgendar: () => void;
  onPerguntar: () => void;
  onMensagens: () => void;
  onAbrirConversa: (medicoId: string) => void;
  onDocumentos: () => void;
  onPerfil: () => void;
  onSaude: () => void;
  onVerHistorico: () => void;
};

/**
 * Início do paciente — redesign azul, etapa 1 (24/11). Mesmo desenho do
 * Início do médico (ref. 03 no celular, ref. 12 no computador), adaptado
 * ao que o paciente faz: próximas consultas no lugar da agenda do dia,
 * "Requer sua atenção" com a ação pendente mais importante, Mensagens e
 * Documentos nos cartões coloridos e o histórico de consultas na tabela.
 * Só dados reais do estado (useBion) — nada fictício.
 */
export function TelaInicioPaciente(p: PropsInicioPaciente) {
  const {
    nome,
    foto,
    saudacao,
    agora,
    minhas,
    proximas,
    etiquetaDe,
    acaoSala,
    statusTriagem,
    janelaTriagem,
  } = p;
  const primeiroNome = nome.split(" ").filter(Boolean)[0] ?? "";
  const proxima = proximas[0];
  const slides = proximas.slice(0, MAX_CARROSSEL);
  const realizadas = useMemo(() => minhas.filter((c) => c.status === "concluida").length, [minhas]);
  const historico = useMemo(() => historicoConsultas(minhas), [minhas]);
  const [busca, setBusca] = useState("");
  const historicoFiltrado = useMemo(() => filtrarHistorico(historico, busca), [historico, busca]);

  const carrosselRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const aoRolarCarrossel = () => {
    const el = carrosselRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== slide) setSlide(i);
  };
  const irSlide = (i: number) => {
    const el = carrosselRef.current;
    if (!el) return;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduzir ? "auto" : "smooth" });
  };

  const triagemProxima = proxima ? statusTriagem(proxima.id) : "feita";
  const etiquetaProxima = proxima ? etiquetaDe(proxima) : null;
  const acao = acaoPrioritaria({
    aguardandoReagendamento: p.aguardandoReagendamento,
    proxima,
    proximaAguardandoPagamento: etiquetaProxima?.tom === "pagamento",
    triagemPendente: proxima && triagemProxima !== "feita" && janelaTriagem(proxima) ? triagemProxima : null,
    mensagemDe: p.ultimaNaoLidaDe?.nome ?? null,
    mensagensDoRemetente: p.naoLidasDoRemetente,
  });

  /* ------------------------------ topo ------------------------------ */
  const rotuloMensagens =
    p.naoLidas > 0 ? `Mensagens: ${p.naoLidas} não lida${p.naoLidas > 1 ? "s" : ""}. Abrir mensagens` : "Mensagens. Abrir mensagens";
  const topo = (
    <header className="bp2-topo flex items-center gap-3 bp2-animar">
      <button type="button" onClick={p.onPerfil} className="flex min-w-0 flex-1 items-center gap-3 text-left lg:hidden" aria-label="Abrir meu perfil">
        <Avatar nome={nome} foto={foto} tamanho="lg" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{nome}</span>
          <span className="block truncate text-xs bp2-t-2">Paciente</span>
        </span>
      </button>
      <button type="button" onClick={p.onPerguntar} className="bp2-topo-pergunta hidden min-w-0 flex-1 items-center gap-2 text-left lg:flex" aria-label="Perguntar algo à BION IA">
        <Search className="h-4 w-4 shrink-0 bp2-t-2" aria-hidden />
        <span className="truncate text-[13px] bp2-t-2">Pergunte algo à BION IA…</span>
      </button>
      <button
        type="button"
        onClick={p.onPerguntar}
        aria-label="Perguntar algo à BION IA"
        className="bp2-icone-topo bp2-icone-topo-borda grid h-11 w-11 shrink-0 place-items-center rounded-full lg:hidden"
      >
        <Sparkles className="h-[1.15rem] w-[1.15rem]" aria-hidden />
      </button>
      <button
        type="button"
        onClick={p.onMensagens}
        aria-label={rotuloMensagens}
        className="bp2-icone-topo bp2-icone-topo-borda relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
      >
        <MessageCircle className="h-[1.15rem] w-[1.15rem]" aria-hidden />
        {p.naoLidas > 0 ? <span aria-hidden className="bp2-contador">{p.naoLidas > 99 ? "99+" : p.naoLidas}</span> : null}
      </button>
      <span aria-hidden className="hidden h-8 w-px bg-[var(--bp2-borda)] lg:block" />
      <button type="button" onClick={p.onPerfil} aria-label="Abrir meu perfil" className="hidden items-center gap-3 rounded-full py-1 pl-1 pr-2 text-left lg:flex">
        <Avatar nome={nome} foto={foto} tamanho="lg" />
        <span className="min-w-0">
          <span className="block max-w-[14rem] truncate text-[13px] font-medium">{nome}</span>
          <span className="block max-w-[14rem] truncate text-[11px] bp2-t-2">Paciente</span>
        </span>
        <ChevronDown className="ml-6 h-4 w-4 bp2-t-2" aria-hidden />
      </button>
    </header>
  );

  /* ------------------- cartão da consulta (destaque) ------------------- */
  const cartaoConsulta = (c: Consulta, i: number) => {
    const a = acaoSala(c);
    const st = statusTriagem(c.id);
    const triagemPendente = st !== "feita" && janelaTriagem(c);
    const principal = botaoPrincipalProxima(a, triagemPendente);
    const etiqueta = etiquetaDe(c);
    const tipo = tipoDaConsulta(c);
    return (
      <div
        key={c.id}
        className={`bp2-slide bp2-destaque flex flex-col rounded-[0.9rem] p-4 ${i > 0 ? "lg:hidden" : ""}`}
        role="group"
        aria-roledescription="slide"
        aria-label={`Consulta ${i + 1} de ${slides.length}: ${c.especialidade} com ${c.medico}, ${c.data} às ${c.hora}`}
      >
        <div className="flex items-center gap-3">
          <Avatar nome={c.medico} tamanho="xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px]">{c.medico}</div>
            <div className="bp2-destaque-tipo truncate text-xs">
              {c.especialidade}
              {tipo ? ` · ${tipo}` : ""}
            </div>
          </div>
          <span className="bp2-destaque-etiqueta shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium">{etiqueta.texto}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <dt className="bp2-destaque-rotulo text-xs">Data</dt>
            <dd className="mt-0.5 truncate text-[15px]">{c.data}</dd>
          </div>
          <div className="min-w-0">
            <dt className="bp2-destaque-rotulo text-xs">Horário</dt>
            <dd className="mt-0.5 truncate text-[15px] tabular-nums">{c.hora}</dd>
          </div>
        </dl>
        <div className="bp2-contagem mt-3 flex items-center">
          <ContagemConsulta ts={c.ts} />
        </div>
        {/* Slides com alturas iguais: a sobra fica antes dos botões, não abaixo do cartão */}
        <div className="flex-1" aria-hidden />
        {p.botaoPagar(c)}
        <div className="mt-3 flex items-center gap-2" aria-live="polite">
          {principal === "sala" ? (
            <button type="button" onClick={() => p.onEntrar(c)} className="bp2-botao-azul inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[0.6rem] px-4 text-[13px] lg:h-10">
              <Video className="h-4 w-4" aria-hidden /> Entrar na sala
            </button>
          ) : principal === "triagem" ? (
            <button type="button" onClick={() => p.onTriagem(c.id)} className="bp2-botao-azul inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[0.6rem] px-4 text-[13px] lg:h-10">
              <Sparkles className="h-4 w-4" aria-hidden /> {st === "andamento" ? "Continuar triagem" : "Fazer triagem"}
            </button>
          ) : principal === "aguardar" && a.tipo === "aguardar" ? (
            <button type="button" disabled className="bp2-botao-azul inline-flex h-11 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-[0.6rem] px-4 text-[13px] lg:h-10">
              <Clock3 className="h-4 w-4" aria-hidden /> {a.rotulo}
            </button>
          ) : (
            <span className="flex-1 text-xs bp2-destaque-rotulo">{a.tipo === "nenhuma" ? "A sala desta consulta já fechou." : null}</span>
          )}
          <button
            type="button"
            onClick={() => p.onRemarcar(c.id)}
            aria-label={`Remarcar consulta de ${c.data} às ${c.hora}`}
            title="Remarcar"
            className="bp2-botao-relogio grid h-11 w-11 shrink-0 place-items-center rounded-[0.6rem] lg:h-10 lg:w-10"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => p.onCancelar(c.id)}
            aria-label={`Cancelar consulta de ${c.data} às ${c.hora}`}
            title="Cancelar"
            className="bp2-botao-relogio grid h-11 w-11 shrink-0 place-items-center rounded-[0.6rem] lg:h-10 lg:w-10"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {st === "feita" ? (
          <p className="bp2-destaque-rotulo mt-2 text-xs">Triagem enviada ao médico.</p>
        ) : null}
        {a.tipo === "aguardar" ? (
          <p className="bp2-destaque-rotulo mt-2 text-xs">
            {principal === "triagem" ? `${a.rotulo}. ` : null}A sala abre {SALA_ABRE_ANTES_MIN} min antes do horário.
          </p>
        ) : null}
      </div>
    );
  };

  const destaque = proxima ? (
    <div className="bp2-carrossel-area" role="region" aria-roledescription="carrossel" aria-label="Próximas consultas">
      <div ref={carrosselRef} onScroll={aoRolarCarrossel} className="bp2-carrossel" tabIndex={-1}>
        {slides.map(cartaoConsulta)}
      </div>
      {slides.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5 lg:hidden">
          {slides.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => irSlide(i)}
              aria-label={`Ver consulta ${i + 1} de ${slides.length}`}
              aria-current={slide === i ? "true" : undefined}
              className="grid h-6 w-6 place-items-center"
            >
              <span aria-hidden className={`bp2-ponto block rounded-full ${slide === i ? "bp2-ponto-ativo" : ""}`} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  ) : (
    <div className="bp2-destaque rounded-[0.9rem] p-4">
      <p className="text-[15px]">Nenhuma consulta agendada</p>
      <p className="bp2-destaque-rotulo mt-1 text-xs">A BION IA agenda, cuida do pagamento e faz a triagem com você.</p>
      <button type="button" onClick={p.onAgendar} className="bp2-botao-azul mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[0.6rem] px-4 text-[13px] lg:h-10">
        <Sparkles className="h-4 w-4" aria-hidden /> Agendar com a BION IA
      </button>
    </div>
  );

  const outras = proximas.slice(1);
  const colunaProximas = (
    <section className="bp2-hoje flex flex-col bp2-animar bp2-animar-d1" aria-labelledby="bp2-hoje-titulo">
      <div className="bp2-hoje-cab flex items-start justify-between gap-2">
        <div>
          <p className="text-xs bp2-t-2">{diaPorExtenso(agora)}</p>
          <h2 id="bp2-hoje-titulo" className="mt-0.5 text-[15px] font-medium">
            {proximas.length ? plural(proximas.length, "consulta agendada", "consultas agendadas") : "Nenhuma consulta agendada"}
          </h2>
        </div>
        <button type="button" onClick={p.onAgendar} aria-label="Agendar consulta com a BION IA" title="Agendar consulta" className="bp2-mais grid h-9 w-9 place-items-center rounded-full lg:h-10 lg:w-10">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="bp2-hoje-destaque">{destaque}</div>
      {outras.length ? (
        <ul className="bp2-hoje-lista space-y-2 bp2-lista-animar" aria-label="Outras consultas agendadas">
          {outras.map((c) => {
            const e = etiquetaDe(c);
            const aberta = acaoSala(c).tipo === "entrar";
            const conteudo = (
              <>
                <span className="min-w-0">
                  <span className="bp2-item-nome block truncate text-sm">{c.medico}</span>
                  <span className="bp2-item-sub block truncate text-xs bp2-t-azul">{c.especialidade}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <Estado e={e} />
                  <span className="bp2-item-sub text-xs bp2-t-2 tabular-nums">
                    {c.data} · {c.hora}
                  </span>
                </span>
              </>
            );
            return (
              <li key={c.id}>
                {aberta ? (
                  <button type="button" onClick={() => p.onEntrar(c)} className="bp2-item flex w-full items-center justify-between gap-3 rounded-[0.9rem] px-3 py-2.5 text-left" aria-label={`Entrar na sala: ${c.especialidade} com ${c.medico}`}>
                    {conteudo}
                  </button>
                ) : (
                  <div className="bp2-item flex items-center justify-between gap-3 rounded-[0.9rem] px-3 py-2.5">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="bp2-hoje-rodape mt-auto pt-3 text-[11px] bp2-t-2">
        A sala abre {SALA_ABRE_ANTES_MIN} min antes do horário. O teste de câmera e microfone é feito dentro da chamada.
      </p>
    </section>
  );

  /* ------------------------ cartões coloridos ------------------------ */
  const alerta = (() => {
    switch (acao.tipo) {
      case "reagendar":
        return {
          texto: `Sua consulta de ${acao.especialidade} precisa de um novo horário, sem multa.`,
          legenda: null as string | null,
          rotulo: "Escolher novo horário",
          onClick: () => p.aguardandoReagendamento && p.onRemarcar(p.aguardandoReagendamento.id),
          medico: null as string | null,
        };
      case "pagar":
        return { texto: "Conclua o pagamento para confirmar sua consulta.", legenda: `${acao.medico} · ${acao.quando}`, rotulo: "Ver a consulta e pagar", onClick: () => document.getElementById("bp2-hoje-titulo")?.scrollIntoView({ block: "start" }), medico: acao.medico };
      case "triagem":
        return {
          texto: acao.andamento ? "Termine a triagem: o médico já te conhece antes da consulta." : "Faça a triagem: uma conversa rápida para o médico te conhecer antes da consulta.",
          legenda: `${acao.medico} · ${acao.quando}`,
          rotulo: acao.andamento ? "Continuar triagem" : "Fazer triagem",
          onClick: () => proxima && p.onTriagem(proxima.id),
          medico: acao.medico,
        };
      case "mensagem":
        return {
          texto: `${acao.medico} te enviou ${acao.total === 1 ? "uma mensagem" : `${acao.total} mensagens`}.`,
          legenda: null,
          rotulo: "Abrir conversa",
          onClick: () => p.ultimaNaoLidaDe && p.onAbrirConversa(p.ultimaNaoLidaDe.medicoId),
          medico: acao.medico,
        };
      default:
        return {
          texto: "Nada pendente agora. Quando precisar, a BION IA agenda sua consulta.",
          legenda: null,
          rotulo: "Agendar com a BION IA",
          onClick: p.onAgendar,
          medico: null,
        };
    }
  })();

  const cartoes = (
    <div className="bp2-cartoes grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2.75fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-5 bp2-animar bp2-animar-d2">
      <section className="bp2-cor bp2-lavanda col-span-2 lg:col-span-1" aria-labelledby="bp2-alerta-t">
        <h2 id="bp2-alerta-t" className="bp2-cor-titulo bp2-t-cor">
          Requer sua atenção
        </h2>
        <p className="bp2-barra-esq bp2-cor-texto mt-2.5 max-w-[26rem] !text-[15px]" role={acao.tipo === "nada" ? undefined : "status"}>
          {alerta.texto}
        </p>
        {alerta.legenda ? <p className="mt-2 text-xs bp2-t-cor">{alerta.legenda}</p> : null}
        <div className="mt-auto flex items-center pt-3 pr-14">
          {alerta.medico ? (
            <span className="bp2-pilha-item">
              <Avatar nome={alerta.medico} />
            </span>
          ) : (
            <span aria-hidden className="bp2-pilha-item grid h-9 w-9 place-items-center rounded-full bg-white text-[#242424]">
              <Sparkles className="h-4 w-4" />
            </span>
          )}
        </div>
        <BotaoSeta rotulo={alerta.rotulo} onClick={alerta.onClick} />
      </section>
      <section className="bp2-cor bp2-azul-suave" aria-labelledby="bp2-msg-t">
        <h2 id="bp2-msg-t" className="bp2-cor-titulo bp2-t-cor">
          Mensagens
        </h2>
        <p className="bp2-barra-esq bp2-cor-texto mt-2.5">Não lidas dos seus médicos</p>
        <span className="bp2-numero-grande mt-auto pt-3" aria-label={`${p.naoLidas} mensagens não lidas`}>
          {p.naoLidas}
        </span>
        <BotaoSeta rotulo="Abrir mensagens" onClick={p.onMensagens} />
      </section>
      <section className="bp2-cor bp2-pessego" aria-labelledby="bp2-doc-t">
        <h2 id="bp2-doc-t" className="bp2-cor-titulo bp2-t-cor">
          Documentos
        </h2>
        <p className="bp2-barra-esq bp2-cor-texto mt-2.5">Receitas, atestados e pedidos</p>
        <span className="bp2-numero-grande mt-auto pt-3" aria-label={`${p.documentos} documentos`}>
          {p.documentos}
        </span>
        <BotaoSeta rotulo="Abrir documentos" onClick={p.onDocumentos} />
      </section>
    </div>
  );

  /* ------------------------- histórico (tabela) ------------------------- */
  const visiveis = historicoFiltrado.slice(0, LIMITE_TABELA);
  const tabela = (
    <section className="bp2-cartao min-w-0 px-4 pb-3 pt-4 lg:px-5 lg:pt-5 bp2-animar bp2-animar-d3" aria-labelledby="bp2-hist-t">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="bp2-hist-t" className="mr-auto text-[15px] font-medium">
          Histórico de consultas <span className="bp2-t-2">· {historico.length}</span>
        </h2>
        <label className="bp2-busca relative order-last flex w-full items-center sm:order-none sm:w-auto">
          <span className="sr-only">Buscar por médico ou especialidade</span>
          <Search className="pointer-events-none absolute left-3 h-4 w-4 bp2-t-2" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="w-full bg-transparent py-2 pl-9 pr-3 text-[13px] outline-none sm:w-44"
          />
        </label>
        <button type="button" onClick={p.onVerHistorico} aria-label="Ver todas as consultas e pagamentos" title="Ver todas" className="bp2-mais grid h-9 w-9 place-items-center rounded-full">
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {historico.length === 0 ? (
        <p className="py-6 text-center text-[13px] bp2-t-2">Suas consultas realizadas aparecem aqui.</p>
      ) : visiveis.length === 0 ? (
        <p className="py-6 text-center text-[13px] bp2-t-2">Nenhuma consulta encontrada para “{busca}”.</p>
      ) : (
        <>
          <table className="bp2-tabela mt-3 hidden w-full table-fixed text-left md:table">
            <thead>
              <tr className="text-xs bp2-t-2">
                <th scope="col" className="w-[24%] px-3 py-2 font-normal">Médico</th>
                <th scope="col" className="w-[22%] px-3 py-2 font-normal">Especialidade</th>
                <th scope="col" className="w-[20%] px-3 py-2 font-normal">Situação</th>
                <th scope="col" className="w-[18%] px-3 py-2 font-normal">Data</th>
                <th scope="col" className="px-3 py-2 font-normal">Horário</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {visiveis.map((l, i) => (
                <tr key={l.id} className={`bp2-tr ${i === 0 ? "bp2-tr-destaque" : ""}`}>
                  <td className="truncate rounded-l-lg px-3 py-2">{l.medico}</td>
                  <td className="truncate px-3 py-2">{l.especialidade}</td>
                  <td className="px-3 py-2">
                    <Estado e={l.situacao} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{l.data}</td>
                  <td className="rounded-r-lg px-3 py-2 tabular-nums">{l.hora}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-3 space-y-2 md:hidden" aria-label="Histórico de consultas">
            {visiveis.map((l) => (
              <li key={l.id} className="bp2-item flex items-center justify-between gap-3 rounded-[0.9rem] px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{l.medico}</span>
                  <span className="block truncate text-xs bp2-t-2">{l.especialidade}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <Estado e={l.situacao} />
                  <span className="text-xs bp2-t-2 tabular-nums">{l.data}</span>
                </span>
              </li>
            ))}
          </ul>
          {historicoFiltrado.length > LIMITE_TABELA ? (
            <button type="button" onClick={p.onVerHistorico} className="mt-2 px-3 text-xs bp2-t-azul underline underline-offset-2">
              Ver todas as {historicoFiltrado.length} consultas
            </button>
          ) : null}
        </>
      )}
    </section>
  );

  const numeros = [
    { rotulo: "Próximas", rotuloLargo: "Próximas consultas", valor: proximas.length },
    { rotulo: "Realizadas", rotuloLargo: "Consultas realizadas", valor: realizadas },
    { rotulo: "Documentos", rotuloLargo: "Documentos emitidos", valor: p.documentos },
  ];

  return (
    <div className="bp2-conteudo mx-auto w-full">
      {topo}

      <div className="bp2-cabecalho flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between bp2-animar bp2-animar-d1">
        <h1 id="bp2-t1-titulo" className="bp2-saudacao">
          <span className="bp2-saudacao-1">{saudacao},</span>
          <span className="bp2-saudacao-2">{primeiroNome}</span>
        </h1>
        <div className="flex items-end gap-4">
          <dl className="bp2-numeros grid flex-1 grid-cols-3 lg:flex lg:flex-none lg:items-end">
            {numeros.map((n) => (
              <div key={n.rotulo} className="bp2-numero">
                <dt className="bp2-numero-rotulo">
                  <span className="lg:hidden">{n.rotulo}</span>
                  <span className="hidden lg:inline">{n.rotuloLargo}</span>
                </dt>
                <dd className="bp2-numero-valor tabular-nums">{n.valor}</dd>
              </div>
            ))}
          </dl>
          <div className="hidden gap-2 pb-0.5 lg:flex">
            <button type="button" onClick={p.onSaude} aria-label="Ver minha saúde" title="Minha saúde" className="bp2-botao-quadrado grid h-9 w-9 place-items-center rounded-[0.6rem]">
              <HeartPulse className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={p.onAgendar} aria-label="Agendar consulta com a BION IA" title="Agendar consulta" className="bp2-mais grid h-9 w-9 place-items-center rounded-[0.6rem]">
              <CalendarClock className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="bp2-grade">
        <div className="bp2-area-hoje">{colunaProximas}</div>
        <div className="bp2-area-avisos flex flex-col gap-3">
          {acao.tipo === "mensagem" ? null : p.avisoMensagem}
          {p.avisos}
        </div>
        <div className="bp2-area-cartoes">{cartoes}</div>
        <div className="bp2-area-tabela min-w-0">{tabela}</div>
      </div>
    </div>
  );
}

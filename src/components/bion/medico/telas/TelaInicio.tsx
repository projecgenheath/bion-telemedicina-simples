"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  Info,
  ListFilter,
  MessageCircle,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SinoTopo } from "../TopoMedico";
import { PainelEvolucao } from "../evolucao/PainelEvolucao";
import { AvisoAtivarToque } from "@/components/bion/AvisoAtivarToque";
import { ContagemRegressiva } from "../ContagemRegressiva";
import { chavePaciente, iniciais, reservaVigente, salaAberta, saudacao, textoReservaPendente, type PacienteDoMedico } from "../metricas";
import { normalizarTipoAtendimento, ROTULO_TIPO } from "@/lib/atendimento-tipo";
import type { Consulta } from "@/lib/bion-tipos";
import {
  alertaPrioritario,
  consultasProximosDias,
  dataHoraClinica,
  faixaHorario,
  filtrarPacientes,
  linhaPaciente,
  mediaAvaliacoes,
  pilhaAvatares,
  plural,
  type TomSituacao,
} from "../inicio/inicio-dados";
import type { DadosMedico } from "../useDadosMedico";

const primeiroNome = (nome: string) => nome.split(" ").filter(Boolean)[0] ?? "";
const LIMITE_TABELA = 7; // a ref. 12 mostra 7 linhas
const MAX_CARROSSEL = 5;

/** Classe de cor de texto (AA) para cada tom de situação. */
const COR_TOM: Record<TomSituacao, string> = {
  azul: "bm2-t-azul",
  laranja: "bm2-t-laranja",
  vermelho: "bm2-t-vermelho",
  verde: "bm2-t-verde",
  neutro: "bm2-t-2",
};
const ICONE_TOM: Record<TomSituacao, typeof CircleAlert | null> = {
  azul: Clock3,
  laranja: CircleAlert,
  vermelho: CircleAlert,
  verde: CircleCheck,
  neutro: null,
};

/** Avatar de iniciais (o app não guarda foto de paciente). */
function AvatarIniciais({ nome, tamanho = "md" }: { nome: string; tamanho?: "sm" | "md" | "lg" | "xl" }) {
  const t = tamanho === "xl" ? "h-12 w-12 text-sm lg:h-[3.25rem] lg:w-[3.25rem] lg:text-[15px]" : tamanho === "lg" ? "h-12 w-12 text-sm" : tamanho === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <span aria-hidden className={`bm2-avatar ${t} grid shrink-0 place-items-center rounded-full font-medium`}>
      {iniciais(nome)}
    </span>
  );
}

/** Botão preto redondo com seta, encaixado no recorte do canto do cartão. */
function BotaoSeta({ rotulo, onClick, disabled = false }: { rotulo: string; onClick: () => void; disabled?: boolean }) {
  return (
    <span className="bm2-recorte">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={rotulo}
        title={rotulo}
        className="bm2-seta grid h-10 w-10 place-items-center rounded-full disabled:opacity-40"
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}

/**
 * Tela 1 — Início do médico no visual do modelo de referência (etapa 2 do
 * redesign azul). Só dados que o app já tem (ver inicio-dados.ts).
 */
export function TelaInicio({
  dados,
  onAbrirPerfil,
  onAbrirPacientes,
  onAbrirMensagens,
  onAbrirPaciente,
  onAbrirAgenda,
  onAbrirGestao,
  onAbrirRenovacoes,
  onAbrirNotificacoes,
}: {
  dados: DadosMedico;
  onAbrirPerfil: () => void;
  onAbrirPacientes: () => void;
  /** Rodada do menu: abre a última conversa (ou a lista, se não houver). */
  onAbrirMensagens: () => void;
  /** Abre a conversa/prontuário de um paciente. */
  onAbrirPaciente: (p: PacienteDoMedico) => void;
  /** Agenda do dia (folha Agenda, que abre no dia de hoje). */
  onAbrirAgenda: () => void;
  /** Rola até a seção Gestão (receita, repasses). */
  onAbrirGestao: () => void;
  onAbrirRenovacoes: () => void;
  onAbrirNotificacoes: () => void;
}) {
  const router = useRouter();
  const {
    sessao,
    medico,
    minhas,
    proxima,
    pacienteNaSala,
    hoje,
    agora,
    acoesPaciente,
    acoesPacienteEstado,
    naoLidasPorPaciente,
    renovacoesPendentes,
    listaPacientes,
    avaliacoes,
  } = dados;
  const [evolucaoPendente, setEvolucaoPendente] = useState<{ consultaId: string; paciente: string } | null>(null);
  const [evolucaoAberta, setEvolucaoAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [soComProxima, setSoComProxima] = useState(false);
  const [slide, setSlide] = useState(0);
  const carrosselRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      const res = await fetch("/api/medico/evolucao-pendente", { cache: "no-store" }).catch(() => null);
      if (!vivo || !res?.ok) return;
      const json = (await res.json().catch(() => null)) as { pendente?: { consultaId?: string; paciente?: string } | null } | null;
      const p = json?.pendente;
      setEvolucaoPendente(p?.consultaId && p.paciente ? { consultaId: p.consultaId, paciente: p.paciente } : null);
    };
    void buscar();
    const id = window.setInterval(() => void buscar(), 30_000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, []);

  const totalNaoLidas = [...naoLidasPorPaciente.values()].reduce((a, b) => a + b, 0);
  const conversasComNaoLidas = naoLidasPorPaciente.size;
  const dataHoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(agora);
  const nomeExibicao = sessao.nome.replace(/^(dr|dra)\.?\s+/i, "");
  const tratamento = /^dra\.?\s/i.test(sessao.nome) ? "Dra." : /^dr\.?\s/i.test(sessao.nome) ? "Dr." : "";
  const reservaProxima = proxima ? reservaVigente(proxima, agora) : null;
  const semana = useMemo(() => consultasProximosDias(minhas, agora, 7), [minhas, agora]);
  const notas = useMemo(() => mediaAvaliacoes(avaliacoes), [avaliacoes]);
  const outrasHoje = hoje.agendadas.filter((c) => c.id !== proxima?.id);
  // Carrossel do celular (ref. 03): a próxima consulta e as que ainda faltam hoje.
  const slides: Consulta[] = proxima
    ? [proxima, ...hoje.restantes.filter((c) => c.id !== proxima.id)].slice(0, MAX_CARROSSEL)
    : [];
  const pacientesFiltrados = useMemo(() => filtrarPacientes(listaPacientes, busca, soComProxima), [listaPacientes, busca, soComProxima]);
  const linhas = pacientesFiltrados.slice(0, LIMITE_TABELA).map((p) => linhaPaciente(p, agora));
  const pacientesNaoLidas = listaPacientes.filter((p) => p.pacienteId && naoLidasPorPaciente.has(p.pacienteId));
  const alerta = alertaPrioritario({
    evolucaoPaciente: evolucaoPendente?.paciente ?? null,
    pacienteNaSala: pacienteNaSala && proxima ? proxima.paciente : null,
    reservaTexto: reservaProxima ? textoReservaPendente(reservaProxima) : null,
    acoes: acoesPaciente,
  });
  const entrarNaSala = (c: Consulta) => router.push(`/consulta?consulta=${encodeURIComponent(c.id)}`);
  const pacienteDe = (c: Pick<Consulta, "paciente" | "pacienteId">) => listaPacientes.find((p) => p.chave === chavePaciente(c));

  // Pacientes REAIS envolvidos no alerta (evolução: pelo nome que a API devolve).
  const envolvidos: { chave: string; nome: string }[] =
    alerta.tipo === "evolucao"
      ? [listaPacientes.find((p) => p.nome === alerta.paciente) ?? { chave: `nome:${alerta.paciente}`, nome: alerta.paciente }]
      : (alerta.tipo === "na_sala" || alerta.tipo === "reserva") && proxima
        ? [{ chave: chavePaciente(proxima), nome: proxima.paciente }]
        : [];
  const pilha = pilhaAvatares(envolvidos, pacientesNaoLidas);

  const aoRolarCarrossel = () => {
    const el = carrosselRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== slide) setSlide(i);
  };
  const irSlide = (i: number) => {
    const el = carrosselRef.current;
    if (!el) return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: suave ? "smooth" : "auto" });
    setSlide(i);
  };

  // Celular: o carrossel acompanha a altura do slide visível (sem vazio abaixo dos slides menores).
  useEffect(() => {
    const el = carrosselRef.current;
    const ativo = el?.children[slide] as HTMLElement | undefined;
    if (!el || !ativo) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const ajustar = () => {
      el.style.height = mq.matches ? "" : `${ativo.offsetHeight + 8}px`;
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(ativo);
    mq.addEventListener("change", ajustar);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", ajustar);
    };
  }, [slide, slides.length]);

  const numeros: { valor: string; rotulo: string; rotuloLargo?: string; sufixo?: string; titulo: string }[] = [
    { valor: String(hoje.agendadas.length), rotulo: "Consultas hoje", titulo: "Consultas marcadas para hoje (sem as canceladas)" },
    { valor: String(semana), rotulo: "Próximos 7 dias", titulo: "Consultas confirmadas ou aguardando pagamento nos próximos 7 dias" },
    {
      valor: notas ? notas.media.toLocaleString("pt-BR", { minimumFractionDigits: 1 }) : "—",
      sufixo: notas ? "/5" : undefined,
      rotulo: "Avaliação",
      rotuloLargo: "Avaliação dos pacientes",
      titulo: notas
        ? `Média de ${plural(notas.total, "avaliação", "avaliações")} que os pacientes deixaram depois das consultas`
        : "Ainda sem avaliações dos pacientes",
    },
  ];

  /* ------------------------------ topo ------------------------------ */
  const topo = (
    <header className="bm2-topo flex items-center gap-3 bm-animar">
      <button type="button" onClick={onAbrirPerfil} className="flex min-w-0 flex-1 items-center gap-3 text-left lg:hidden" aria-label="Abrir meu perfil">
        {medico?.foto ? <img src={medico.foto} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <AvatarIniciais nome={sessao.nome} tamanho="lg" />}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{sessao.nome}</span>
          <span className="block truncate text-xs bm2-t-2">{medico?.especialidade ?? "Médico(a)"}</span>
        </span>
      </button>
      <label className="relative hidden min-w-0 flex-1 items-center lg:flex">
        <span className="sr-only">Buscar paciente</span>
        <Search className="pointer-events-none absolute left-0 h-4 w-4 bm2-t-2" aria-hidden />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar paciente…"
          className="bm2-busca-topo w-full max-w-md bg-transparent py-2 pl-7 text-[13px] outline-none"
        />
      </label>
      <SinoTopo />
      <button
        type="button"
        onClick={onAbrirMensagens}
        aria-label={totalNaoLidas > 0 ? `Mensagens: ${totalNaoLidas} não lida${totalNaoLidas > 1 ? "s" : ""}. Abrir mensagens` : "Mensagens. Abrir mensagens"}
        className="bm2-icone-topo bm2-icone-topo-borda relative grid h-11 w-11 shrink-0 place-items-center rounded-full lg:hidden"
      >
        <MessageCircle className="h-[1.15rem] w-[1.15rem]" aria-hidden />
        {totalNaoLidas > 0 ? <span aria-hidden className="bm2-contador">{totalNaoLidas > 99 ? "99+" : totalNaoLidas}</span> : null}
      </button>
      <span aria-hidden className="hidden h-8 w-px bg-[var(--bm2-borda)] lg:block" />
      <button type="button" onClick={onAbrirPerfil} aria-label="Abrir meu perfil" className="hidden items-center gap-3 rounded-full py-1 pl-1 pr-2 text-left lg:flex">
        {medico?.foto ? <img src={medico.foto} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <AvatarIniciais nome={sessao.nome} tamanho="lg" />}
        <span className="min-w-0">
          <span className="block max-w-[14rem] truncate text-[13px] font-medium">{sessao.nome}</span>
          <span className="block max-w-[14rem] truncate text-[11px] bm2-t-2">{medico?.especialidade ?? "Médico(a)"}</span>
        </span>
        <ChevronDown className="ml-6 h-4 w-4 bm2-t-2" aria-hidden />
      </button>
    </header>
  );

  /* ---------------- cartão de consulta (destaque/carrossel) ---------------- */
  const cartaoConsulta = (c: Consulta, i: number) => {
    const abertaC = salaAberta(c.ts, agora);
    const ehProxima = c.id === proxima?.id;
    const p = pacienteDe(c);
    return (
      <div
        key={c.id}
        className={`bm2-slide bm2-destaque flex flex-col rounded-[0.9rem] p-4 ${i > 0 ? "lg:hidden" : ""}`}
        role="group"
        aria-roledescription="slide"
        aria-label={`Consulta ${i + 1} de ${slides.length}: ${c.paciente}, ${c.hora}`}
      >
        <div className="flex items-center gap-3">
          <AvatarIniciais nome={c.paciente} tamanho="xl" />
          <div className="min-w-0">
            {p ? (
              <button type="button" onClick={() => onAbrirPaciente(p)} className="block max-w-full truncate text-left text-[15px] hover:underline" title="Conversa e prontuário">
                {c.paciente}
              </button>
            ) : (
              <div className="truncate text-[15px]">{c.paciente}</div>
            )}
            <div className="bm2-destaque-tipo text-xs">{ROTULO_TIPO[normalizarTipoAtendimento(c.tipoAtendimento)]}</div>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
          <dt className="text-[11px] bm2-destaque-rotulo lg:text-xs">Motivo</dt>
          <dt className="text-[11px] bm2-destaque-rotulo lg:text-xs">Horário{c.data !== "Hoje" ? ` · ${c.data}` : ""}</dt>
          <dd className="bm2-destaque-motivo truncate text-[15px]" title={c.motivoConsulta || undefined}>
            {c.motivoConsulta || "Não informado"}
          </dd>
          <dd className="text-[15px] tabular-nums" title="Duração contada pelo servidor: 30 min">
            {faixaHorario(c.ts)}
          </dd>
        </dl>
        {abertaC ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium">
            <span aria-hidden className="h-2 w-2 rounded-full bg-[#1e7a34]" />
            Sala aberta
          </p>
        ) : null}
        {ehProxima && reservaProxima ? <p className="bm2-aviso mt-3 rounded-xl px-3 py-2 text-xs font-medium">{textoReservaPendente(reservaProxima)}</p> : null}
        {ehProxima && pacienteNaSala ? (
          <p role="status" className="bm2-aviso-verde mt-3 inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            Seu paciente já está na sala de espera.
          </p>
        ) : null}
        {!abertaC ? (
          <div className="bm2-contagem mt-3 rounded-xl px-3 py-2">
            <ContagemRegressiva alvo={c.ts} />
          </div>
        ) : null}
        <div className="mt-auto flex items-center gap-2 pt-3">
          <button
            type="button"
            disabled={!abertaC}
            onClick={() => entrarNaSala(c)}
            className="bm2-botao-azul inline-flex h-11 flex-1 items-center justify-center rounded-[0.6rem] px-4 text-[13px] lg:h-10 lg:rounded-[0.55rem]"
          >
            {abertaC ? "Entrar na sala" : "A sala abre 30 min antes"}
          </button>
          <button
            type="button"
            onClick={onAbrirAgenda}
            aria-label="Ver agenda e horários de hoje"
            title="Agenda de hoje"
            className="bm2-botao-relogio grid h-11 w-11 shrink-0 place-items-center rounded-[0.6rem] lg:h-10 lg:w-10 lg:rounded-[0.7rem]"
          >
            <Clock3 className="h-[1.05rem] w-[1.05rem]" aria-hidden />
          </button>
        </div>
      </div>
    );
  };
  const destaque =
    slides.length > 0 ? (
      <div className="bm2-carrossel-area" role="region" aria-roledescription="carrossel" aria-label="Próximas consultas">
        <div ref={carrosselRef} onScroll={aoRolarCarrossel} className="bm2-carrossel" tabIndex={-1}>
          {slides.map(cartaoConsulta)}
        </div>
        {slides.length > 1 ? (
          <div className="bm2-pontos mt-3 flex items-center justify-center gap-1.5 lg:hidden">
            {slides.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => irSlide(i)}
                aria-label={`Mostrar consulta ${i + 1} de ${slides.length}`}
                aria-current={i === slide ? "true" : undefined}
                className="grid h-6 w-6 place-items-center"
              >
                <span aria-hidden className={`bm2-ponto block rounded-full ${i === slide ? "bm2-ponto-ativo" : ""}`} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    ) : (
      <div className="bm2-destaque rounded-[0.9rem] p-4" aria-label="Nenhuma consulta futura na agenda">
        <div className="text-[15px]">Nenhuma consulta na agenda</div>
        <p className="mt-1 text-xs bm2-destaque-rotulo">Quando um paciente agendar, a consulta aparece aqui.</p>
        <button type="button" onClick={onAbrirAgenda} className="bm2-botao-azul mt-3 h-10 w-full rounded-[0.6rem] px-4 text-[13px]">
          Ver agenda e horários
        </button>
      </div>
    );

  /* --------------------------- coluna Hoje --------------------------- */
  const colunaHoje = (
    <section className="bm2-hoje flex flex-col bm-animar bm-animar-d1" aria-labelledby="bm2-hoje-titulo">
      <div className="bm2-hoje-cab flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] bm2-t-2 first-letter:uppercase lg:text-xs">{dataHoje}</p>
          <h2 id="bm2-hoje-titulo" className="mt-0.5 text-base">
            {plural(hoje.agendadas.length, "consulta", "consultas")}
          </h2>
        </div>
        <button type="button" onClick={onAbrirAgenda} aria-label="Abrir agenda e horários" title="Agenda e horários" className="bm2-mais grid h-9 w-9 place-items-center rounded-full lg:h-10 lg:w-10">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="bm2-hoje-destaque">{destaque}</div>
      {outrasHoje.length > 0 ? (
        <ul className="bm2-hoje-lista space-y-2 bm-lista-animar" aria-label="Outras consultas de hoje">
          {outrasHoje.map((c) => {
            const p = pacienteDe(c);
            const tipo = normalizarTipoAtendimento(c.tipoAtendimento);
            const conteudo = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="bm2-item-nome block truncate text-sm">{c.paciente}</span>
                  <span className={`bm2-item-sub block truncate text-[11px] ${tipo === "padrao" ? "bm2-t-azul" : "bm2-t-roxo"}`}>{ROTULO_TIPO[tipo]}</span>
                </span>
                <span className="ml-3 min-w-0 max-w-[48%] shrink-0 text-right">
                  <span className={`bm2-item-motivo block truncate text-[13px] ${c.status === "em_espera" ? "bm2-t-vermelho" : "bm2-t-laranja"}`}>{c.motivoConsulta || "—"}</span>
                  <span className={`bm2-item-sub block text-[11px] tabular-nums ${c.ts <= agora ? "bm2-t-2" : ""}`}>{c.hora}</span>
                </span>
              </>
            );
            return (
              <li key={c.id}>
                {p ? (
                  <button type="button" onClick={() => onAbrirPaciente(p)} className="bm2-item flex w-full items-center justify-between rounded-[0.9rem] px-3 py-2.5 text-left">
                    {conteudo}
                  </button>
                ) : (
                  <div className="bm2-item flex items-center justify-between rounded-[0.9rem] px-3 py-2.5">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="bm2-hoje-rodape mt-auto pt-3 text-[11px] bm2-t-2" aria-busy={acoesPacienteEstado.carregando}>
        {acoesPaciente ? (
          <p className="inline-flex items-start gap-1.5" title="Consultas de hoje que o paciente remarcou ou cancelou. Cancelamentos feitos por você, novas datas depois de um cancelamento seu e remarcações ainda não pagas não contam.">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Hoje, pelo paciente: {plural(acoesPaciente.remarcadas, "remarcada", "remarcadas")} · {plural(acoesPaciente.canceladas, "cancelada", "canceladas")}
            </span>
          </p>
        ) : acoesPacienteEstado.erro ? (
          <p role="alert" className="bm2-t-vermelho">
            Remarcadas e canceladas: {acoesPacienteEstado.erro}{" "}
            <button type="button" onClick={acoesPacienteEstado.recarregar} className="font-medium underline underline-offset-2">
              Tentar de novo
            </button>
          </p>
        ) : (
          <span role="status">Carregando remarcadas e canceladas…</span>
        )}
      </div>
    </section>
  );

  /* ------------------------ cartões coloridos ------------------------ */
  const textoAlerta =
    alerta.tipo === "evolucao"
      ? "Evolução em rascunho. Novos atendimentos ficam segurados até você concluir."
      : alerta.tipo === "na_sala"
        ? "Seu paciente já entrou na sala de espera."
        : alerta.tipo === "reserva"
          ? alerta.texto
          : alerta.tipo === "acoes"
            ? `Hoje os pacientes remarcaram ${plural(alerta.remarcadas, "consulta", "consultas")} e cancelaram ${alerta.canceladas}.`
            : "Nada precisa da sua atenção agora.";
  const legendaAlerta: { nome: string; destaque: string } | null =
    alerta.tipo === "evolucao"
      ? { nome: alerta.paciente, destaque: "Evolução pendente" }
      : alerta.tipo === "na_sala"
        ? { nome: alerta.paciente, destaque: "Na sala de espera" }
        : alerta.tipo === "reserva" && proxima
          ? { nome: proxima.paciente, destaque: "Remarcação pendente" }
          : null;
  const rotuloAlerta =
    alerta.tipo === "evolucao" ? "Concluir evolução" : alerta.tipo === "na_sala" ? "Entrar na sala" : alerta.tipo === "nada" ? "Abrir notificações" : "Abrir agenda";
  const acaoAlerta = () => {
    if (alerta.tipo === "evolucao") setEvolucaoAberta(true);
    else if (alerta.tipo === "na_sala" && proxima) entrarNaSala(proxima);
    else if (alerta.tipo === "nada") onAbrirNotificacoes();
    else onAbrirAgenda();
  };
  const cartoes = (
    <div className="bm2-cartoes grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2.75fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-5 bm-animar bm-animar-d2">
      <section className="bm2-cor bm2-lavanda col-span-2 lg:col-span-1" aria-labelledby="bm2-alerta-t">
        <h2 id="bm2-alerta-t" className="bm2-cor-titulo bm2-t-cor">Requer sua atenção</h2>
        <p className="bm2-barra-esq bm2-cor-texto mt-2.5 max-w-[24rem] !text-[15px] lg:!text-[15px]" role={alerta.tipo === "nada" ? undefined : "status"}>
          {textoAlerta}
        </p>
        {legendaAlerta ? (
          <p className="mt-2 pl-[0.7rem] text-[11px] lg:text-xs">
            <span className="bm2-t-cor">{legendaAlerta.nome}</span>
            <span className="bm2-t-cor"> · </span>
            <span className="bm2-t-alerta">{legendaAlerta.destaque}</span>
          </p>
        ) : null}
        <div className="mt-auto pt-4">
          {pilha.visiveis.length > 0 ? (
            <button
              type="button"
              onClick={onAbrirPacientes}
              className="flex items-center"
              aria-label={`Pacientes envolvidos: ${pilha.visiveis.map((p) => p.nome).join(", ")}${pilha.resto ? ` e mais ${pilha.resto}` : ""}. Abrir pacientes`}
            >
              {pilha.visiveis.map((p, i) => (
                <span key={p.chave} className={`bm2-pilha-item ${i ? "-ml-2 lg:ml-0" : ""}`}>
                  <AvatarIniciais nome={p.nome} tamanho="sm" />
                </span>
              ))}
              {pilha.resto > 0 ? (
                <span aria-hidden className="bm2-pilha-item -ml-2 lg:ml-0 grid h-7 w-7 place-items-center rounded-full bg-[#242424] text-[10px] font-medium text-white">
                  +{pilha.resto}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
        <BotaoSeta rotulo={rotuloAlerta} onClick={acaoAlerta} disabled={alerta.tipo === "na_sala" && !(proxima && salaAberta(proxima.ts, agora))} />
      </section>
      <section className="bm2-cor bm2-azul-suave" aria-labelledby="bm2-msg-t">
        <h2 id="bm2-msg-t" className="bm2-cor-titulo bm2-t-cor">Mensagens</h2>
        <p className="bm2-barra-esq bm2-cor-texto mt-2.5">
          {totalNaoLidas > 0 ? `Não lidas em ${plural(conversasComNaoLidas, "conversa", "conversas")}` : "Nenhuma mensagem nova"}
        </p>
        <span className="bm2-numero-grande mt-auto pt-3" aria-label={`${totalNaoLidas} mensagens não lidas`}>
          {totalNaoLidas}
        </span>
        <BotaoSeta rotulo="Abrir mensagens" onClick={onAbrirMensagens} />
      </section>
      <section className="bm2-cor bm2-pessego" aria-labelledby="bm2-ren-t">
        <h2 id="bm2-ren-t" className="bm2-cor-titulo bm2-t-cor">Renovações de receita</h2>
        <p className="bm2-barra-esq bm2-cor-texto mt-2.5">Aguardam sua resposta</p>
        <span
          className="bm2-numero-grande mt-auto pt-3"
          aria-label={renovacoesPendentes === null ? "Carregando renovações" : `${renovacoesPendentes} renovações aguardando`}
        >
          {renovacoesPendentes ?? "—"}
        </span>
        <BotaoSeta rotulo="Abrir renovações de receita" onClick={onAbrirRenovacoes} />
      </section>
    </div>
  );

  /* ------------------------- Meus pacientes -------------------------- */
  const fmtQuando = (ts: number | null) => {
    if (ts === null) return <span className="bm2-t-2">—</span>;
    const { data, hora } = dataHoraClinica(ts, true);
    return (
      <span className="tabular-nums">
        {data} <span className="bm2-t-2">às</span> {hora}
      </span>
    );
  };
  const tabela = (
    <section className="bm2-cartao min-w-0 px-4 pb-3 pt-4 lg:px-5 lg:pt-5 bm-animar bm-animar-d3" aria-labelledby="bm2-pac-t">
      <div className="mb-2 flex flex-wrap items-center gap-2 lg:mb-[1.15rem]">
        <h2 id="bm2-pac-t" className="mr-auto text-[14px] lg:text-[15px]">
          Meus pacientes <span className="bm2-t-2">· {listaPacientes.length}</span>
        </h2>
        <label className="bm2-busca relative order-last flex w-full items-center sm:order-none sm:w-auto">
          <span className="sr-only">Buscar na lista de pacientes</span>
          <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 bm2-t-2" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="h-9 w-full rounded-full bg-transparent pl-8 pr-3 text-xs outline-none sm:w-44"
          />
        </label>
        <button
          type="button"
          onClick={() => setSoComProxima((v) => !v)}
          aria-pressed={soComProxima}
          aria-label="Mostrar só pacientes com consulta marcada"
          title="Só com consulta marcada"
          className={`bm2-botao-contorno grid h-9 w-9 place-items-center rounded-full ${soComProxima ? "bm2-filtro-ativo" : ""}`}
        >
          <ListFilter className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={onAbrirPacientes} aria-label="Ver todos os pacientes" title="Ver todos" className="bm2-mais grid h-9 w-9 place-items-center rounded-full">
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {linhas.length === 0 ? (
        <p className="py-6 text-center text-sm bm2-t-2">
          {listaPacientes.length === 0 ? "Seus pacientes aparecem aqui depois do primeiro agendamento." : "Nenhum paciente encontrado."}
        </p>
      ) : (
        <>
          <table className="bm2-tabela hidden w-full table-fixed text-left md:table">
            <thead>
              <tr className="text-[11px] bm2-t-2">
                <th scope="col" className="w-[18%] px-3 pb-1.5 font-normal">Nome</th>
                <th scope="col" className="w-[15%] px-3 pb-1.5 font-normal">Motivo</th>
                <th scope="col" className="w-[18%] px-3 pb-1.5 font-normal">Situação</th>
                <th scope="col" className="w-[17%] px-3 pb-1.5 font-normal">Última consulta</th>
                <th scope="col" className="w-[17%] px-3 pb-1.5 font-normal">Próxima consulta</th>
                <th scope="col" className="w-[15%] px-3 pb-1.5 font-normal">Tipo</th>
              </tr>
            </thead>
            <tbody className="text-xs xl:text-[13px]">
              {linhas.map((l, i) => {
                const Icone = ICONE_TOM[l.tom];
                return (
                  <tr key={l.chave} className={`bm2-tr ${i === 0 ? "bm2-tr-destaque" : ""}`}>
                    <td className="truncate rounded-l-[0.6rem] px-3 py-[0.7rem]">
                      <button type="button" onClick={() => onAbrirPaciente(l.paciente)} className="max-w-full truncate text-left hover:underline">
                        {l.nome}
                      </button>
                    </td>
                    <td className="truncate px-3" title={l.motivo}>{l.motivo}</td>
                    <td className={`truncate px-3 ${COR_TOM[l.tom]}`} title={l.situacao}>
                      {l.situacao}
                      {Icone ? <Icone className="ml-1 inline h-3.5 w-3.5 align-[-3px]" aria-hidden /> : null}
                    </td>
                    <td className="truncate px-3">{fmtQuando(l.ultima)}</td>
                    <td className="truncate px-3">{fmtQuando(l.proxima)}</td>
                    <td className="rounded-r-[0.6rem] px-3">
                      <span className="flex items-center justify-between gap-1">
                        <span className="truncate">{l.tipo}</span>
                        <button type="button" onClick={() => onAbrirPaciente(l.paciente)} aria-label={`Abrir ${l.nome}`} className="bm2-kebab grid h-7 w-7 shrink-0 place-items-center rounded-full">
                          <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="space-y-2 md:hidden">
            {linhas.map((l) => (
              <li key={l.chave}>
                <button type="button" onClick={() => onAbrirPaciente(l.paciente)} className="bm2-item flex w-full items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-left">
                  <AvatarIniciais nome={l.nome} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{l.nome}</span>
                    <span className="block truncate text-[11px] bm2-t-2">
                      {l.proxima !== null
                        ? `Próxima: ${dataHoraClinica(l.proxima).data} às ${dataHoraClinica(l.proxima).hora}`
                        : l.ultima !== null
                          ? `Última: ${dataHoraClinica(l.ultima).data}`
                          : l.tipo}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[11px] ${COR_TOM[l.tom]}`}>{l.situacao}</span>
                </button>
              </li>
            ))}
          </ul>
          {pacientesFiltrados.length > LIMITE_TABELA ? (
            <button type="button" onClick={onAbrirPacientes} className="mt-2 px-3 text-xs bm2-t-azul underline underline-offset-2">
              Ver todos os {pacientesFiltrados.length} pacientes
            </button>
          ) : null}
        </>
      )}
    </section>
  );

  return (
    <section className="bm-tela bm-tela-1 bm-v2 relative flex flex-col bp-safe-top pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8" aria-labelledby="bm-t1-titulo">
      <div className="bm2-conteudo mx-auto w-full">
        {topo}

        <AvisoAtivarToque role={sessao.role} usuarioId={sessao.id} className="relative mt-4" />

        <div className="bm2-cabecalho flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between bm-animar bm-animar-d1">
          <h1 id="bm-t1-titulo" className="bm2-saudacao">
            <span className="bm2-saudacao-1">{saudacao(agora)},</span>
            <span className="bm2-saudacao-2">
              {tratamento ? `${tratamento} ` : ""}
              {primeiroNome(nomeExibicao)}
            </span>
          </h1>
          <div className="flex items-end gap-4">
            <dl className="bm2-numeros grid flex-1 grid-cols-3 lg:flex lg:flex-none lg:items-end">
              {numeros.map((n) => (
                <div key={n.rotulo} className="bm2-numero" title={n.titulo}>
                  <dt className="bm2-numero-rotulo">
                    {n.rotuloLargo ? (
                      <>
                        <span className="lg:hidden">{n.rotulo}</span>
                        <span className="hidden lg:inline">{n.rotuloLargo}</span>
                      </>
                    ) : (
                      n.rotulo
                    )}
                  </dt>
                  <dd className="bm2-numero-valor tabular-nums">
                    {n.valor}
                    {n.sufixo ? <span className="bm2-numero-sufixo">{n.sufixo}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="hidden gap-2 pb-0.5 lg:flex">
              <button type="button" onClick={onAbrirGestao} aria-label="Ver gestão e receita" title="Gestão e receita" className="bm2-botao-quadrado grid h-9 w-9 place-items-center rounded-[0.6rem]">
                <BarChart3 className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={onAbrirAgenda} aria-label="Abrir agenda e horários" title="Agenda e horários" className="bm2-mais grid h-9 w-9 place-items-center rounded-[0.6rem]">
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="bm2-grade">
          <div className="bm2-area-hoje">{colunaHoje}</div>
          <div className="bm2-area-cartoes">{cartoes}</div>
          <div className="bm2-area-tabela min-w-0">{tabela}</div>
        </div>
      </div>

      {evolucaoAberta && evolucaoPendente ? (
        <PainelEvolucao
          consultaId={evolucaoPendente.consultaId}
          aberto
          onAbrir={() => setEvolucaoAberta(true)}
          onFechar={() => setEvolucaoAberta(false)}
          onConcluida={() => {
            setEvolucaoPendente(null);
            setEvolucaoAberta(false);
          }}
        />
      ) : null}
    </section>
  );
}

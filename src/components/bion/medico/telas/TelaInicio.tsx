"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronDown,
  Info,
  ListFilter,
  MessageCircle,
  MoreVertical,
  Plus,
  Search,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PainelEvolucao } from "../evolucao/PainelEvolucao";
import { AvisoAtivarToque } from "@/components/bion/AvisoAtivarToque";
import { ContagemRegressiva } from "../ContagemRegressiva";
import { iniciais, reservaVigente, salaAberta, saudacao, textoReservaPendente, type PacienteDoMedico } from "../metricas";
import { normalizarTipoAtendimento, ROTULO_TIPO } from "@/lib/atendimento-tipo";
import {
  alertaPrioritario,
  consultasProximosDias,
  dataHoraClinica,
  filtrarPacientes,
  linhaPaciente,
  mediaAvaliacoes,
  plural,
  type TomSituacao,
} from "../inicio/inicio-dados";
import type { DadosMedico } from "../useDadosMedico";

const primeiroNome = (nome: string) => nome.split(" ").filter(Boolean)[0] ?? "";
const LIMITE_TABELA = 8;

/** Classe de cor de texto (AA) para cada tom de situação. */
const COR_TOM: Record<TomSituacao, string> = {
  azul: "bm2-t-azul",
  laranja: "bm2-t-laranja",
  vermelho: "bm2-t-vermelho",
  verde: "bm2-t-verde",
  neutro: "bm2-t-2",
};

/** Avatar de iniciais (o app não guarda foto de paciente). */
function AvatarIniciais({ nome, tamanho = "md" }: { nome: string; tamanho?: "sm" | "md" | "lg" }) {
  const t = tamanho === "lg" ? "h-12 w-12 text-sm" : tamanho === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <span aria-hidden className={`bm2-avatar ${t} grid shrink-0 place-items-center rounded-full font-semibold`}>
      {iniciais(nome)}
    </span>
  );
}

/** Botão preto redondo com seta (cartões coloridos do modelo). */
function BotaoSeta({ rotulo, onClick, disabled = false }: { rotulo: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={rotulo}
      title={rotulo}
      className="bm2-seta grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:opacity-40"
    >
      <ArrowUpRight className="h-4 w-4" aria-hidden />
    </button>
  );
}

/**
 * Tela 1 — Início do médico no visual do modelo de referência (etapa 2 do
 * redesign azul): saudação + números do topo, coluna "Hoje" com a próxima
 * consulta em destaque, três cartões coloridos de pendências e a tabela
 * "Meus pacientes". Só dados que o app já tem (ver inicio-dados.ts).
 */
export function TelaInicio({
  dados,
  onAbrirPerfil,
  onAbrirPacientes,
  onAbrirPaciente,
  onAbrirAgenda,
  onAbrirGestao,
  onAbrirRenovacoes,
  onAbrirNotificacoes,
}: {
  dados: DadosMedico;
  onAbrirPerfil: () => void;
  onAbrirPacientes: () => void;
  /** Abre a conversa/prontuário de um paciente (linha da tabela). */
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
    notificacoesNaoLidas,
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
  const aberta = proxima ? salaAberta(proxima.ts, agora) : false;
  const reservaProxima = proxima ? reservaVigente(proxima, agora) : null;
  const semana = useMemo(() => consultasProximosDias(minhas, agora, 7), [minhas, agora]);
  const notas = useMemo(() => mediaAvaliacoes(avaliacoes), [avaliacoes]);
  const outrasHoje = hoje.agendadas.filter((c) => c.id !== proxima?.id);
  const pacientesFiltrados = useMemo(() => filtrarPacientes(listaPacientes, busca, soComProxima), [listaPacientes, busca, soComProxima]);
  const linhas = pacientesFiltrados.slice(0, LIMITE_TABELA).map((p) => linhaPaciente(p, agora));
  const pacientesNaoLidas = listaPacientes.filter((p) => p.pacienteId && naoLidasPorPaciente.has(p.pacienteId));
  const alerta = alertaPrioritario({
    evolucaoPaciente: evolucaoPendente?.paciente ?? null,
    pacienteNaSala: pacienteNaSala && proxima ? proxima.paciente : null,
    reservaTexto: reservaProxima ? textoReservaPendente(reservaProxima) : null,
    acoes: acoesPaciente,
  });
  const entrarNaSala = () => proxima && router.push(`/consulta?consulta=${encodeURIComponent(proxima.id)}`);
  const pacienteDe = (nome: string, id?: string) =>
    listaPacientes.find((p) => (id ? p.pacienteId === id : p.nome === nome));

  const numeros: { valor: string; rotulo: string; sufixo?: string; titulo: string }[] = [
    { valor: String(hoje.agendadas.length), rotulo: "Consultas hoje", titulo: "Consultas marcadas para hoje (sem as canceladas)" },
    { valor: String(semana), rotulo: "Próximos 7 dias", titulo: "Consultas confirmadas ou aguardando pagamento nos próximos 7 dias" },
    {
      valor: notas ? notas.media.toLocaleString("pt-BR", { minimumFractionDigits: 1 }) : "—",
      sufixo: notas ? "/5" : undefined,
      rotulo: "Avaliação",
      titulo: notas
        ? `Média de ${plural(notas.total, "avaliação", "avaliações")} que os pacientes deixaram depois das consultas`
        : "Ainda sem avaliações dos pacientes",
    },
  ];

  /* ------------------------------ topo ------------------------------ */
  const topo = (
    <header className="bm2-topo flex items-center gap-3 bm-animar">
      {/* Celular: avatar + nome à esquerda, como no modelo (03) */}
      <button type="button" onClick={onAbrirPerfil} className="flex min-w-0 flex-1 items-center gap-3 text-left lg:hidden" aria-label="Abrir meu perfil">
        {medico?.foto ? (
          <img src={medico.foto} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <AvatarIniciais nome={sessao.nome} tamanho="lg" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{sessao.nome}</span>
          <span className="block truncate text-xs bm2-t-2">{medico?.especialidade ?? "Médico(a)"}</span>
        </span>
      </button>
      {/* Tela larga: busca de pacientes (filtra a tabela abaixo) */}
      <label className="relative hidden min-w-0 flex-1 items-center lg:flex">
        <span className="sr-only">Buscar paciente</span>
        <Search className="pointer-events-none absolute left-0 h-4 w-4 bm2-t-2" aria-hidden />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar paciente…"
          className="bm2-busca-topo w-full max-w-md bg-transparent py-2 pl-7 text-sm outline-none"
        />
      </label>
      <button
        type="button"
        onClick={onAbrirNotificacoes}
        aria-label={
          notificacoesNaoLidas > 0
            ? `Notificações: ${notificacoesNaoLidas} não lida${notificacoesNaoLidas > 1 ? "s" : ""}. Abrir notificações`
            : "Notificações. Abrir notificações"
        }
        className="bm2-icone-redondo relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
      >
        <Bell className="h-[1.15rem] w-[1.15rem]" aria-hidden />
        {notificacoesNaoLidas > 0 ? (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C42B2B] px-1 text-[11px] font-semibold text-white">
            {notificacoesNaoLidas}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onAbrirPacientes}
        aria-label={totalNaoLidas > 0 ? `Mensagens: ${totalNaoLidas} não lidas. Abrir pacientes` : "Mensagens. Abrir pacientes"}
        className="bm2-icone-redondo relative grid h-11 w-11 shrink-0 place-items-center rounded-full lg:hidden"
      >
        <MessageCircle className="h-[1.15rem] w-[1.15rem]" aria-hidden />
      </button>
      <span aria-hidden className="hidden h-8 w-px bg-[var(--bm2-borda)] lg:block" />
      <button type="button" onClick={onAbrirPerfil} aria-label="Abrir meu perfil" className="hidden items-center gap-3 rounded-full py-1 pl-1 pr-2 text-left lg:flex">
        {medico?.foto ? (
          <img src={medico.foto} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <AvatarIniciais nome={sessao.nome} tamanho="lg" />
        )}
        <span className="min-w-0">
          <span className="block max-w-[14rem] truncate text-sm font-medium">{sessao.nome}</span>
          <span className="block max-w-[14rem] truncate text-xs bm2-t-2">{medico?.especialidade ?? "Médico(a)"}</span>
        </span>
        <ChevronDown className="ml-3 h-4 w-4 bm2-t-2" aria-hidden />
      </button>
    </header>
  );

  /* -------------------- próxima consulta (destaque) ------------------- */
  const destaque = proxima ? (
    <div className="bm2-destaque rounded-[1.25rem] p-4">
      <div className="flex items-center gap-3">
        <AvatarIniciais nome={proxima.paciente} tamanho="lg" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{proxima.paciente}</div>
          <div className="bm2-destaque-tipo text-xs font-medium">{ROTULO_TIPO[normalizarTipoAtendimento(proxima.tipoAtendimento)]}</div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <dt className="text-[11px] bm2-destaque-rotulo">Motivo</dt>
          <dd className="bm2-destaque-motivo mt-0.5 truncate text-sm font-medium" title={proxima.motivoConsulta || undefined}>
            {proxima.motivoConsulta || "Não informado"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] bm2-destaque-rotulo">Horário</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums">
            {proxima.data === "Hoje" ? proxima.hora : `${proxima.data} · ${proxima.hora}`}
          </dd>
          {aberta ? (
            <dd className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[#1e7a34]" />
              Sala aberta
            </dd>
          ) : null}
        </div>
      </dl>
      {reservaProxima ? <p className="bm2-aviso mt-3 rounded-xl px-3 py-2 text-xs font-medium">{textoReservaPendente(reservaProxima)}</p> : null}
      {pacienteNaSala ? (
        <p role="status" className="bm2-aviso-verde mt-3 inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
          </span>
          Seu paciente já está na sala de espera.
        </p>
      ) : null}
      {!aberta ? (
        <div className="bm2-contagem mt-3 rounded-xl px-3 py-2">
          <ContagemRegressiva alvo={proxima.ts} />
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!aberta}
          onClick={entrarNaSala}
          className="bm2-botao-azul inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          <Video className="h-4 w-4" aria-hidden /> {aberta ? "Entrar na sala" : "A sala abre 30 min antes"}
        </button>
        {(() => {
          const p = pacienteDe(proxima.paciente, proxima.pacienteId);
          return p ? (
            <button
              type="button"
              onClick={() => onAbrirPaciente(p)}
              aria-label={`Conversa e prontuário de ${proxima.paciente}`}
              title="Conversa e prontuário"
              className="bm2-botao-contorno grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
            </button>
          ) : null;
        })()}
      </div>
    </div>
  ) : (
    <div className="bm2-destaque rounded-[1.25rem] p-4" aria-label="Nenhuma consulta futura na agenda">
      <div className="text-[15px] font-medium">Nenhuma consulta na agenda</div>
      <p className="mt-1 text-xs bm2-destaque-rotulo">Quando um paciente agendar, a consulta aparece aqui.</p>
      <button type="button" onClick={onAbrirAgenda} className="bm2-botao-azul mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-medium">
        Ver agenda e horários
      </button>
    </div>
  );

  /* --------------------------- coluna Hoje --------------------------- */
  const colunaHoje = (
    <section className="bm2-cartao flex flex-col p-4 bm-animar bm-animar-d1" aria-labelledby="bm2-hoje-titulo">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs bm2-t-2 first-letter:uppercase">{dataHoje}</p>
          <h2 id="bm2-hoje-titulo" className="text-[15px] font-medium">
            {plural(hoje.agendadas.length, "consulta", "consultas")}
          </h2>
        </div>
        <button type="button" onClick={onAbrirAgenda} aria-label="Abrir agenda e horários" title="Agenda e horários" className="bm2-mais grid h-9 w-9 place-items-center rounded-full">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {destaque}
      {outrasHoje.length > 0 ? (
        <ul className="mt-3 space-y-2 bm-lista-animar" aria-label="Outras consultas de hoje">
          {outrasHoje.map((c) => {
            const p = pacienteDe(c.paciente, c.pacienteId);
            const passou = c.ts <= agora;
            const conteudo = (
              <>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.paciente}</span>
                  <span className={`block text-[11px] font-medium ${normalizarTipoAtendimento(c.tipoAtendimento) === "padrao" ? "bm2-t-azul" : "bm2-t-roxo"}`}>
                    {ROTULO_TIPO[normalizarTipoAtendimento(c.tipoAtendimento)]}
                  </span>
                </span>
                <span className="ml-2 min-w-0 shrink text-right">
                  <span className="block max-w-[9rem] truncate text-xs font-medium bm2-t-laranja">{c.motivoConsulta || "—"}</span>
                  <span className={`block text-[11px] tabular-nums ${passou ? "bm2-t-2" : ""}`}>{c.hora}</span>
                </span>
              </>
            );
            return (
              <li key={c.id}>
                {p ? (
                  <button type="button" onClick={() => onAbrirPaciente(p)} className="bm2-linha flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left">
                    {conteudo}
                  </button>
                ) : (
                  <div className="bm2-linha flex items-center justify-between rounded-xl px-3 py-2.5">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {/* Remarcadas/canceladas pelo PACIENTE hoje (GET /api/medico/eventos) */}
      <div className="mt-auto pt-3 text-[11px] bm2-t-2" aria-busy={acoesPacienteEstado.carregando}>
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
      ? `Evolução em rascunho de ${alerta.paciente}. Novos atendimentos ficam segurados até você concluir.`
      : alerta.tipo === "na_sala"
        ? `${alerta.paciente} já está na sala de espera.`
        : alerta.tipo === "reserva"
          ? alerta.texto
          : alerta.tipo === "acoes"
            ? `Hoje os pacientes remarcaram ${plural(alerta.remarcadas, "consulta", "consultas")} e cancelaram ${alerta.canceladas}.`
            : "Nada precisa da sua atenção agora.";
  const rotuloAlerta =
    alerta.tipo === "evolucao" ? "Concluir evolução" : alerta.tipo === "na_sala" ? "Entrar na sala" : alerta.tipo === "nada" ? "Abrir notificações" : "Abrir agenda";
  const acaoAlerta = () => {
    if (alerta.tipo === "evolucao") setEvolucaoAberta(true);
    else if (alerta.tipo === "na_sala") entrarNaSala();
    else if (alerta.tipo === "nada") onAbrirNotificacoes();
    else onAbrirAgenda();
  };
  const cartoes = (
    <div className="bm2-cartoes grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)_minmax(0,1fr)] bm-animar bm-animar-d2">
      <section className="bm2-cor bm2-lavanda col-span-2 flex min-h-[9.5rem] flex-col rounded-[1.5rem] p-4 lg:col-span-1 lg:min-h-[11rem]" aria-labelledby="bm2-alerta-t">
        <h2 id="bm2-alerta-t" className="text-[11px] bm2-t-cor">Requer sua atenção</h2>
        <p className="bm2-barra-esq mt-2 max-w-[30rem] text-[15px] leading-snug" role={alerta.tipo === "nada" ? undefined : "status"}>
          {textoAlerta}
        </p>
        {alerta.tipo === "evolucao" ? <p className="mt-1 pl-3 text-[11px] bm2-t-cor">Evolução pendente</p> : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          {pacientesNaoLidas.length > 0 ? (
            <button type="button" onClick={onAbrirPacientes} className="flex items-center" aria-label={`Mensagens não lidas de ${plural(pacientesNaoLidas.length, "paciente", "pacientes")}. Abrir pacientes`}>
              {pacientesNaoLidas.slice(0, 3).map((p, i) => (
                <span key={p.chave} className={i ? "-ml-2" : ""}>
                  <span className="block rounded-full ring-2 ring-[var(--bm2-lavanda)]">
                    <AvatarIniciais nome={p.nome} tamanho="sm" />
                  </span>
                </span>
              ))}
              {pacientesNaoLidas.length > 3 ? (
                <span className="-ml-2 grid h-7 min-w-7 place-items-center rounded-full bg-[var(--bm2-texto)] px-1 text-[10px] font-semibold text-white ring-2 ring-[var(--bm2-lavanda)]">
                  +{pacientesNaoLidas.length - 3}
                </span>
              ) : null}
            </button>
          ) : (
            <span />
          )}
          <BotaoSeta rotulo={rotuloAlerta} onClick={acaoAlerta} disabled={alerta.tipo === "na_sala" && !aberta} />
        </div>
      </section>
      <section className="bm2-cor bm2-azul-suave flex min-h-[9.5rem] flex-col rounded-[1.5rem] p-4 lg:min-h-[11rem]" aria-labelledby="bm2-msg-t">
        <h2 id="bm2-msg-t" className="text-[11px] bm2-t-cor">Mensagens</h2>
        <p className="bm2-barra-esq mt-2 text-[13px] leading-snug lg:text-[15px]">
          {totalNaoLidas > 0 ? `Não lidas em ${plural(conversasComNaoLidas, "conversa", "conversas")}` : "Nenhuma mensagem nova"}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="text-[2rem] leading-none tabular-nums lg:text-[2.25rem]" aria-label={`${totalNaoLidas} mensagens não lidas`}>
            {totalNaoLidas}
          </span>
          <BotaoSeta rotulo="Abrir pacientes e mensagens" onClick={onAbrirPacientes} />
        </div>
      </section>
      <section className="bm2-cor bm2-pessego flex min-h-[9.5rem] flex-col rounded-[1.5rem] p-4 lg:min-h-[11rem]" aria-labelledby="bm2-ren-t">
        <h2 id="bm2-ren-t" className="text-[11px] bm2-t-cor">Renovações de receita</h2>
        <p className="bm2-barra-esq mt-2 text-[13px] leading-snug lg:text-[15px]">Aguardam sua resposta</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="text-[2rem] leading-none tabular-nums lg:text-[2.25rem]" aria-label={renovacoesPendentes === null ? "Carregando renovações" : `${renovacoesPendentes} renovações aguardando`}>
            {renovacoesPendentes ?? "—"}
          </span>
          <BotaoSeta rotulo="Abrir renovações de receita" onClick={onAbrirRenovacoes} />
        </div>
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
    <section className="bm2-cartao min-w-0 p-4 lg:p-5 bm-animar bm-animar-d3" aria-labelledby="bm2-pac-t">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="bm2-pac-t" className="mr-auto text-[15px] font-medium">
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
          {/* Tela larga: tabela como no modelo */}
          <table className="bm2-tabela hidden w-full table-fixed text-left md:table">
            <thead>
              <tr className="text-[11px] bm2-t-2">
                <th scope="col" className="w-[18%] px-3 pb-2 font-normal">Nome</th>
                <th scope="col" className="w-[15%] px-3 pb-2 font-normal">Motivo</th>
                <th scope="col" className="w-[18%] px-3 pb-2 font-normal">Situação</th>
                <th scope="col" className="w-[17%] px-3 pb-2 font-normal">Última consulta</th>
                <th scope="col" className="w-[17%] px-3 pb-2 font-normal">Próxima consulta</th>
                <th scope="col" className="w-[15%] px-3 pb-2 font-normal">Tipo</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {linhas.map((l) => (
                <tr key={l.chave} className="bm2-tr">
                  <td className="truncate px-3 py-2 rounded-l-xl">
                    <button type="button" onClick={() => onAbrirPaciente(l.paciente)} className="max-w-full truncate text-left font-medium hover:underline">
                      {l.nome}
                    </button>
                  </td>
                  <td className="truncate px-3 py-2" title={l.motivo}>{l.motivo}</td>
                  <td className={`truncate px-3 py-2 font-medium ${COR_TOM[l.tom]}`} title={l.situacao}>
                    {l.situacao}
                    {l.tom === "vermelho" ? <Info className="ml-1 inline h-3 w-3 align-[-2px]" aria-hidden /> : null}
                  </td>
                  <td className="truncate px-3 py-2">{fmtQuando(l.ultima)}</td>
                  <td className="truncate px-3 py-2">{fmtQuando(l.proxima)}</td>
                  <td className="px-3 py-2 rounded-r-xl">
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate">{l.tipo}</span>
                      <button type="button" onClick={() => onAbrirPaciente(l.paciente)} aria-label={`Abrir ${l.nome}`} className="bm2-kebab grid h-7 w-7 shrink-0 place-items-center rounded-full">
                        <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Celular: a mesma informação em linhas */}
          <ul className="space-y-2 md:hidden">
            {linhas.map((l) => (
              <li key={l.chave}>
                <button type="button" onClick={() => onAbrirPaciente(l.paciente)} className="bm2-linha flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left">
                  <AvatarIniciais nome={l.nome} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{l.nome}</span>
                    <span className="block truncate text-[11px] bm2-t-2">
                      {l.proxima !== null ? `Próxima: ${dataHoraClinica(l.proxima).data} às ${dataHoraClinica(l.proxima).hora}` : l.ultima !== null ? `Última: ${dataHoraClinica(l.ultima).data}` : l.tipo}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[11px] font-medium ${COR_TOM[l.tom]}`}>{l.situacao}</span>
                </button>
              </li>
            ))}
          </ul>
          {pacientesFiltrados.length > LIMITE_TABELA ? (
            <button type="button" onClick={onAbrirPacientes} className="mt-3 text-xs font-medium bm2-t-azul underline underline-offset-2">
              Ver todos os {pacientesFiltrados.length} pacientes
            </button>
          ) : null}
        </>
      )}
    </section>
  );

  return (
    <section className="bm-tela bm-tela-1 bm-v2 relative flex flex-col bp-safe-top pb-24 lg:pb-10" aria-labelledby="bm-t1-titulo">
      <div className="bm2-conteudo mx-auto w-full">
        {topo}

        {/* Toque da consulta no celular do médico (some sem permissão pendente). */}
        <AvisoAtivarToque role={sessao.role} usuarioId={sessao.id} className="relative mt-4" />

        <div className="mt-5 flex flex-col gap-4 lg:mt-7 lg:flex-row lg:items-end lg:justify-between bm-animar bm-animar-d1">
          <h1 id="bm-t1-titulo" className="text-[1.75rem] font-normal leading-[1.15] tracking-[-0.01em] lg:text-[2.6rem]">
            {saudacao(agora)},
            <br />
            {tratamento ? `${tratamento} ` : ""}
            {primeiroNome(nomeExibicao)}
          </h1>
          <div className="flex items-end gap-3">
            <dl className="bm2-numeros grid flex-1 grid-cols-3 lg:flex lg:flex-none lg:items-end">
              {numeros.map((n) => (
                <div key={n.rotulo} className="bm2-numero px-3 lg:px-6" title={n.titulo}>
                  <dt className="text-[11px] leading-tight bm2-t-2">
                    {n.rotulo}
                    {n.rotulo === "Avaliação" ? <span className="hidden lg:inline"> média</span> : null}
                  </dt>
                  <dd className="mt-1 text-[1.6rem] leading-none tabular-nums lg:text-[1.75rem]">
                    {n.valor}
                    {n.sufixo ? <span className="ml-0.5 text-xs bm2-t-2">{n.sufixo}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="hidden gap-2 lg:flex">
              <button type="button" onClick={onAbrirGestao} aria-label="Ver gestão e receita" title="Gestão e receita" className="bm2-botao-contorno grid h-10 w-10 place-items-center rounded-xl">
                <BarChart3 className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={onAbrirAgenda} aria-label="Abrir agenda e horários" title="Agenda e horários" className="bm2-mais grid h-10 w-10 place-items-center rounded-xl">
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="bm2-grade mt-5 lg:mt-6">
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

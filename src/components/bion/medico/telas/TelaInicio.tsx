"use client";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  Info,
  ListChecks,
  MessageCircle,
  Pill,
  RefreshCw,
  Stethoscope,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AvisoAtivarToque } from "@/components/bion/AvisoAtivarToque";
import { Logo } from "@/components/bion/brand";
import { ContagemRegressiva } from "../ContagemRegressiva";
import { iniciais, reservaVigente, ROTULO_STATUS, salaAberta, saudacao, textoReservaPendente } from "../metricas";
import type { DadosMedico } from "../useDadosMedico";

const primeiroNome = (nome: string) => nome.split(" ").filter(Boolean)[0] ?? "";

/** Tela 1 — saudação imersiva + pendências + hero da próxima consulta +
 *  resumo do dia + atalhos. Mesma linguagem da home do paciente: degradê da
 *  marca com auroras, nome em destaque tipográfico e microinterações. */
export function TelaInicio({
  dados,
  onAbrirPerfil,
  onAbrirPacientes,
  onAbrirAgenda,
  onAbrirRenovacoes,
  onAbrirNotificacoes,
}: {
  dados: DadosMedico;
  onAbrirPerfil: () => void;
  onAbrirPacientes: () => void;
  /** Card "Hoje" → a agenda do dia (folha Agenda, que abre no dia de hoje). */
  onAbrirAgenda: () => void;
  onAbrirRenovacoes: () => void;
  onAbrirNotificacoes: () => void;
}) {
  const router = useRouter();
  const { sessao, medico, proxima, pacienteNaSala, notificacoesNaoLidas, hoje, agora, acoesPaciente, acoesPacienteEstado, naoLidasPorPaciente, renovacoesPendentes } = dados;
  // Pendências acionáveis: só aparecem com contador > 0 (sem ruído).
  const totalNaoLidas = [...naoLidasPorPaciente.values()].reduce((a, b) => a + b, 0);
  const conversasComNaoLidas = naoLidasPorPaciente.size;
  const temRenovacoes = renovacoesPendentes !== null && renovacoesPendentes > 0;
  const temPendencias = temRenovacoes || totalNaoLidas > 0;
  const dataHoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(agora);
  const nomeExibicao = sessao.nome.replace(/^(dr|dra)\.?\s+/i, "");
  const tratamento = /^dra\.?\s/i.test(sessao.nome) ? "Dra." : /^dr\.?\s/i.test(sessao.nome) ? "Dr." : "";
  const aberta = proxima ? salaAberta(proxima.ts, agora) : false;
  const reservaProxima = proxima ? reservaVigente(proxima, agora) : null;

  return (
    <section
      className="bm-tela bm-tela-1 relative flex flex-col px-5 bp-safe-top pb-20 overflow-hidden"
      aria-labelledby="bm-t1-titulo"
    >
      {/* brilhos decorativos da marca (fundo vivo, atrás dos cartões) */}
      <span aria-hidden className="bm-glow bm-glow-a" />
      <span aria-hidden className="bm-glow bm-glow-b" />

      <header className="relative flex items-center justify-between gap-2 pt-2 bm-animar">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo size="sm" />
          <span className="inline-flex min-w-0 items-center truncate rounded-full bp-glass px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-bion-ink/80 dark:text-bion-paper/80 first-letter:uppercase">
            {dataHoje}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Item 12: sino da central de notificações (selo = não lidas). */}
          <button
            type="button"
            onClick={onAbrirNotificacoes}
            aria-label={
              notificacoesNaoLidas > 0
                ? `Notificações: ${notificacoesNaoLidas} não lida${notificacoesNaoLidas > 1 ? "s" : ""}. Abrir notificações`
                : "Notificações. Abrir notificações"
            }
            className="relative w-11 h-11 rounded-full bp-glass shrink-0 inline-flex items-center justify-center"
          >
            <Bell className="w-5 h-5" aria-hidden />
            {notificacoesNaoLidas > 0 ? (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold inline-flex items-center justify-center"
                aria-hidden
              >
                {notificacoesNaoLidas}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={onAbrirPerfil}
            aria-label="Abrir meu perfil"
            className="bm-avatar-botao relative w-12 h-12 rounded-full p-[2.5px] shrink-0"
          >
            {medico?.foto ? (
              <img src={medico.foto} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="w-full h-full inline-flex items-center justify-center rounded-full bg-white text-sm font-black text-bion-sea dark:bg-[#0e0820] dark:text-sky-300">
                {iniciais(sessao.nome)}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Toque da consulta no celular do médico (some sem permissão pendente). */}
      <AvisoAtivarToque role={sessao.role} usuarioId={sessao.id} className="relative mt-4" />

      <div className="relative mt-8 mb-6 bm-animar bm-animar-d1">
        <p className="text-base font-bold text-bion-ink/70 dark:text-bion-paper/70">
          {saudacao(agora)}
          {tratamento ? `, ${tratamento}` : ","}
        </p>
        <h1 id="bm-t1-titulo" className="bm-texto-grad mt-0.5 text-5xl leading-[1.05] font-black tracking-tight sm:text-6xl">
          {primeiroNome(nomeExibicao)}
        </h1>
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-bion-ink/75 dark:text-bion-paper/75">
          <Stethoscope className="h-4 w-4 text-bion-sea dark:text-sky-300" aria-hidden />
          {hoje.restantes.length > 0
            ? `Você ainda tem ${hoje.restantes.length} ${hoje.restantes.length === 1 ? "atendimento" : "atendimentos"} hoje.`
            : hoje.agendadas.length > 0
              ? "Os atendimentos de hoje já passaram."
              : "Nenhum atendimento marcado para hoje."}
        </p>
      </div>

      {/* Pendências: renovações aguardando resposta e mensagens não lidas.
          Cada linha leva à tela certa; contador zero = linha some (e sem
          nenhuma pendência o bloco inteiro some). */}
      {temPendencias ? (
        <div className="relative bp-glass bm-animar bm-animar-d1 p-5 mb-3" role="group" aria-label="Pendências">
          <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
            <ListChecks className="w-4 h-4" aria-hidden /> Pendências
          </span>
          <div className="mt-3 space-y-2">
            {temRenovacoes ? (
              <button
                type="button"
                onClick={onAbrirRenovacoes}
                aria-label={`Renovações de receita: ${renovacoesPendentes} aguardando sua resposta. Abrir renovações`}
                className="w-full flex items-center gap-3 rounded-2xl bg-bion-ink/5 dark:bg-white/5 px-4 py-3 text-left"
              >
                <Pill className="w-5 h-5 shrink-0 text-bion-sea dark:text-sky-300" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">Renovações de receita</span>
                  <span className="block text-xs text-bion-ink/75 dark:text-bion-paper/75">Aguardando sua resposta</span>
                </span>
                <span
                  className="min-w-6 h-6 px-1.5 rounded-full bg-red-600 text-white text-xs font-bold inline-flex items-center justify-center shrink-0"
                  aria-hidden
                >
                  {renovacoesPendentes}
                </span>
              </button>
            ) : null}
            {totalNaoLidas > 0 ? (
              <button
                type="button"
                onClick={onAbrirPacientes}
                aria-label={`Mensagens não lidas: ${totalNaoLidas} em ${conversasComNaoLidas} ${conversasComNaoLidas === 1 ? "conversa" : "conversas"}. Abrir pacientes`}
                className="w-full flex items-center gap-3 rounded-2xl bg-bion-ink/5 dark:bg-white/5 px-4 py-3 text-left"
              >
                <MessageCircle className="w-5 h-5 shrink-0 text-bion-sea dark:text-sky-300" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">Mensagens não lidas</span>
                  <span className="block text-xs text-bion-ink/75 dark:text-bion-paper/75">
                    Em {conversasComNaoLidas} {conversasComNaoLidas === 1 ? "conversa" : "conversas"}
                  </span>
                </span>
                <span
                  className="min-w-6 h-6 px-1.5 rounded-full bg-red-600 text-white text-xs font-bold inline-flex items-center justify-center shrink-0"
                  aria-hidden
                >
                  {totalNaoLidas}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* (a) Próxima consulta — hero imersivo da marca */}
      <div className="relative bm-animar bm-animar-d2">
        {proxima ? (
          <div className="bm-hero bion-surgir relative w-full overflow-hidden rounded-[2rem] p-5 text-white">
            <span aria-hidden className="bm-aurora bm-aurora-a" />
            <span aria-hidden className="bm-aurora bm-aurora-b" />
            <div className="relative">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-white/75">Próxima consulta</span>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    aberta ? "bg-emerald-600 text-white" : "bg-white/15 text-white backdrop-blur"
                  }`}
                >
                  {aberta ? "Sala aberta" : ROTULO_STATUS[proxima.status]}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className={`bm-anel relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur ${aberta ? "bm-anel-ativo" : ""}`}
                >
                  <span className="text-base font-black">{iniciais(proxima.paciente)}</span>
                </span>
                <div className="min-w-0">
                  <div className="text-2xl font-black leading-tight truncate">{proxima.paciente}</div>
                  <div className="mt-0.5 text-sm font-semibold text-white/85 truncate">
                    {proxima.data} · {proxima.hora}
                    {proxima.motivoConsulta ? ` · ${proxima.motivoConsulta}` : ""}
                  </div>
                </div>
              </div>

              {reservaProxima ? (
                <p className="mt-3 text-xs font-semibold rounded-xl px-3 py-2 bg-amber-400/15 text-amber-100">
                  {textoReservaPendente(reservaProxima)}
                </p>
              ) : null}
              {/* Item 22: o paciente já entrou na sala de espera (presença
                  fresca na PresencaSala, vigiada por polling só leitura). */}
              {pacienteNaSala ? (
                <p
                  role="status"
                  className="mt-3 text-xs font-semibold rounded-xl px-3 py-2 bg-emerald-500/15 text-emerald-100 inline-flex items-center gap-2 w-full"
                >
                  <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-400" />
                  </span>
                  Seu paciente já está na sala de espera.
                </p>
              ) : null}

              <div className="bm-hero-barra mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl px-4 py-3">
                <ContagemRegressiva alvo={proxima.ts} />
              </div>

              <button
                type="button"
                disabled={!aberta}
                onClick={() => router.push(`/consulta?consulta=${encodeURIComponent(proxima.id)}`)}
                className={`bion-toque bm-brilho-cta relative mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold ${
                  aberta
                    ? "bg-white text-[#24058D] shadow-md hover:shadow-lg"
                    : "bg-white/10 border border-white/20 text-white/80"
                }`}
              >
                <Video className="w-4 h-4" aria-hidden /> {aberta ? "Entrar na sala" : "A sala abre 30 min antes"}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="bm-hero bion-surgir relative w-full overflow-hidden rounded-[2rem] p-6 text-white"
            aria-label="Nenhuma consulta futura na agenda"
          >
            <span aria-hidden className="bm-aurora bm-aurora-a" />
            <span aria-hidden className="bm-aurora bm-aurora-b" />
            <div className="relative">
              <div className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-white/75">Agenda</div>
              <div className="text-2xl font-black leading-tight">Nenhuma consulta na agenda</div>
              <p className="mt-1.5 text-sm font-semibold text-white/85">
                Quando um paciente agendar, a contagem aparece aqui.
              </p>
              <svg className="bm-ecg mt-5 block h-10 w-full" viewBox="0 0 200 48" fill="none" aria-hidden>
                <path
                  d="M0 24 h16 l3 -3 3 3 5 -15 6 30 5 -15 h10 l4 -3 4 3 h16 l3 -3 3 3 5 -15 6 30 5 -15 h10 l4 -3 4 3 h16 l3 -3 3 3 5 -15 6 30 5 -15 h10 l4 -3 4 3 h28"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* (b) Hoje — abre a AGENDA do dia (antes abria a lista de
          pacientes, embora o card só fale do dia). */}
      <button
        type="button"
        onClick={onAbrirAgenda}
        className="relative bp-glass bion-toque p-5 mt-3 text-left w-full bm-animar bm-animar-d3"
        aria-label={`Hoje: ${hoje.agendadas.length} consultas agendadas, ${hoje.restantes.length} restantes. Abrir agenda de hoje`}
      >
        <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4" /> Hoje
        </span>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <div className="text-4xl font-black tabular-nums">{hoje.agendadas.length}</div>
            <div className="text-sm text-bion-ink/75 dark:text-bion-paper/75">agendadas</div>
          </div>
          <div>
            <div className="text-4xl font-black tabular-nums">{hoje.restantes.length}</div>
            <div className="text-sm text-bion-ink/75 dark:text-bion-paper/75">restantes</div>
          </div>
        </div>
        {hoje.restantes.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {hoje.restantes.slice(0, 3).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{c.paciente}</span>
                <span className="font-bold tabular-nums shrink-0 ml-2">{c.hora}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </button>

      {/* (c) Remarcadas e canceladas PELO PACIENTE hoje (GET /api/medico/eventos) */}
      <div className="relative bp-glass p-5 mt-3 bm-animar bm-animar-d3" aria-busy={acoesPacienteEstado.carregando}>
        {acoesPaciente ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" aria-hidden /> Remarcadas
              </span>
              <div className="text-3xl font-black tabular-nums mt-1">{acoesPaciente.remarcadas}</div>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
                <XCircle className="w-4 h-4" aria-hidden /> Canceladas
              </span>
              <div className="text-3xl font-black tabular-nums mt-1">{acoesPaciente.canceladas}</div>
            </div>
          </div>
        ) : acoesPacienteEstado.erro ? (
          <div role="alert">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Remarcadas e canceladas: {acoesPacienteEstado.erro}
            </p>
            <button
              type="button"
              onClick={acoesPacienteEstado.recarregar}
              className="mt-2 text-sm font-bold text-bion-sea dark:text-sky-300 underline underline-offset-2"
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <div role="status" className="grid grid-cols-2 gap-3">
            <div className="h-14 rounded-xl bg-bion-ink/10 dark:bg-white/10 motion-safe:animate-pulse" aria-hidden />
            <div className="h-14 rounded-xl bg-bion-ink/10 dark:bg-white/10 motion-safe:animate-pulse" aria-hidden />
            <span className="sr-only">Carregando remarcadas e canceladas…</span>
          </div>
        )}
        <p className="mt-3 text-xs text-bion-ink/70 dark:text-bion-paper/70 inline-flex gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          Consultas marcadas para hoje que o paciente remarcou ou cancelou. Cancelamentos feitos por você, novas datas
          escolhidas depois de um cancelamento seu e remarcações ainda não pagas não contam.
        </p>
      </div>

      {/* Atalhos: descoberta das áreas do app (swipe e pílulas continuam iguais) */}
      <div className="relative mt-3 grid grid-cols-2 gap-3 bm-animar bm-animar-d4">
        <button
          type="button"
          onClick={onAbrirPacientes}
          className="bion-toque bp-glass relative flex items-center gap-3 p-4 text-left"
        >
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bion-sea/10 text-bion-sea dark:bg-sky-300/10 dark:text-sky-300">
            <Users className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black">Pacientes</span>
            <span className="block text-xs font-semibold opacity-70">conversas e prontuários</span>
          </span>
          {totalNaoLidas > 0 ? (
            <span className="absolute top-2.5 right-2.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold inline-flex items-center justify-center" aria-hidden>
              {totalNaoLidas}
            </span>
          ) : null}
        </button>
        <button type="button" onClick={onAbrirAgenda} className="bion-toque bp-glass flex items-center gap-3 p-4 text-left">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bion-sea/10 text-bion-sea dark:bg-sky-300/10 dark:text-sky-300">
            <CalendarDays className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black">Agenda</span>
            <span className="block text-xs font-semibold opacity-70">hoje e horários</span>
          </span>
        </button>
        <button type="button" onClick={onAbrirRenovacoes} className="bion-toque bp-glass relative flex items-center gap-3 p-4 text-left">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bion-sea/10 text-bion-sea dark:bg-sky-300/10 dark:text-sky-300">
            <Pill className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black">Renovações</span>
            <span className="block text-xs font-semibold opacity-70">pedidos de receita</span>
          </span>
          {temRenovacoes ? (
            <span className="absolute top-2.5 right-2.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold inline-flex items-center justify-center" aria-hidden>
              {renovacoesPendentes}
            </span>
          ) : null}
        </button>
        <button type="button" onClick={onAbrirNotificacoes} className="bion-toque bp-glass relative flex items-center gap-3 p-4 text-left">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bion-sea/10 text-bion-sea dark:bg-sky-300/10 dark:text-sky-300">
            <Bell className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black">Notificações</span>
            <span className="block text-xs font-semibold opacity-70">novidades do dia</span>
          </span>
          {notificacoesNaoLidas > 0 ? (
            <span className="absolute top-2.5 right-2.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold inline-flex items-center justify-center" aria-hidden>
              {notificacoesNaoLidas}
            </span>
          ) : null}
        </button>
      </div>

      <div className="relative mt-auto pt-8 flex flex-col items-center gap-1 text-white/90" aria-hidden>
        <span className="text-xs font-semibold">Receita e agenda abaixo</span>
        <ChevronDown className="w-5 h-5 motion-safe:animate-bounce" />
      </div>
    </section>
  );
}

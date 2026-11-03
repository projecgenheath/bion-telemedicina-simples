"use client";

import { Bell, CalendarClock, CalendarDays, ChevronDown, Info, ListChecks, MessageCircle, Pill, RefreshCw, Video, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { AvisoAtivarToque } from "@/components/bion/AvisoAtivarToque";
import { ContagemRegressiva } from "../ContagemRegressiva";
import { iniciais, reservaVigente, ROTULO_STATUS, salaAberta, saudacao, textoReservaPendente } from "../metricas";
import type { DadosMedico } from "../useDadosMedico";

const primeiroNome = (nome: string) => nome.split(" ").filter(Boolean)[0] ?? "";

/** Tela 1 — saudação + pendências (quando há) + 3 cards (próxima consulta, hoje, remarcadas/canceladas). */
export function TelaInicio({
  dados,
  onAbrirPerfil,
  onAbrirPacientes,
  onAbrirRenovacoes,
  onAbrirNotificacoes,
}: {
  dados: DadosMedico;
  onAbrirPerfil: () => void;
  onAbrirPacientes: () => void;
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
    <section className="bm-tela bm-tela-1 flex flex-col px-5 bp-safe-top pb-20" aria-labelledby="bm-t1-titulo">
      <header className="flex items-center justify-between pt-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-bion-ink/70 dark:text-bion-paper/70 first-letter:uppercase">
          {dataHoje}
        </div>
        <div className="flex items-center gap-2">
          {/* Item 12: sino da central de notificações (selo = não lidas). */}
          <button
            type="button"
            onClick={onAbrirNotificacoes}
            aria-label={
              notificacoesNaoLidas > 0
                ? `Notificações: ${notificacoesNaoLidas} não lida${notificacoesNaoLidas > 1 ? "s" : ""}. Abrir notificações`
                : "Notificações. Abrir notificações"
            }
            className="relative w-12 h-12 rounded-full bp-glass shrink-0 inline-flex items-center justify-center"
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
            className="w-12 h-12 rounded-full overflow-hidden bp-glass shrink-0"
          >
            {medico?.foto ? (
              <img src={medico.foto} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full inline-flex items-center justify-center text-sm font-black">{iniciais(sessao.nome)}</span>
            )}
          </button>
        </div>
      </header>

      {/* Toque da consulta no celular do médico (some sem permissão pendente). */}
      <AvisoAtivarToque role={sessao.role} usuarioId={sessao.id} className="mt-4" />

      <div className="mt-6 mb-5">
        <h1 id="bm-t1-titulo" className="text-3xl font-black leading-tight">
          {saudacao(agora)}, {tratamento ? `${tratamento} ` : ""}
          {primeiroNome(nomeExibicao)}
        </h1>
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75 mt-1">
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
        <div className="bp-glass p-5 mb-3" role="group" aria-label="Pendências">
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

      {/* (a) Próxima consulta */}
      <div className="bp-glass p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4" /> Próxima consulta
          </span>
          {proxima ? (
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                aberta ? "bg-emerald-700 text-white" : "bg-bion-ink/8 dark:bg-white/10"
              }`}
            >
              {aberta ? "Sala aberta" : ROTULO_STATUS[proxima.status]}
            </span>
          ) : null}
        </div>
        {proxima ? (
          <>
            <ContagemRegressiva alvo={proxima.ts} />
            <div className="mt-4 text-base font-bold truncate">{proxima.paciente}</div>
            <div className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
              {proxima.data} · {proxima.hora}
              {proxima.motivoConsulta ? ` · ${proxima.motivoConsulta}` : ""}
            </div>
            {reservaProxima ? (
              <p className="mt-2 text-xs font-semibold rounded-xl px-3 py-2 bg-amber-500/15 text-amber-900 dark:text-amber-100">
                {textoReservaPendente(reservaProxima)}
              </p>
            ) : null}
            {/* Item 22: o paciente já entrou na sala de espera (presença
                fresca na PresencaSala, vigiada por polling só leitura). */}
            {pacienteNaSala ? (
              <p
                role="status"
                className="mt-2 text-xs font-semibold rounded-xl px-3 py-2 bg-emerald-600/15 text-emerald-900 dark:text-emerald-100 inline-flex items-center gap-2 w-full"
              >
                <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-600" />
                </span>
                Seu paciente já está na sala de espera.
              </p>
            ) : null}
            <button
              type="button"
              disabled={!aberta}
              onClick={() => router.push(`/consulta?consulta=${encodeURIComponent(proxima.id)}`)}
              className="bp-acao mt-4 w-full py-3 text-sm inline-flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4" /> {aberta ? "Entrar na sala" : "A sala abre 30 min antes"}
            </button>
          </>
        ) : (
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
            Nenhuma consulta futura na sua agenda. Quando um paciente agendar, a contagem aparece aqui.
          </p>
        )}
      </div>

      {/* (b) Hoje */}
      <button
        type="button"
        onClick={onAbrirPacientes}
        className="bp-glass p-5 mt-3 text-left w-full"
        aria-label={`Hoje: ${hoje.agendadas.length} consultas agendadas, ${hoje.restantes.length} restantes. Abrir lista de pacientes`}
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
      <div className="bp-glass p-5 mt-3" aria-busy={acoesPacienteEstado.carregando}>
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

      <div className="mt-auto pt-8 flex flex-col items-center gap-1 text-white/90" aria-hidden>
        <span className="text-xs font-semibold">Receita e agenda abaixo</span>
        <ChevronDown className="w-5 h-5 motion-safe:animate-bounce" />
      </div>
    </section>
  );
}

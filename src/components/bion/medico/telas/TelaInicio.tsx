"use client";

import { CalendarClock, CalendarDays, ChevronDown, Info, RefreshCw, Video, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { partesFusoClinica } from "@/lib/bion-tipos";
import { ContagemRegressiva } from "../ContagemRegressiva";
import { iniciais, ROTULO_STATUS, salaAberta, saudacao } from "../metricas";
import type { DadosMedico } from "../useDadosMedico";

const primeiroNome = (nome: string) => nome.split(" ").filter(Boolean)[0] ?? "";

/** Tela 1 — saudação + 3 cards (próxima consulta, hoje, remarcadas/canceladas). */
export function TelaInicio({
  dados,
  onAbrirPerfil,
  onAbrirPacientes,
}: {
  dados: DadosMedico;
  onAbrirPerfil: () => void;
  onAbrirPacientes: () => void;
}) {
  const router = useRouter();
  const { sessao, medico, proxima, hoje, agora } = dados;
  const dataHoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(agora);
  const nomeExibicao = sessao.nome.replace(/^(dr|dra)\.?\s+/i, "");
  const tratamento = /^dra\.?\s/i.test(sessao.nome) ? "Dra." : /^dr\.?\s/i.test(sessao.nome) ? "Dr." : "";
  const aberta = proxima ? salaAberta(proxima.ts, agora) : false;
  const p = proxima ? partesFusoClinica(proxima.ts) : null;

  return (
    <section className="bm-tela bm-tela-1 flex flex-col px-5 bp-safe-top pb-24" aria-labelledby="bm-t1-titulo">
      <header className="flex items-center justify-between pt-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-bion-ink/70 dark:text-bion-paper/70 first-letter:uppercase">
          {dataHoje}
        </div>
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
      </header>

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
        {proxima && p ? (
          <>
            <ContagemRegressiva alvo={proxima.ts} />
            <div className="mt-4 text-base font-bold truncate">{proxima.paciente}</div>
            <div className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
              {proxima.data} · {proxima.hora}
              {proxima.motivoConsulta ? ` · ${proxima.motivoConsulta}` : ""}
            </div>
            <button
              type="button"
              disabled={!aberta}
              onClick={() => router.push("/consulta")}
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

      {/* (c) Remarcadas e canceladas */}
      <div className="bp-glass p-5 mt-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Remarcadas
            </span>
            <div className="text-3xl font-black tabular-nums mt-1">{hoje.remarcadas.length}</div>
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
              <XCircle className="w-4 h-4" /> Canceladas
            </span>
            <div className="text-3xl font-black tabular-nums mt-1">{hoje.canceladas.length}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-bion-ink/70 dark:text-bion-paper/70 inline-flex gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          Contam as consultas com data de hoje. Uma consulta de hoje remarcada para outro dia ainda não aparece aqui.
        </p>
      </div>

      <div className="mt-auto pt-8 flex flex-col items-center gap-1 text-bion-ink/70 dark:text-bion-paper/70" aria-hidden>
        <span className="text-xs font-semibold">Faturamento e agenda abaixo</span>
        <ChevronDown className="w-5 h-5 motion-safe:animate-bounce" />
      </div>
    </section>
  );
}

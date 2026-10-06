"use client";

import { useEffect, useMemo } from "react";
import { Activity, AlertTriangle, Bot, Gauge, Minus, Timer, TrendingDown, TrendingUp } from "lucide-react";
import { TelaModulo } from "../ui/TelaModulo";
import { CardAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoErro, EstadoVazio, Esqueleto } from "../ui/Estados";
import { TabelaAdmin, type ColunaAdmin } from "../ui/TabelaAdmin";
import { useLargo } from "../ui/preferencias";
import { useDadosAdmin } from "../dados";
import { useRecurso } from "../repasses/recurso";
import { relativo, rotuloDia } from "../tempo";
import { horaSegundos } from "../auditoria/trilha";
import {
  LIMITES_SAUDE,
  detalheEvento,
  estadoSaude,
  falhasRecentes,
  modeloAtual,
  pontosPolilinha,
  porHora,
  segundos,
  serieLatencia,
  tendencia,
  type EventoLlm,
  type RespostaMonitor,
} from "./saude";

/** Atualiza sozinho a cada 60 s, só com a aba visível (e ao voltar para ela). */
const INTERVALO_MS = 60_000;

/**
 * Monitor LLM do admin (Torre BION): saúde (anel com a % de sucesso),
 * latência média/p50/p95 com mini-gráfico, tendência (metade recente ×
 * anterior e turnos por hora nas últimas 24 h), falhas recentes, modelo em
 * uso e a lista completa dos turnos. Fonte única: GET /api/bion-ia/monitor.
 */
export function LlmModulo() {
  const { agora } = useDadosAdmin();
  const largo = useLargo();
  const monitor = useRecurso<RespostaMonitor>("/api/bion-ia/monitor");
  const { recarregar } = monitor;

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") recarregar();
    }, INTERVALO_MS);
    const aoMudar = () => {
      if (document.visibilityState === "visible") recarregar();
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", aoMudar);
    };
  }, [recarregar]);

  const resumo = monitor.dados?.resumo ?? null;
  const eventos = useMemo(() => (monitor.dados?.eventos ?? []).filter((e) => Number.isFinite(e.ts)), [monitor.dados]);
  const saude = estadoSaude(resumo, eventos);
  const tend = useMemo(() => tendencia(eventos), [eventos]);
  const horas = useMemo(() => porHora(eventos, agora, 24), [eventos, agora]);
  const latencia = useMemo(() => serieLatencia(eventos, 40), [eventos]);
  const falhas = useMemo(() => falhasRecentes(eventos, 4), [eventos]);
  const modelo = modeloAtual(eventos);
  const modelos = (resumo?.modelos ?? []).filter(Boolean) as string[];
  const ultimo = eventos.length ? Math.max(...eventos.map((e) => e.ts)) : null;

  const primeiraCarga = monitor.carregando && !monitor.dados;

  return (
    <TelaModulo
      titulo="Monitor LLM"
      icone={Gauge}
      subtitulo={ultimo ? `Último turno ${relativo(ultimo, agora)} · atualiza sozinho a cada 60 s` : "Latência, sucesso e falhas da BION IA"}
      onAtualizar={recarregar}
      atualizando={monitor.carregando}
    >
      {primeiraCarga ? (
        <div className="space-y-3">
          <Esqueleto variante="kpis" quantidade={4} rotulo="Carregando o monitor…" />
          <Esqueleto variante="tabela" quantidade={4} rotulo="Carregando os turnos…" />
        </div>
      ) : monitor.erro && !monitor.dados ? (
        <div className="ba-card" data-denso="true">
          <EstadoErro titulo="Não foi possível carregar o monitor" mensagem={monitor.erro} onTentar={recarregar} />
        </div>
      ) : (
        <div className="space-y-4">
          {monitor.erro ? (
            <div className="ba-aviso" data-tom="atencao" role="status">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <p>A última atualização falhou ({monitor.erro}). Mostrando os dados anteriores.</p>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-3">
            <CardAdmin titulo="Saúde" icone={Activity} tom={saude.tom} className="lg:row-span-2">
              <div className="flex items-center gap-4">
                <AnelSucesso pct={resumo?.turnos ? resumo.taxaOk : null} tom={saude.tom} />
                <div className="min-w-0">
                  <ChipEstado tom={saude.tom}>{saude.rotulo}</ChipEstado>
                  <p className="text-sm mt-2 break-words">{saude.texto}</p>
                  {resumo?.turnos ? (
                    <p className="text-xs ba-texto-2 mt-1">
                      {resumo.ok} com resposta · {resumo.falhas} {resumo.falhas === 1 ? "falha" : "falhas"} · {resumo.turnos} turnos
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: "var(--ba-borda)" }}>
                <p className="ba-rotulo">Modelo em uso</p>
                <p className="font-bold break-words">{modelo ?? "—"}</p>
                {modelos.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {modelos.map((m) => (
                      <ChipEstado key={m} tom="neutro" ponto={false}>
                        {m}
                      </ChipEstado>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs ba-texto-3">
                  Saudável: ≥ {LIMITES_SAUDE.okSaudavel}% de sucesso e p95 até {segundos(LIMITES_SAUDE.p95LentoMs)}. Crítico: abaixo de {LIMITES_SAUDE.okInstavel}% ou {LIMITES_SAUDE.falhasSeguidasCriticas} falhas seguidas.
                </p>
              </div>
            </CardAdmin>

            <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4" role="list" aria-label="Números do monitor">
              <Numero rotulo="Turnos" valor={String(resumo?.turnos ?? 0)} />
              <Numero rotulo="Média" valor={segundos(resumo?.msMedia ?? 0)} />
              <Numero rotulo="p50" valor={segundos(resumo?.msP50 ?? 0)} />
              <Numero rotulo="p95" valor={segundos(resumo?.msP95 ?? 0)} tom={resumo && resumo.msP95 > LIMITES_SAUDE.p95LentoMs ? "atencao" : undefined} />
            </div>

            <CardAdmin titulo="Tendência" icone={TrendingUp} className="lg:col-span-2">
              {eventos.length === 0 ? (
                <p className="text-sm ba-texto-2">Sem turnos para mostrar tendência.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <ResumoTendencia t={tend} />
                    <MiniLatencia serie={latencia} />
                  </div>
                  <TurnosPorHora horas={horas} />
                </div>
              )}
            </CardAdmin>
          </div>

          {eventos.length === 0 ? (
            <div className="ba-card" data-denso="true">
              <EstadoVazio icone={Bot} titulo="Ainda sem turnos nesta instância" texto="Use o chat da BION IA e atualize. Os turnos aparecem aqui com a latência e o resultado." />
            </div>
          ) : (
            <>
              <section aria-labelledby="llm-falhas" className="space-y-2 scroll-mt-20">
                <h2 id="llm-falhas" className="ba-rotulo">
                  Falhas recentes
                </h2>
                {falhas.length === 0 ? (
                  <div className="ba-card" data-denso="true" data-tom="ok">
                    <p className="text-sm font-bold">Nenhuma falha entre os {eventos.length} turnos carregados.</p>
                  </div>
                ) : (
                  <ul className="grid gap-2 md:grid-cols-2">
                    {falhas.map((e, i) => (
                      <li key={`${e.ts}-${i}`} className="ba-card" data-denso="true" data-tom="critico">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-sm break-words">{detalheEvento(e)}</p>
                          <ChipEstado tom="critico">Falha</ChipEstado>
                        </div>
                        <p className="text-xs ba-texto-2 mt-1">
                          {rotuloDia(e.ts, agora)} às {horaSegundos(e.ts)} · {relativo(e.ts, agora)} · {segundos(e.ms)}
                          {e.http ? ` · HTTP ${e.http}` : ""}
                          {e.modelo || e.fonte ? ` · ${e.modelo ?? e.fonte}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="llm-turnos" className="space-y-2 scroll-mt-20">
                <h2 id="llm-turnos" className="ba-rotulo">
                  Turnos ({eventos.length})
                </h2>
                {largo ? <TabelaTurnos eventos={eventos} agora={agora} /> : <ListaTurnos eventos={eventos} agora={agora} />}
              </section>
            </>
          )}
        </div>
      )}
    </TelaModulo>
  );
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div role="listitem" className="ba-card" data-denso="true" data-tom={tom}>
      <p className="ba-rotulo">{rotulo}</p>
      <p className="ba-numero text-2xl lg:text-3xl" style={tom ? { color: "var(--ba-tom)" } : undefined}>
        {valor}
      </p>
    </div>
  );
}

/** Anel com a % de sucesso (texto no centro; o estado vem também por escrito no chip ao lado). */
function AnelSucesso({ pct, tom }: { pct: number | null; tom: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="ba-anel shrink-0" data-tom={tom} role="img" aria-label={pct == null ? "Sem dados de sucesso" : `${v}% dos turnos com resposta`}>
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} className="ba-anel-fundo" />
        <circle cx="50" cy="50" r={r} className="ba-anel-valor" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className="ba-anel-centro" aria-hidden>
        <span className="ba-numero text-2xl">{pct == null ? "—" : `${v}%`}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider ba-texto-3">sucesso</span>
      </span>
    </div>
  );
}

function ResumoTendencia({ t }: { t: ReturnType<typeof tendencia> }) {
  if (!t) return <p className="text-sm ba-texto-2">Poucos turnos para comparar (mínimo de 6).</p>;
  const Ic = t.direcao === "melhor" ? TrendingUp : t.direcao === "pior" ? TrendingDown : Minus;
  const tom = t.direcao === "melhor" ? "ok" : t.direcao === "pior" ? "critico" : "neutro";
  const sinal = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <div>
      <ChipEstado tom={tom} ponto={false}>
        <span className="inline-flex items-center gap-1">
          <Ic className="w-3.5 h-3.5" aria-hidden />
          {t.direcao === "melhor" ? "Melhorando" : t.direcao === "pior" ? "Piorando" : "Estável"}
        </span>
      </ChipEstado>
      <p className="text-xs ba-texto-2 mt-1.5">
        Últimos {t.recente.turnos} turnos × {t.anterior.turnos} anteriores: sucesso {t.recente.taxaOk}% ({sinal(t.deltaTaxa)} pp), p95 {segundos(t.recente.msP95)} ({t.deltaP95 > 0 ? "+" : t.deltaP95 < 0 ? "−" : ""}
        {segundos(Math.abs(t.deltaP95))}).
      </p>
    </div>
  );
}

/** Mini-gráfico da latência dos últimos turnos; falhas marcadas em vermelho. */
function MiniLatencia({ serie }: { serie: { ts: number; ms: number; ok: boolean }[] }) {
  const L = 240;
  const A = 56;
  if (serie.length < 2) return null;
  const max = Math.max(1, ...serie.map((s) => s.ms));
  const passo = L / (serie.length - 1);
  return (
    <figure className="mt-3" style={{ touchAction: "pan-y" }}>
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full h-16 overflow-visible" role="img" aria-label={`Latência dos últimos ${serie.length} turnos, de ${segundos(Math.min(...serie.map((s) => s.ms)))} a ${segundos(max)}.`}>
        <polyline points={pontosPolilinha(serie.map((s) => s.ms), L, A)} fill="none" stroke="var(--ba-sinal)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {serie.map((s, i) =>
          s.ok ? null : <circle key={i} cx={i * passo} cy={A - (s.ms / max) * A} r="3.5" fill="var(--ba-critico)" />,
        )}
      </svg>
      <figcaption className="text-xs ba-texto-3 mt-1 flex justify-between">
        <span>Latência · últimos {serie.length} turnos</span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--ba-critico)" }} aria-hidden /> falha
        </span>
      </figcaption>
    </figure>
  );
}

/** Barras por hora (24 h, fuso da clínica): altura = turnos; parte vermelha = falhas. */
function TurnosPorHora({ horas }: { horas: ReturnType<typeof porHora> }) {
  const max = Math.max(1, ...horas.map((h) => h.turnos));
  const total = horas.reduce((s, h) => s + h.turnos, 0);
  const falhas = horas.reduce((s, h) => s + h.falhas, 0);
  return (
    <figure>
      <div className="flex items-end gap-[3px] h-24" role="img" aria-label={`${total} turnos nas últimas 24 horas, ${falhas} com falha.`} style={{ touchAction: "pan-y" }}>
        {horas.map((h) => (
          <div key={h.chave} className="flex-1 h-full flex flex-col justify-end" title={`${h.rotulo}: ${h.turnos} turnos${h.falhas ? `, ${h.falhas} com falha` : ""}${h.turnos ? `, média ${segundos(h.msMedio)}` : ""}`}>
            {h.falhas ? <div className="w-full rounded-t-sm" style={{ height: `${(h.falhas / max) * 100}%`, background: "var(--ba-critico)" }} /> : null}
            <div
              className={`w-full ${h.falhas ? "" : "rounded-t-sm"}`}
              style={{
                height: h.turnos - h.falhas ? `${((h.turnos - h.falhas) / max) * 100}%` : h.turnos ? "0%" : "3%",
                background: h.turnos ? "color-mix(in srgb, var(--ba-sinal) 70%, transparent)" : "color-mix(in srgb, var(--ba-texto) 10%, transparent)",
              }}
            />
          </div>
        ))}
      </div>
      <figcaption className="text-xs ba-texto-3 mt-1 flex justify-between">
        <span>{horas[0]?.rotulo}</span>
        <span>
          Turnos por hora · 24 h · {total} {total === 1 ? "turno" : "turnos"}
        </span>
        <span>agora</span>
      </figcaption>
    </figure>
  );
}

function TabelaTurnos({ eventos, agora }: { eventos: EventoLlm[]; agora: number }) {
  const linhas = eventos.map((e, i) => ({ ...e, chave: `${e.ts}-${i}` }));
  const colunas: ColunaAdmin<(typeof linhas)[number]>[] = [
    {
      id: "quando",
      titulo: "Quando",
      largura: "11rem",
      render: (e) => (
        <span className="whitespace-nowrap">
          <span className="ba-texto-2">{rotuloDia(e.ts, agora)}</span> <b className="tabular-nums">{horaSegundos(e.ts)}</b>
        </span>
      ),
    },
    { id: "status", titulo: "Status", largura: "7rem", render: (e) => <ChipEstado tom={e.ok ? "ok" : "critico"}>{e.ok ? "OK" : "Falha"}</ChipEstado> },
    { id: "ms", titulo: "Latência", tipo: "num", largura: "7rem", render: (e) => segundos(e.ms) },
    { id: "modelo", titulo: "Modelo", render: (e) => <span className="break-words">{e.modelo ?? e.fonte ?? "—"}</span> },
    { id: "detalhe", titulo: "Detalhe", render: (e) => <span className="ba-texto-2 break-words">{detalheEvento(e)}</span> },
  ];
  return <TabelaAdmin rotulo="Turnos da BION IA" colunas={colunas} linhas={linhas} chave={(e) => e.chave} alturaMax="60vh" />;
}

function ListaTurnos({ eventos, agora }: { eventos: EventoLlm[]; agora: number }) {
  return (
    <ul className="space-y-2">
      {eventos.map((e, i) => (
        <li key={`${e.ts}-${i}`} className="ba-card" data-denso="true" data-tom={e.ok ? undefined : "critico"}>
          <div className="flex items-center gap-3">
            <Timer className="w-4 h-4 shrink-0 ba-texto-3" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold tabular-nums">
                {rotuloDia(e.ts, agora)} · {horaSegundos(e.ts)} · {segundos(e.ms)}
              </p>
              <p className="text-xs ba-texto-2 break-words">
                {e.modelo ?? e.fonte ?? "—"} · {detalheEvento(e)}
              </p>
            </div>
            <ChipEstado tom={e.ok ? "ok" : "critico"}>{e.ok ? "OK" : "Falha"}</ChipEstado>
          </div>
        </li>
      ))}
    </ul>
  );
}

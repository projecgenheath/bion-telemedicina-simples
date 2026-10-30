"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Loader2 } from "lucide-react";
import { useBion, type Medico } from "@/lib/bion-store";
import { diaFusoClinica } from "@/lib/bion-tipos";
import {
  AVISO_HORARIO_VEDADO,
  gerarGrade,
  INTERVALO_MINIMO,
  DURACAO_MINIMA,
  sugerirParametros,
  validarGrade,
  type ParametrosGrade,
} from "../metricas";
import { Campo, SheetMedico } from "./SheetMedico";
import { AgendaDoDia } from "./AgendaDoDia";
import { avisarDadosMedicoAlterados } from "../useDadosMedico";
import type { Confirmar } from "./useConfirmarSalvamento";

/** Mesmas regras do servidor para o bloqueio em intervalo (bloqueio-agenda.ts). */
const HORIZONTE_PERIODO_DIAS = 365;
const MAX_DIAS_PERIODO = 62;
const MOTIVO_PERIODO_MAX = 120;

/** Nº de dias de `de` a `ate`, inclusive (datas civis, sem fuso). */
function diasDoPeriodo(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** "2026-10-05" → "05/10/2026". */
const rotuloData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type DiaAfetado = { dia: string; consultas: number; reservas: number };
type FasePeriodo =
  | { tipo: "form" }
  | { tipo: "confirmar"; consultas: number; reservas: number; diasAfetados: DiaAfetado[] }
  | { tipo: "salvando" }
  | {
      tipo: "resultado";
      bloqueados: number;
      jaBloqueados: number;
      canceladas: number;
      reservasLiberadas: number;
      falhas: { dia: string; erro: string }[];
    };

type RespostaPeriodo = {
  erro?: string;
  consultas?: number;
  reservas?: number;
  diasAfetados?: DiaAfetado[];
  bloqueados?: string[];
  jaBloqueados?: string[];
  canceladas?: number;
  reservasLiberadas?: number;
  falhas?: { dia: string; erro: string }[];
};

/**
 * Bloquear VÁRIOS dias de uma vez (férias): POST /api/medico/agenda/bloqueios
 * com { diaInicio, diaFim } — o servidor bloqueia dia a dia (mesma trava e
 * mesmas regras do bloqueio de um dia) e devolve UM resumo. Se algum dia do
 * período tiver consultas/reservas, a primeira chamada volta 409 com o
 * detalhamento e NADA é gravado: a confirmação (com cancelarConsultas) é do
 * período inteiro. A resposta do POST é a confirmação real do salvamento.
 */
function BloqueioPeriodo({ onExecutando }: { onExecutando: (rodando: boolean) => void }) {
  const hojeIso = diaFusoClinica(0).iso;
  const limiteIso = diaFusoClinica(HORIZONTE_PERIODO_DIAS).iso;
  const [de, setDe] = useState(hojeIso);
  const [ate, setAte] = useState(hojeIso);
  const [motivo, setMotivo] = useState("");
  const [fase, setFase] = useState<FasePeriodo>({ tipo: "form" });
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const totalDias = diasDoPeriodo(de, ate);
  const erroForm =
    de < hojeIso || ate < hojeIso
      ? "O período não pode incluir um dia que já passou."
      : ate < de
        ? "O fim do período precisa ser no mesmo dia do início ou depois dele."
        : de > limiteIso || ate > limiteIso
          ? `Bloqueie no máximo ${HORIZONTE_PERIODO_DIAS} dias à frente.`
          : totalDias > MAX_DIAS_PERIODO
            ? `No máximo ${MAX_DIAS_PERIODO} dias por vez (este período tem ${totalDias}). Divida em dois períodos, se precisar.`
            : null;

  const enviar = async (cancelarConsultas: boolean) => {
    setErroEnvio(null);
    setFase({ tipo: "salvando" });
    onExecutando(true);
    let status = 0;
    let json: RespostaPeriodo | null = null;
    try {
      const res = await fetch("/api/medico/agenda/bloqueios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diaInicio: de,
          diaFim: ate,
          motivo: motivo.trim().slice(0, MOTIVO_PERIODO_MAX),
          cancelarConsultas,
        }),
      });
      status = res.status;
      json = (await res.json().catch(() => null)) as RespostaPeriodo | null;
    } catch {
      json = null;
    }
    onExecutando(false);
    if (status === 409 && json && typeof json.consultas === "number" && !cancelarConsultas) {
      // O servidor contou consultas/reservas no período e não gravou nada:
      // pede a confirmação do período inteiro com o detalhamento.
      setFase({ tipo: "confirmar", consultas: json.consultas, reservas: json.reservas ?? 0, diasAfetados: json.diasAfetados ?? [] });
      return;
    }
    if (status < 200 || status >= 300 || !json) {
      setErroEnvio(json?.erro ?? "Falha de conexão com o servidor. Tente de novo.");
      setFase({ tipo: "form" });
      return;
    }
    avisarDadosMedicoAlterados();
    setFase({
      tipo: "resultado",
      bloqueados: json.bloqueados?.length ?? 0,
      jaBloqueados: json.jaBloqueados?.length ?? 0,
      canceladas: json.canceladas ?? 0,
      reservasLiberadas: json.reservasLiberadas ?? 0,
      falhas: json.falhas ?? [],
    });
  };

  return (
    <section aria-labelledby="bm-bloqueio-periodo-titulo" className="space-y-3">
      <h3 id="bm-bloqueio-periodo-titulo" className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
        Bloquear vários dias (férias)
      </h3>
      <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
        Bloqueia o período inteiro de uma vez, dia a dia, com as mesmas regras do bloqueio de um dia. Para desbloquear, use a
        agenda do dia de cada data.
      </p>

      {fase.tipo === "form" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-bold">De</span>
              <input
                type="date"
                min={hojeIso}
                max={limiteIso}
                value={de}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setDe(v);
                }}
                className="mt-1 w-full rounded-xl border border-bion-ink/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold">Até</span>
              <input
                type="date"
                min={hojeIso}
                max={limiteIso}
                value={ate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setAte(v);
                }}
                className="mt-1 w-full rounded-xl border border-bion-ink/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-bold">Motivo (opcional, só você vê)</span>
            <input
              type="text"
              value={motivo}
              maxLength={MOTIVO_PERIODO_MAX}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: férias, congresso"
              className="mt-1 w-full rounded-xl border border-bion-ink/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
            />
          </label>
          {erroForm ? (
            <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">{erroForm}</p>
          ) : (
            <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">
              {totalDias === 1 ? "1 dia" : `${totalDias} dias`}: de {rotuloData(de)} a {rotuloData(ate)}.
            </p>
          )}
          {erroEnvio ? (
            <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">{erroEnvio}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void enviar(false)}
            disabled={Boolean(erroForm)}
            className="w-full py-3 rounded-2xl text-sm font-bold inline-flex items-center justify-center gap-2 border-2 border-bion-ink/25 dark:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Ban className="w-4 h-4" aria-hidden /> Bloquear período
          </button>
        </div>
      ) : null}

      {fase.tipo === "confirmar" ? (
        <div
          role="alertdialog"
          aria-labelledby="bm-bloqueio-periodo-confirmar-titulo"
          aria-describedby="bm-bloqueio-periodo-confirmar-texto"
          className="rounded-2xl border-2 border-red-700 dark:border-red-300 p-4 space-y-3"
        >
          <h4 id="bm-bloqueio-periodo-confirmar-titulo" className="text-base font-black inline-flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-300" aria-hidden />
            Cancelar e bloquear o período?
          </h4>
          <div id="bm-bloqueio-periodo-confirmar-texto" className="text-sm space-y-2">
            <p>
              De {rotuloData(de)} a {rotuloData(ate)} ({totalDias === 1 ? "1 dia" : `${totalDias} dias`}). Os pacientes não vão
              conseguir agendar nem remarcar para esses dias. Você pode desbloquear depois, dia a dia.
            </p>
            {fase.consultas > 0 ? (
              <p>
                {fase.consultas === 1 ? "1 consulta será cancelada" : `${fase.consultas} consultas serão canceladas`}: os
                pacientes <strong>não pagam multa</strong>. Quem já pagou escolhe entre <strong>reembolso integral</strong> ou{" "}
                <strong>remarcar</strong> sem custo; consultas ainda não pagas são canceladas. Desbloquear não desfaz isso.
              </p>
            ) : null}
            {fase.reservas > 0 ? (
              <p>
                {fase.reservas === 1
                  ? "1 reserva de remarcação aguardando pagamento nesses dias será liberada (o paciente é avisado)."
                  : `${fase.reservas} reservas de remarcação aguardando pagamento nesses dias serão liberadas (os pacientes são avisados).`}
              </p>
            ) : null}
          </div>
          {fase.diasAfetados.length ? (
            <ul className="text-sm space-y-0.5">
              {fase.diasAfetados.map((d) => (
                <li key={d.dia} className="flex justify-between gap-2">
                  <span>{rotuloData(d.dia)}</span>
                  <span className="font-bold">
                    {d.consultas ? `${d.consultas} ${d.consultas === 1 ? "consulta" : "consultas"}` : ""}
                    {d.consultas && d.reservas ? " · " : ""}
                    {d.reservas ? `${d.reservas} ${d.reservas === 1 ? "reserva" : "reservas"}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFase({ tipo: "form" })}
              className="py-2.5 rounded-xl text-sm font-bold border border-bion-ink/25 dark:border-white/25"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void enviar(true)}
              className="py-2.5 rounded-xl text-sm font-bold bg-red-700 text-white hover:bg-red-800 dark:bg-red-300 dark:text-zinc-950 dark:hover:bg-red-200"
            >
              Cancelar e bloquear o período
            </button>
          </div>
        </div>
      ) : null}

      {fase.tipo === "salvando" ? (
        <div className="rounded-2xl border border-bion-ink/15 dark:border-white/15 p-4" role="status" aria-live="polite">
          <div className="text-sm font-bold inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />
            Bloqueando {totalDias === 1 ? "o dia" : `os ${totalDias} dias`}…
          </div>
          <p className="text-xs mt-1 text-bion-ink/70 dark:text-bion-paper/70">Não feche esta tela até terminar.</p>
        </div>
      ) : null}

      {fase.tipo === "resultado" ? (
        <div className="rounded-2xl border border-bion-ink/15 dark:border-white/15 p-4 space-y-2" role="status" aria-live="polite">
          <h4 className="text-sm font-black inline-flex items-center gap-2">
            {fase.falhas.length ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300" aria-hidden />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
            )}
            {fase.falhas.length && fase.bloqueados === 0
              ? "Nenhum dia foi bloqueado"
              : `Período bloqueado · ${fase.bloqueados} ${fase.bloqueados === 1 ? "dia" : "dias"}${
                  fase.jaBloqueados ? ` (${fase.jaBloqueados} já ${fase.jaBloqueados === 1 ? "estava bloqueado" : "estavam bloqueados"})` : ""
                }${fase.canceladas ? ` · ${fase.canceladas} ${fase.canceladas === 1 ? "consulta cancelada" : "consultas canceladas"}` : ""}${
                  fase.reservasLiberadas ? ` · ${fase.reservasLiberadas} ${fase.reservasLiberadas === 1 ? "reserva liberada" : "reservas liberadas"}` : ""
                }`}
          </h4>
          {fase.canceladas || fase.reservasLiberadas ? (
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Os pacientes foram avisados pelo app.</p>
          ) : null}
          {fase.falhas.length ? (
            <ul className="text-sm space-y-1" aria-label="Dias que não foram bloqueados">
              {fase.falhas.map((f) => (
                <li key={f.dia} className="text-red-700 dark:text-red-300">
                  <span className="font-bold">{rotuloData(f.dia)}</span>: {f.erro}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => setFase({ tipo: "form" })}
            className="text-sm font-bold text-bion-sea dark:text-sky-300 underline underline-offset-2"
          >
            Bloquear outro período
          </button>
        </div>
      ) : null}
    </section>
  );
}

const chaveLocal = (id: string) => `bion-medico-grade:${id}`;

function lerParametros(medico: Medico): ParametrosGrade {
  try {
    const salvo = localStorage.getItem(chaveLocal(medico.id));
    if (salvo) {
      const p = JSON.parse(salvo) as ParametrosGrade;
      if (!validarGrade(p)) return p;
    }
  } catch {
    /* ignora */
  }
  return sugerirParametros(medico.horariosDisponiveis);
}

/**
 * Agenda — gera a lista de horários de início (duração + intervalo ≥ 10 min
 * + pausa diária) e grava em PerfilMedico.horariosDisponiveis (único
 * caminho de gravação existente). Os parâmetros da grade ficam só neste
 * aparelho; dias de atendimento e pausas semanais agora vão ao servidor
 * (PATCH /api/medicos/[id] aceita desde a correção P1).
 */
export function AgendaSheet({
  aberto,
  onFechar,
  medico,
  confirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  medico: Medico;
  /** Compara a grade como string "HH:MM,HH:MM,…". */
  confirmar: Confirmar<string>;
}) {
  const { atualizarMedico } = useBion();
  const [p, setP] = useState<ParametrosGrade>(() => lerParametros(medico));
  const [excluidos, setExcluidos] = useState<Set<string>>(() => new Set());
  // M-11: o estado inicial vem do que o médico JÁ SALVOU no servidor (o delta
  // do store traz diasAtendimento/pausasSemanais desde a correção P1) — antes
  // era sempre o padrão seg–sex sem pausas, ignorando o que foi gravado.
  // Vazio é fiel ao servidor: diasAtendimento vazio significa "todos os
  // dias". Converter vazio em seg–sex aqui faria qualquer outro salvamento
  // gravar seg–sex sem o usuário ter escolhido os dias.
  const [diasSemana, setDiasSemana] = useState<Set<number>>(
    () => new Set(medico.diasAtendimento ?? []),
  );
  const [pausas, setPausas] = useState<{dia: number; inicio: string; fim: string}[]>(() => [...(medico.pausasSemanais ?? [])]);
  /** "Cancelar agenda do dia" em andamento: a folha não fecha no meio. */
  const [cancelandoDia, setCancelandoDia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const fechar = () => {
    if (!cancelandoDia && !salvando) onFechar();
  };
  const erro = validarGrade(p);
  const gerados = useMemo(() => gerarGrade(p), [p]);
  const finais = gerados.filter((h) => !excluidos.has(h));
  const atual = [...medico.horariosDisponiveis].sort();
  const igualAoAtual = finais.join(",") === atual.join(",");
  // M-11: salva quando QUALQUER parte mudou (grade, dias ou pausas) — antes,
  // mudar só dias/pausas deixava o botão travado em "igual à atual".
  const diasAtual = [...(medico.diasAtendimento ?? [])].sort((a, b) => a - b).join(",");
  const diasNovo = Array.from(diasSemana).sort((a, b) => a - b).join(",");
  const pausasAtual = JSON.stringify([...(medico.pausasSemanais ?? [])].sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio)));
  const pausasNovo = JSON.stringify([...pausas].sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio)));
  const nadaMudou = igualAoAtual && diasAtual === diasNovo && pausasAtual === pausasNovo;
  // M-11: valida pausas — início antes do fim, sem sobreposição no mesmo dia.
  const erroPausas = useMemo(() => {
    for (const pa of pausas) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(pa.inicio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(pa.fim)) {
        return "Pausa com horário inválido (use HH:MM).";
      }
      if (pa.inicio >= pa.fim) return "A pausa precisa começar antes de terminar.";
      for (const outra of pausas) {
        if (outra !== pa && outra.dia === pa.dia && pa.inicio < outra.fim && outra.inicio < pa.fim) {
          return "Duas pausas se sobrepõem no mesmo dia.";
        }
      }
    }
    return null;
  }, [pausas]);

  const set = <K extends keyof ParametrosGrade>(k: K, v: ParametrosGrade[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (s: string) => (s === "" ? Number.NaN : Number.parseInt(s, 10));

  const alternar = (h: string) =>
    setExcluidos((s) => {
      const n = new Set(s);
      if (n.has(h)) n.delete(h);
      else n.add(h);
      return n;
    });

  const salvar = async () => {
    if (erro || erroPausas || finais.length === 0 || salvando) return;
    setErroSalvar(null);
    setSalvando(true);
    atualizarMedico(medico.id, {
      horariosDisponiveis: finais,
      diasAtendimento: Array.from(diasSemana).sort((a, b) => a - b),
      pausasSemanais: pausas,
    });
    // Só fecha com a confirmação real (delta do servidor). Sem confirmação
    // em tempo, a folha fica aberta com erro + retry, em vez de fechar
    // fingindo sucesso.
    const ok = await confirmar(finais.join(","), "Salvando horários…", `Agenda atualizada: ${finais.length} horários por dia`);
    setSalvando(false);
    if (!ok) {
      setErroSalvar("Não foi possível confirmar o salvamento. Verifique sua conexão e toque em Salvar novamente.");
      return;
    }
    try {
      localStorage.setItem(chaveLocal(medico.id), JSON.stringify(p));
    } catch {
      /* ignora */
    }
    onFechar();
  };

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={fechar}
      titulo="Minha agenda"
      subtitulo="Consultas por dia e grade de horários (vale para todos os dias da semana)."
    >
      <div className="space-y-5">
        <AgendaDoDia medico={medico} onExecutando={setCancelandoDia} />

        <hr className="border-bion-ink/10 dark:border-white/10" />

        <BloqueioPeriodo onExecutando={setCancelandoDia} />

        <hr className="border-bion-ink/10 dark:border-white/10" />

        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
            Horários atuais ({atual.length})
          </div>
          {atual.length ? (
            <p className="text-sm mt-1 leading-relaxed">{atual.join(" · ")}</p>
          ) : (
            <p className="text-sm mt-1 text-bion-ink/75 dark:text-bion-paper/75">
              Nenhum horário cadastrado — os pacientes veem a grade padrão da plataforma.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Início">
            <input type="time" value={p.inicio} onChange={(e) => set("inicio", e.target.value)} className="bp-entrada w-full px-4 py-2.5 text-sm" />
          </Campo>
          <Campo rotulo="Fim">
            <input type="time" value={p.fim} onChange={(e) => set("fim", e.target.value)} className="bp-entrada w-full px-4 py-2.5 text-sm" />
          </Campo>
          <Campo rotulo="Duração (min)">
            <input
              type="number"
              min={DURACAO_MINIMA}
              max={240}
              step={5}
              value={Number.isNaN(p.duracao) ? "" : p.duracao}
              onChange={(e) => set("duracao", num(e.target.value))}
              className="bp-entrada w-full px-4 py-2.5 text-sm"
            />
          </Campo>
          <Campo rotulo="Intervalo (min)" ajuda={`Mínimo ${INTERVALO_MINIMO} min.`}>
            <input
              type="number"
              min={INTERVALO_MINIMO}
              max={240}
              step={5}
              value={Number.isNaN(p.intervalo) ? "" : p.intervalo}
              onChange={(e) => set("intervalo", num(e.target.value))}
              className="bp-entrada w-full px-4 py-2.5 text-sm"
            />
          </Campo>
          <Campo rotulo="Pausa — início">
            <input type="time" value={p.pausaInicio ?? ""} onChange={(e) => set("pausaInicio", e.target.value || undefined)} className="bp-entrada w-full px-4 py-2.5 text-sm" />
          </Campo>
          <Campo rotulo="Pausa — fim">
            <input type="time" value={p.pausaFim ?? ""} onChange={(e) => set("pausaFim", e.target.value || undefined)} className="bp-entrada w-full px-4 py-2.5 text-sm" />
          </Campo>
        </div>

        {erro ? (
          <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
            {erro}
          </p>
        ) : (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
              Nova grade: {finais.length} horários — toque para remover ou devolver
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {gerados.map((h) => {
                const fora = excluidos.has(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => alternar(h)}
                    aria-pressed={!fora}
                    aria-label={`${h} ${fora ? "removido" : "incluído"}`}
                    className={`py-2 rounded-xl text-sm font-bold tabular-nums border ${
                      fora
                        ? "border-dashed border-bion-ink/30 dark:border-white/30 text-bion-ink/60 dark:text-bion-paper/60 line-through"
                        : "border-transparent bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">
          Os horários de início são gravados no servidor; duração e intervalo ficam salvos neste aparelho. Consultas já marcadas não mudam.
        </p>
        <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">{AVISO_HORARIO_VEDADO}</p>

        {erroPausas ? (
          <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">{erroPausas}</p>
        ) : null}

        {erroSalvar ? (
          <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">{erroSalvar}</p>
        ) : null}

        <button
          type="button"
          onClick={salvar}
          disabled={Boolean(erro) || Boolean(erroPausas) || finais.length === 0 || nadaMudou || cancelandoDia || salvando}
          className="bp-acao w-full py-3 text-sm disabled:opacity-50"
        >
          {salvando ? "Salvando…" : nadaMudou ? "Nada para salvar" : "Salvar agenda"}
        </button>

        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">Dias da semana</div>
          <div className="flex flex-wrap gap-1.5">
            {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={diasSemana.has(i)}
                onClick={() => setDiasSemana(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${diasSemana.has(i) ? "bg-bion-sea text-white" : "bg-bion-ink/10 dark:bg-white/10"}`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">
            {diasSemana.size === 0 ? "Sem dias marcados: o médico atende todos os dias." : "Gravado no servidor ao salvar — o agendamento respeita."}
          </p>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">Pausas semanais</div>
          {pausas.map((pa, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
              <select
                value={pa.dia}
                onChange={(e) => setPausas(list => list.map((x, i) => i === idx ? { ...x, dia: Number(e.target.value) } : x))}
                aria-label="Dia da pausa"
                className="bp-entrada px-2 py-1 text-sm"
              >
                {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <input type="time" value={pa.inicio} onChange={(e) => setPausas(list => list.map((x, i) => i === idx ? { ...x, inicio: e.target.value } : x))} aria-label="Início da pausa" className="bp-entrada px-2 py-1 text-sm" />
              <span>–</span>
              <input type="time" value={pa.fim} onChange={(e) => setPausas(list => list.map((x, i) => i === idx ? { ...x, fim: e.target.value } : x))} aria-label="Fim da pausa" className="bp-entrada px-2 py-1 text-sm" />
              <button type="button" onClick={() => setPausas(p => p.filter((_,i) => i !== idx))} className="text-xs text-red-600">remover</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPausas(p => [...p, {dia: 1, inicio: "12:00", fim: "13:00"}])}
            className="text-xs font-bold text-bion-sea dark:text-sky-300"
          >
            + Adicionar pausa
          </button>
          <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">Gravado no servidor ao salvar — o agendamento bloqueia esses horários.</p>
        </div>
      </div>
    </SheetMedico>
  );
}

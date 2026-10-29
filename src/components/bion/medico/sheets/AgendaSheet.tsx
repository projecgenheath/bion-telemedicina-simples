"use client";

import { useMemo, useState } from "react";
import { useBion, type Medico } from "@/lib/bion-store";
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
import type { Confirmar } from "./useConfirmarSalvamento";

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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarX2, CheckCircle2, Loader2 } from "lucide-react";
import { useBion, type Consulta, type Medico } from "@/lib/bion-store";
import { diaFusoClinica, instanteFusoClinica } from "@/lib/bion-tipos";
import {
  agendaDoDia,
  consultasCancelaveisDoDia,
  ehDoMedico,
  idsFalhaTecnica,
  reservaVigente,
  reservasNoDia,
  rotuloStatusMedico,
  STATUS_ATIVOS,
  diaDaConsulta,
  horaClinica,
  textoReservaPendente,
  type EventoMedico,
  type SlotAgenda,
} from "../metricas";
import { avisarDadosMedicoAlterados } from "../useDadosMedico";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORIZONTE_DIAS = 14;
const MOTIVO_CANCELAR_DIA = "Agenda do dia cancelada pelo médico";

type Falha = { consulta: Consulta; erro: string };
type Fase =
  | { tipo: "lista" }
  | { tipo: "confirmar"; alvo: Consulta[]; reservas: number }
  | { tipo: "executando"; alvo: Consulta[]; feitas: number; etapa: "reservas" | "consultas" }
  | { tipo: "resultado"; canceladas: number; reservasLiberadas: number; erroReservas: string | null; falhas: Falha[] };

/** "AAAA-MM-DD" → partes (mês 0-11). */
function partesIso(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return { ano, mes: mes - 1, dia };
}

/**
 * Libera as reservas de remarcação aguardando pagamento do dia
 * (POST /api/medico/agenda/cancelar-dia → cancelarReservasDoDia no servidor).
 * Idempotente: chamado sempre, mesmo se o estado local não mostra reservas.
 */
async function liberarReservasDoDia(dia: string): Promise<{ ok: true; liberadas: number } | { ok: false; erro: string }> {
  try {
    const res = await fetch("/api/medico/agenda/cancelar-dia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: dia }),
    });
    const json = (await res.json().catch(() => null)) as { erro?: string; reservasLiberadas?: number } | null;
    if (!res.ok) return { ok: false, erro: json?.erro ?? `Erro ${res.status}` };
    return { ok: true, liberadas: json?.reservasLiberadas ?? 0 };
  } catch {
    return { ok: false, erro: "Falha de conexão com o servidor." };
  }
}

/**
 * Cancela UMA consulta como parte de "cancelar agenda do dia". O store
 * (`cancelarConsulta`) só envia { acao, motivo }, então chamamos o PATCH com o
 * MESMO corpo + `cancelarDia: true` (o servidor também cancela as reservas de
 * remarcação de outras consultas que caem nesse dia) e aplicamos o delta.
 */
async function cancelarComoDia(id: string): Promise<{ ok: true; delta: unknown } | { ok: false; erro: string }> {
  try {
    const res = await fetch(`/api/consultas/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "cancelar", motivo: MOTIVO_CANCELAR_DIA, cancelarDia: true }),
    });
    const json = (await res.json().catch(() => null)) as ({ erro?: string } & Record<string, unknown>) | null;
    if (!res.ok) return { ok: false, erro: json?.erro ?? `Erro ${res.status}` };
    return { ok: true, delta: json };
  } catch {
    return { ok: false, erro: "Falha de conexão com o servidor." };
  }
}

/**
 * Agenda de um dia (atalhos para os próximos 14 dias + "Outro dia" para
 * qualquer data futura) com as consultas, os horários livres e os horários
 * RESERVADOS por remarcações aguardando pagamento, mais a ação "Cancelar
 * agenda do dia" — hoje ou qualquer dia futuro, mesmo que o dia só tenha
 * reservas aguardando pagamento. Dia que já passou não é cancelado.
 * Consultas com falta do paciente / falha técnica (gravadas pelo sistema a
 * partir da presença na sala) mostram esse rótulo no lugar do status.
 */
export function AgendaDoDia({ medico, onExecutando }: { medico: Medico; onExecutando: (rodando: boolean) => void }) {
  const { consultas, sessao, aplicarDelta, aplicarEstadoFresco } = useBion();
  const [agora, setAgora] = useState(() => Date.now());
  const [dia, setDia] = useState(() => diaFusoClinica(0).iso);
  const [fase, setFase] = useState<Fase>({ tipo: "lista" });
  const rodando = useRef(false);
  const tituloResultadoRef = useRef<HTMLHeadingElement>(null);

  const minhas = useMemo(() => consultas.filter((c) => ehDoMedico(c, sessao)), [consultas, sessao]);
  const hojeIso = diaFusoClinica(0).iso;
  const diaPassado = dia < hojeIso;

  // Falhas técnicas do dia escolhido (eventos do servidor; a falta já vem no bootstrap).
  const [falhasTecnicas, setFalhasTecnicas] = useState<ReadonlySet<string>>(() => new Set());
  const versaoDia = useMemo(
    () =>
      minhas
        .filter((c) => diaDaConsulta(c) === dia)
        .map((c) => `${c.id}:${c.status}:${c.falta ? 1 : 0}`)
        .join("|"),
    [minhas, dia],
  );
  useEffect(() => {
    const { ano, mes, dia: d } = partesIso(dia);
    const inicio = instanteFusoClinica(ano, mes, d);
    if (!Number.isFinite(inicio)) return;
    const ctrl = new AbortController();
    const url = `/api/medico/eventos?de=${encodeURIComponent(new Date(inicio).toISOString())}&ate=${encodeURIComponent(new Date(inicio + 86_400_000).toISOString())}`;
    fetch(url, { headers: { "Content-Type": "application/json" }, signal: ctrl.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { eventos?: EventoMedico[] } | null;
        if (!ctrl.signal.aborted && res.ok && json?.eventos) setFalhasTecnicas(idsFalhaTecnica(json.eventos));
      })
      .catch(() => {
        /* sem os eventos, a agenda mostra só o status */
      });
    return () => ctrl.abort();
  }, [dia, versaoDia]);
  const dias = useMemo(
    () =>
      Array.from({ length: HORIZONTE_DIAS }, (_, i) => {
        const d = diaFusoClinica(i);
        const ativas = minhas.filter((c) => diaDaConsulta(c) === d.iso && STATUS_ATIVOS.includes(c.status)).length;
        return {
          iso: d.iso,
          rotulo: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : `${String(d.dia).padStart(2, "0")}/${String(d.mes + 1).padStart(2, "0")}`,
          sub: DIAS_SEMANA[d.semana],
          ativas,
        };
      }),
    [minhas],
  );
  const slots = useMemo(() => agendaDoDia(minhas, dia, medico.horariosDisponiveis, agora), [minhas, dia, medico.horariosDisponiveis, agora]);
  const cancelaveis = useMemo(() => consultasCancelaveisDoDia(minhas, dia, agora), [minhas, dia, agora]);
  const reservasDia = useMemo(() => reservasNoDia(minhas, dia, agora), [minhas, dia, agora]);
  const podeCancelar = !diaPassado && (cancelaveis.length > 0 || reservasDia.length > 0);
  const rotuloDia = dias.find((d) => d.iso === dia)?.rotulo ?? `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  /** "hoje" · "amanhã" · "em 05/10" — para as frases. */
  const quandoDia = rotuloDia === "Hoje" ? "hoje" : rotuloDia === "Amanhã" ? "amanhã" : `em ${rotuloDia}`;
  const deDia = rotuloDia === "Hoje" ? "de hoje" : rotuloDia === "Amanhã" ? "de amanhã" : `de ${rotuloDia}`;
  const ocupado = fase.tipo === "executando";

  const pedirConfirmacao = () => {
    const t = Date.now();
    setAgora(t);
    if (dia < diaFusoClinica(0).iso) return;
    const alvo = consultasCancelaveisDoDia(minhas, dia, t);
    const reservas = reservasNoDia(minhas, dia, t).length;
    if (!alvo.length && !reservas) return;
    setFase({ tipo: "confirmar", alvo, reservas });
  };

  const executar = async (alvo: Consulta[]) => {
    if (rodando.current) return;
    rodando.current = true;
    onExecutando(true);
    let canceladas = 0;
    const falhas: Falha[] = [];
    // 1) Reservas aguardando pagamento do dia (antes das consultas, para a contagem sair certa).
    setFase({ tipo: "executando", alvo, feitas: 0, etapa: "reservas" });
    const rr = await liberarReservasDoDia(dia);
    const reservasLiberadas = rr.ok ? rr.liberadas : 0;
    const erroReservas = rr.ok ? null : rr.erro;
    // 2) Consultas: sequencial, uma por vez (ordem do horário), mostrando o progresso.
    setFase({ tipo: "executando", alvo, feitas: 0, etapa: "consultas" });
    for (let i = 0; i < alvo.length; i++) {
      const r = await cancelarComoDia(alvo[i].id);
      if (r.ok) {
        canceladas++;
        aplicarDelta(r.delta);
      } else {
        falhas.push({ consulta: alvo[i], erro: r.erro });
      }
      setFase({ tipo: "executando", alvo, feitas: i + 1, etapa: "consultas" });
    }
    // Reservas de OUTRAS consultas também caíram no servidor: recarrega o estado.
    try {
      const res = await fetch("/api/bootstrap", { headers: { "Content-Type": "application/json" } });
      if (res.ok) aplicarEstadoFresco(await res.json());
    } catch {
      /* o polling do store cobre */
    }
    avisarDadosMedicoAlterados();
    setAgora(Date.now());
    setFase({ tipo: "resultado", canceladas, reservasLiberadas, erroReservas, falhas });
    rodando.current = false;
    onExecutando(false);
    requestAnimationFrame(() => tituloResultadoRef.current?.focus());
  };

  return (
    <section aria-labelledby="bm-agenda-dia-titulo" className="space-y-3">
      <h3 id="bm-agenda-dia-titulo" className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
        Agenda do dia
      </h3>

      <div className="flex gap-2 overflow-x-auto bp-coluna pb-1" role="group" aria-label="Escolha o dia">
        {dias.map((d) => (
          <button
            key={d.iso}
            type="button"
            aria-pressed={d.iso === dia}
            disabled={ocupado}
            onClick={() => {
              setDia(d.iso);
              setAgora(Date.now());
              if (fase.tipo !== "executando") setFase({ tipo: "lista" });
            }}
            className={`shrink-0 rounded-2xl px-3 py-2 text-left border disabled:opacity-60 ${
              d.iso === dia
                ? "border-transparent bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                : "border-bion-ink/15 dark:border-white/15"
            }`}
          >
            <span className="block text-sm font-bold">{d.rotulo}</span>
            <span className="block text-xs">
              {d.sub}
              {d.ativas ? ` · ${d.ativas}` : ""}
              <span className="sr-only">{d.ativas ? ` consultas ativas` : " sem consultas ativas"}</span>
            </span>
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="font-bold">Outro dia</span>
        <input
          type="date"
          min={hojeIso}
          value={dia}
          disabled={ocupado}
          onChange={(e) => {
            const v = e.target.value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
            setDia(v);
            setAgora(Date.now());
            if (fase.tipo !== "executando") setFase({ tipo: "lista" });
          }}
          className="rounded-xl border border-bion-ink/15 dark:border-white/15 bg-transparent px-2 py-1.5 text-sm disabled:opacity-60"
        />
      </label>

      {slots.length === 0 ? (
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhum horário nem consulta neste dia.</p>
      ) : (
        <ul className="space-y-1.5" aria-label={`Horários de ${rotuloDia}`}>
          {slots.map((s) => (
            <LinhaSlot key={s.hora} slot={s} agora={agora} falhasTecnicas={falhasTecnicas} />
          ))}
        </ul>
      )}

      {fase.tipo === "lista" ? (
        <>
          <button
            type="button"
            onClick={pedirConfirmacao}
            disabled={!podeCancelar}
            className="w-full py-3 rounded-2xl text-sm font-bold inline-flex items-center justify-center gap-2 bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-300 dark:text-zinc-950 dark:hover:bg-red-200"
          >
            <CalendarX2 className="w-4 h-4" aria-hidden /> Cancelar agenda do dia
          </button>
          {diaPassado ? (
            <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">Um dia que já passou não pode ser cancelado.</p>
          ) : !podeCancelar ? (
            <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">
              Nada para cancelar {quandoDia}: nenhuma consulta por acontecer nem reserva aguardando pagamento.
            </p>
          ) : null}
        </>
      ) : null}

      {fase.tipo === "confirmar" ? (
        <div role="alertdialog" aria-labelledby="bm-cancelar-dia-titulo" aria-describedby="bm-cancelar-dia-texto" className="rounded-2xl border-2 border-red-700 dark:border-red-300 p-4 space-y-3">
          <h4 id="bm-cancelar-dia-titulo" className="text-base font-black inline-flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-300" aria-hidden />
            {fase.alvo.length
              ? `Cancelar ${fase.alvo.length} ${fase.alvo.length === 1 ? "consulta" : "consultas"} ${deDia}?`
              : `Cancelar a agenda ${deDia}?`}
          </h4>
          <div id="bm-cancelar-dia-texto" className="text-sm space-y-2">
            {fase.alvo.length ? (
              <p>
                Os pacientes <strong>não pagam multa</strong>. Quem já pagou escolhe entre <strong>reembolso integral</strong> ou{" "}
                <strong>remarcar</strong> sem custo; consultas ainda não pagas são canceladas.
              </p>
            ) : null}
            {fase.reservas > 0 ? (
              <p>
                {fase.reservas === 1
                  ? `1 reserva de remarcação aguardando pagamento para este dia ${fase.alvo.length ? "também " : ""}será liberada (o paciente é avisado e a consulta dele fica na data original).`
                  : `${fase.reservas} reservas de remarcação aguardando pagamento para este dia ${fase.alvo.length ? "também " : ""}serão liberadas (os pacientes são avisados e as consultas ficam na data original).`}
              </p>
            ) : null}
            <p className="text-bion-ink/75 dark:text-bion-paper/75">Consultas que já começaram não são canceladas. Esta ação não pode ser desfeita.</p>
          </div>
          <ul className="text-sm space-y-0.5">
            {fase.alvo.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="truncate">{c.paciente}</span>
                <span className="font-bold tabular-nums">{horaClinica(c.dataISO ?? c.ts)}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFase({ tipo: "lista" })}
              className="py-2.5 rounded-xl text-sm font-bold border border-bion-ink/25 dark:border-white/25"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void executar(fase.alvo)}
              className="py-2.5 rounded-xl text-sm font-bold bg-red-700 text-white hover:bg-red-800 dark:bg-red-300 dark:text-zinc-950 dark:hover:bg-red-200"
            >
              Sim, cancelar o dia
            </button>
          </div>
        </div>
      ) : null}

      {fase.tipo === "executando" ? (
        <div className="rounded-2xl border border-bion-ink/15 dark:border-white/15 p-4" role="status" aria-live="polite">
          <div className="text-sm font-bold inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />
            {fase.etapa === "reservas" ? "Liberando reservas aguardando pagamento…" : `Cancelando ${fase.feitas} de ${fase.alvo.length}…`}
          </div>
          {fase.alvo.length ? (
            <progress className="w-full mt-2 accent-red-700" max={fase.alvo.length} value={fase.feitas} aria-label="Progresso do cancelamento" />
          ) : null}
          <p className="text-xs mt-1 text-bion-ink/70 dark:text-bion-paper/70">Não feche esta tela até terminar.</p>
        </div>
      ) : null}

      {fase.tipo === "resultado" ? (
        <div className="rounded-2xl border border-bion-ink/15 dark:border-white/15 p-4 space-y-2" role="status" aria-live="polite">
          <h4 ref={tituloResultadoRef} tabIndex={-1} className="text-sm font-black inline-flex items-center gap-2 outline-none">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
            {fase.canceladas} {fase.canceladas === 1 ? "consulta cancelada" : "consultas canceladas"}
            {` · ${fase.reservasLiberadas} ${fase.reservasLiberadas === 1 ? "reserva liberada" : "reservas liberadas"}`}
            {fase.falhas.length ? ` · ${fase.falhas.length} com falha` : ""}
          </h4>
          {fase.erroReservas ? (
            <p className="text-sm text-red-700 dark:text-red-300">Reservas aguardando pagamento não foram liberadas: {fase.erroReservas}</p>
          ) : null}
          {fase.falhas.length ? (
            <ul className="text-sm space-y-1" aria-label="Consultas que não foram canceladas">
              {fase.falhas.map((f) => (
                <li key={f.consulta.id} className="text-red-700 dark:text-red-300">
                  <span className="font-bold tabular-nums">{horaClinica(f.consulta.dataISO ?? f.consulta.ts)}</span> {f.consulta.paciente}: {f.erro}
                </li>
              ))}
            </ul>
          ) : !fase.erroReservas ? (
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Os pacientes foram avisados pelo app.</p>
          ) : null}
          <button type="button" onClick={() => setFase({ tipo: "lista" })} className="text-sm font-bold text-bion-sea dark:text-sky-300 underline underline-offset-2">
            {fase.falhas.length || fase.erroReservas ? "Voltar à agenda (tente de novo o que falhou)" : "Voltar à agenda"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

const ROTULO_SLOT: Record<SlotAgenda["estado"], string> = {
  livre: "Livre",
  ocupado: "Ocupado",
  reservado: "Reservado",
  encerrada: "Liberado",
};

function LinhaSlot({ slot, agora, falhasTecnicas }: { slot: SlotAgenda; agora: number; falhasTecnicas: ReadonlySet<string> }) {
  const cor =
    slot.estado === "ocupado"
      ? "bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
      : slot.estado === "reservado"
        ? "bg-amber-500/20 text-amber-900 dark:text-amber-100"
        : "bg-bion-ink/8 dark:bg-white/10";
  return (
    <li className="rounded-2xl border border-bion-ink/10 dark:border-white/10 px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-black tabular-nums w-12 shrink-0">{slot.hora}</span>
        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${cor}`}>{ROTULO_SLOT[slot.estado]}</span>
        <span className="text-sm truncate min-w-0">
          {slot.consultas.length
            ? slot.consultas.map((c) => `${c.paciente} (${rotuloStatusMedico(c, falhasTecnicas)})`).join(" · ")
            : slot.reservadoPor
              ? `Remarcação de ${slot.reservadoPor.paciente}`
              : ""}
        </span>
      </div>
      {slot.consultas.map((c) => {
        const r = reservaVigente(c, agora);
        return r ? (
          <p key={c.id} className="mt-1.5 text-xs font-semibold rounded-xl px-2.5 py-1.5 bg-amber-500/15 text-amber-900 dark:text-amber-100">
            {textoReservaPendente(r)}
          </p>
        ) : null;
      })}
      {slot.reservadoPor && slot.expiraEm ? (
        <p className="mt-1.5 text-xs text-bion-ink/75 dark:text-bion-paper/75">
          Novo horário reservado por {slot.reservadoPor.paciente}, aguardando pagamento até {horaClinica(slot.expiraEm)}. A consulta continua em{" "}
          {slot.reservadoPor.data} às {slot.reservadoPor.hora} até o pagamento.
        </p>
      ) : null}
    </li>
  );
}

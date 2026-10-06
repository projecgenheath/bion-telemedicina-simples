"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, CalendarX2, CheckCircle2, Loader2, LockOpen, UserX, WifiOff } from "lucide-react";
import { useBion, type Consulta, type Medico } from "@/lib/bion-store";
import { diaFusoClinica, instanteFusoClinica } from "@/lib/bion-tipos";
import {
  agendaDoDia,
  consultasCancelaveisDoDia,
  ehDoMedico,
  desfechosSistema,
  reservaVigente,
  reservasNoDia,
  rotuloStatusMedico,
  STATUS_ATIVOS,
  type DesfechoSistema,
  diaDaConsulta,
  horaClinica,
  podeMarcarDesfechoNaAgenda,
  prazoDesfecho,
  textoReservaPendente,
  type EventoMedico,
  type SlotAgenda,
} from "../metricas";
import { avisarDadosMedicoAlterados, useBloqueiosAgenda } from "../useDadosMedico";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORIZONTE_DIAS = 14;
const MOTIVO_CANCELAR_DIA = "Agenda do dia cancelada pelo médico";
/** Bloqueio de dia: até 365 dias à frente; motivo (privado) até 120 caracteres — mesmas regras do servidor. */
const HORIZONTE_BLOQUEIO_DIAS = 365;
const MOTIVO_BLOQUEIO_MAX = 120;

type Falha = { consulta: Consulta; erro: string };
/** Desfecho marcado pela agenda (regras do Alisson, 06/10/2026). */
type TipoDesfecho = "falta_paciente" | "falha_tecnica";
type Marcacao = { consultaId: string; tipo: TipoDesfecho; etapa: "confirmar" | "enviando" | "erro" | "feito"; erro?: string };
type Fase =
  | { tipo: "lista" }
  | { tipo: "confirmar"; alvo: Consulta[]; reservas: number }
  | { tipo: "executando"; alvo: Consulta[]; feitas: number; etapa: "reservas" | "consultas" }
  | { tipo: "resultado"; canceladas: number; reservasLiberadas: number; erroReservas: string | null; falhas: Falha[] }
  /** Bloquear o dia: `consultasServidor` vem do 409 quando o servidor achou consultas que a tela não tinha. */
  | { tipo: "confirmarBloqueio"; alvo: Consulta[]; reservas: number; consultasServidor?: number }
  | { tipo: "confirmarDesbloqueio" }
  | { tipo: "salvandoBloqueio"; acao: "bloquear" | "desbloquear" }
  | {
      tipo: "resultadoBloqueio";
      acao: "bloquear" | "desbloquear";
      canceladas: number;
      reservasLiberadas: number;
      erro: string | null;
    };

type RespostaBloqueio = {
  erro?: string;
  consultas?: number;
  reservas?: number;
  canceladas?: number;
  reservasLiberadas?: number;
};

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
  const bloqueios = useBloqueiosAgenda();
  const bloqueioDia = bloqueios.porDia.get(dia);
  const [motivoBloqueio, setMotivoBloqueio] = useState("");
  const limiteBloqueioIso = diaFusoClinica(HORIZONTE_BLOQUEIO_DIAS).iso;
  const podeBloquear = !diaPassado && !bloqueioDia && dia <= limiteBloqueioIso;

  // Falhas técnicas / faltas do médico do dia escolhido (eventos do servidor; a falta já vem no bootstrap).
  const [desfechos, setDesfechos] = useState<ReadonlyMap<string, DesfechoSistema>>(() => new Map());
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
        if (!ctrl.signal.aborted && res.ok && json?.eventos) setDesfechos(desfechosSistema(json.eventos));
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
          bloqueado: bloqueios.porDia.has(d.iso),
        };
      }),
    [minhas, bloqueios.porDia],
  );
  const slots = useMemo(
    () => agendaDoDia(minhas, dia, medico.horariosDisponiveis, agora, !!bloqueioDia),
    [minhas, dia, medico.horariosDisponiveis, agora, bloqueioDia],
  );
  const cancelaveis = useMemo(() => consultasCancelaveisDoDia(minhas, dia, agora), [minhas, dia, agora]);
  const reservasDia = useMemo(() => reservasNoDia(minhas, dia, agora), [minhas, dia, agora]);
  const podeCancelar = !diaPassado && (cancelaveis.length > 0 || reservasDia.length > 0);
  const rotuloDia = dias.find((d) => d.iso === dia)?.rotulo ?? `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  /** "hoje" · "amanhã" · "em 05/10" — para as frases. */
  const quandoDia = rotuloDia === "Hoje" ? "hoje" : rotuloDia === "Amanhã" ? "amanhã" : `em ${rotuloDia}`;
  const deDia = rotuloDia === "Hoje" ? "de hoje" : rotuloDia === "Amanhã" ? "de amanhã" : `de ${rotuloDia}`;
  const ocupado = fase.tipo === "executando" || fase.tipo === "salvandoBloqueio";

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

  const pedirBloqueio = () => {
    const t = Date.now();
    setAgora(t);
    if (dia < diaFusoClinica(0).iso || bloqueios.porDia.has(dia)) return;
    setMotivoBloqueio("");
    setFase({
      tipo: "confirmarBloqueio",
      alvo: consultasCancelaveisDoDia(minhas, dia, t),
      reservas: reservasNoDia(minhas, dia, t).length,
    });
  };

  // Botões "Paciente não compareceu" / "Falha técnica": dependem da hora.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [marcacao, setMarcacao] = useState<Marcacao | null>(null);

  /** POST /api/medico/consultas/[id]/desfecho — o servidor confere presença, prazo e desfecho. */
  const marcarDesfecho = async (m: Marcacao) => {
    if (rodando.current) return;
    rodando.current = true;
    onExecutando(true);
    setMarcacao({ ...m, etapa: "enviando" });
    let erro: string | null = null;
    try {
      const res = await fetch(`/api/medico/consultas/${encodeURIComponent(m.consultaId)}/desfecho`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: m.tipo }),
      });
      const json = (await res.json().catch(() => null)) as ({ erro?: string } & Record<string, unknown>) | null;
      if (!res.ok) erro = json?.erro ?? `Erro ${res.status}`;
      else aplicarDelta(json);
    } catch {
      erro = "Falha de conexão com o servidor.";
    }
    if (!erro) avisarDadosMedicoAlterados();
    setAgora(Date.now());
    setMarcacao(erro ? { ...m, etapa: "erro", erro } : { ...m, etapa: "feito" });
    rodando.current = false;
    onExecutando(false);
  };

  const recarregarEstado = async () => {
    try {
      const res = await fetch("/api/bootstrap", { headers: { "Content-Type": "application/json" } });
      if (res.ok) aplicarEstadoFresco(await res.json());
    } catch {
      /* o polling do store cobre */
    }
  };

  const terminarBloqueio = (r: Extract<Fase, { tipo: "resultadoBloqueio" }>) => {
    avisarDadosMedicoAlterados();
    setAgora(Date.now());
    setFase(r);
    rodando.current = false;
    onExecutando(false);
    requestAnimationFrame(() => tituloResultadoRef.current?.focus());
  };

  /** POST /api/medico/agenda/bloqueios — grava o bloqueio e (se houver) cancela as consultas/reservas do dia no servidor. */
  const executarBloqueio = async (f: Extract<Fase, { tipo: "confirmarBloqueio" }>) => {
    if (rodando.current) return;
    rodando.current = true;
    onExecutando(true);
    setFase({ tipo: "salvandoBloqueio", acao: "bloquear" });
    const cancelarConsultas = (f.consultasServidor ?? f.alvo.length) > 0 || f.reservas > 0;
    let json: RespostaBloqueio | null = null;
    let status = 0;
    try {
      const res = await fetch("/api/medico/agenda/bloqueios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dia, motivo: motivoBloqueio.trim().slice(0, MOTIVO_BLOQUEIO_MAX), cancelarConsultas }),
      });
      status = res.status;
      json = (await res.json().catch(() => null)) as RespostaBloqueio | null;
    } catch {
      json = { erro: "Falha de conexão com o servidor." };
    }
    if (status === 409 && typeof json?.consultas === "number" && !cancelarConsultas) {
      // O servidor achou consultas/reservas que a tela ainda não mostrava: pede a confirmação de novo.
      rodando.current = false;
      onExecutando(false);
      await recarregarEstado();
      setFase({ ...f, reservas: json.reservas ?? 0, consultasServidor: json.consultas });
      return;
    }
    if (status < 200 || status >= 300) {
      terminarBloqueio({
        tipo: "resultadoBloqueio",
        acao: "bloquear",
        canceladas: 0,
        reservasLiberadas: 0,
        erro: json?.erro ?? `Erro ${status}`,
      });
      return;
    }
    const canceladas = json?.canceladas ?? 0;
    const reservasLiberadas = json?.reservasLiberadas ?? 0;
    if (canceladas || reservasLiberadas) await recarregarEstado();
    terminarBloqueio({ tipo: "resultadoBloqueio", acao: "bloquear", canceladas, reservasLiberadas, erro: null });
  };

  /** DELETE /api/medico/agenda/bloqueios?dia= — não restaura consultas canceladas. */
  const executarDesbloqueio = async () => {
    if (rodando.current) return;
    rodando.current = true;
    onExecutando(true);
    setFase({ tipo: "salvandoBloqueio", acao: "desbloquear" });
    let erro: string | null = null;
    try {
      const res = await fetch(`/api/medico/agenda/bloqueios?dia=${encodeURIComponent(dia)}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { erro?: string } | null;
        erro = json?.erro ?? `Erro ${res.status}`;
      }
    } catch {
      erro = "Falha de conexão com o servidor.";
    }
    terminarBloqueio({ tipo: "resultadoBloqueio", acao: "desbloquear", canceladas: 0, reservasLiberadas: 0, erro });
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
              {d.bloqueado ? " · Bloqueado" : d.ativas ? ` · ${d.ativas}` : ""}
              <span className="sr-only">
                {d.bloqueado && d.ativas ? `, ${d.ativas} consultas ativas` : d.bloqueado ? "" : d.ativas ? ` consultas ativas` : " sem consultas ativas"}
              </span>
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

      {bloqueioDia && fase.tipo === "lista" ? (
        <div className="rounded-2xl border-2 border-bion-ink/25 dark:border-white/25 p-3 space-y-2">
          <p className="text-sm font-black inline-flex items-center gap-2">
            <Ban className="w-4 h-4" aria-hidden /> Dia bloqueado
          </p>
          <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">
            Você não atende {quandoDia}: os pacientes não conseguem agendar nem remarcar para este dia.
            {bloqueioDia.motivo ? ` Motivo (só você vê): ${bloqueioDia.motivo}.` : ""}
          </p>
          {!diaPassado ? (
            <button
              type="button"
              onClick={() => setFase({ tipo: "confirmarDesbloqueio" })}
              className="py-2 px-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 border border-bion-ink/25 dark:border-white/25"
            >
              <LockOpen className="w-4 h-4" aria-hidden /> Desbloquear dia
            </button>
          ) : null}
        </div>
      ) : null}

      {slots.length === 0 ? (
        <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Nenhum horário nem consulta neste dia.</p>
      ) : (
        <ul className="space-y-1.5" aria-label={`Horários de ${rotuloDia}`}>
          {slots.map((s) => (
            <LinhaSlot
              key={s.hora}
              slot={s}
              agora={agora}
              desfechos={desfechos}
              marcacao={marcacao}
              ocupado={ocupado || marcacao?.etapa === "enviando"}
              onPedir={(consultaId, tipo) => setMarcacao({ consultaId, tipo, etapa: "confirmar" })}
              onConfirmar={(m) => void marcarDesfecho(m)}
              onFechar={() => setMarcacao(null)}
            />
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
          {!diaPassado && !bloqueioDia ? (
            <>
              <button
                type="button"
                onClick={pedirBloqueio}
                disabled={!podeBloquear}
                className="w-full py-3 rounded-2xl text-sm font-bold inline-flex items-center justify-center gap-2 border-2 border-bion-ink/25 dark:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Ban className="w-4 h-4" aria-hidden /> Bloquear o dia (não atender)
              </button>
              {dia > limiteBloqueioIso ? (
                <p className="text-xs text-bion-ink/70 dark:text-bion-paper/70">Dá para bloquear no máximo {HORIZONTE_BLOQUEIO_DIAS} dias à frente.</p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {fase.tipo === "confirmarBloqueio" ? (
        (() => {
          const nConsultas = fase.consultasServidor ?? fase.alvo.length;
          const cancela = nConsultas > 0 || fase.reservas > 0;
          return (
            <div
              role="alertdialog"
              aria-labelledby="bm-bloquear-dia-titulo"
              aria-describedby="bm-bloquear-dia-texto"
              className={`rounded-2xl border-2 p-4 space-y-3 ${cancela ? "border-red-700 dark:border-red-300" : "border-bion-ink/25 dark:border-white/25"}`}
            >
              <h4 id="bm-bloquear-dia-titulo" className="text-base font-black inline-flex items-center gap-2">
                {cancela ? <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-300" aria-hidden /> : <Ban className="w-5 h-5" aria-hidden />}
                {cancela ? "Cancelar e bloquear o dia" : `Bloquear o dia ${rotuloDia === "Hoje" || rotuloDia === "Amanhã" ? rotuloDia.toLowerCase() : rotuloDia}?`}
              </h4>
              <div id="bm-bloquear-dia-texto" className="text-sm space-y-2">
                <p>Os pacientes não vão conseguir agendar nem remarcar para {quandoDia}. Você pode desbloquear depois.</p>
                {nConsultas > 0 ? (
                  <p>
                    {nConsultas === 1 ? "1 consulta será cancelada" : `${nConsultas} consultas serão canceladas`}: os pacientes{" "}
                    <strong>não pagam multa</strong>. Quem já pagou escolhe entre <strong>reembolso integral</strong> ou{" "}
                    <strong>remarcar</strong> sem custo; consultas ainda não pagas são canceladas. Desbloquear o dia não desfaz isso.
                  </p>
                ) : null}
                {fase.reservas > 0 ? (
                  <p>
                    {fase.reservas === 1
                      ? "1 reserva de remarcação aguardando pagamento para este dia será liberada (o paciente é avisado)."
                      : `${fase.reservas} reservas de remarcação aguardando pagamento para este dia serão liberadas (os pacientes são avisados).`}
                  </p>
                ) : null}
              </div>
              {fase.alvo.length ? (
                <ul className="text-sm space-y-0.5">
                  {fase.alvo.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <span className="truncate">{c.paciente}</span>
                      <span className="font-bold tabular-nums">{horaClinica(c.dataISO ?? c.ts)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="block text-sm">
                <span className="font-bold">Motivo (opcional, só você vê)</span>
                <input
                  type="text"
                  value={motivoBloqueio}
                  maxLength={MOTIVO_BLOQUEIO_MAX}
                  onChange={(e) => setMotivoBloqueio(e.target.value)}
                  placeholder="Ex.: férias, congresso"
                  className="mt-1 w-full rounded-xl border border-bion-ink/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                />
              </label>
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
                  onClick={() => void executarBloqueio(fase)}
                  className={`py-2.5 rounded-xl text-sm font-bold ${
                    cancela
                      ? "bg-red-700 text-white hover:bg-red-800 dark:bg-red-300 dark:text-zinc-950 dark:hover:bg-red-200"
                      : "bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                  }`}
                >
                  {cancela ? "Cancelar e bloquear o dia" : "Bloquear o dia"}
                </button>
              </div>
            </div>
          );
        })()
      ) : null}

      {fase.tipo === "confirmarDesbloqueio" ? (
        <div role="alertdialog" aria-labelledby="bm-desbloquear-dia-titulo" className="rounded-2xl border-2 border-bion-ink/25 dark:border-white/25 p-4 space-y-3">
          <h4 id="bm-desbloquear-dia-titulo" className="text-base font-black inline-flex items-center gap-2">
            <LockOpen className="w-5 h-5" aria-hidden /> Desbloquear {quandoDia}?
          </h4>
          <p className="text-sm">
            Os horários da sua grade voltam a ficar disponíveis para os pacientes. Consultas canceladas no bloqueio não voltam.
          </p>
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
              onClick={() => void executarDesbloqueio()}
              className="py-2.5 rounded-xl text-sm font-bold bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
            >
              Desbloquear dia
            </button>
          </div>
        </div>
      ) : null}

      {fase.tipo === "salvandoBloqueio" ? (
        <div className="rounded-2xl border border-bion-ink/15 dark:border-white/15 p-4" role="status" aria-live="polite">
          <div className="text-sm font-bold inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />
            {fase.acao === "bloquear" ? "Bloqueando o dia…" : "Desbloqueando o dia…"}
          </div>
          <p className="text-xs mt-1 text-bion-ink/70 dark:text-bion-paper/70">Não feche esta tela até terminar.</p>
        </div>
      ) : null}

      {fase.tipo === "resultadoBloqueio" ? (
        <div className="rounded-2xl border border-bion-ink/15 dark:border-white/15 p-4 space-y-2" role="status" aria-live="polite">
          <h4 ref={tituloResultadoRef} tabIndex={-1} className="text-sm font-black inline-flex items-center gap-2 outline-none">
            {fase.erro ? (
              <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-300" aria-hidden />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
            )}
            {fase.erro
              ? fase.acao === "bloquear"
                ? "O dia não foi bloqueado"
                : "O dia não foi desbloqueado"
              : fase.acao === "bloquear"
                ? `Dia bloqueado${fase.canceladas ? ` · ${fase.canceladas} ${fase.canceladas === 1 ? "consulta cancelada" : "consultas canceladas"}` : ""}${
                    fase.reservasLiberadas ? ` · ${fase.reservasLiberadas} ${fase.reservasLiberadas === 1 ? "reserva liberada" : "reservas liberadas"}` : ""
                  }`
                : "Dia desbloqueado"}
          </h4>
          {fase.erro ? (
            <p className="text-sm text-red-700 dark:text-red-300">{fase.erro}</p>
          ) : fase.canceladas || fase.reservasLiberadas ? (
            <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Os pacientes foram avisados pelo app.</p>
          ) : null}
          <button type="button" onClick={() => setFase({ tipo: "lista" })} className="text-sm font-bold text-bion-sea dark:text-sky-300 underline underline-offset-2">
            Voltar à agenda
          </button>
        </div>
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
  bloqueado: "Bloqueado",
};

const TEXTO_DESFECHO: Record<TipoDesfecho, { titulo: string; pergunta: string; efeito: string; feito: string }> = {
  falta_paciente: {
    titulo: "Paciente não compareceu",
    pergunta: "Registrar que o paciente não compareceu?",
    efeito: "Vale se você esperou na sala até 15 min depois do horário e o paciente não entrou. Você recebe normalmente; o paciente é avisado e pode pedir reembolso em até 7 dias.",
    feito: "Falta do paciente registrada. O paciente foi avisado.",
  },
  falha_tecnica: {
    titulo: "Falha técnica",
    pergunta: "Registrar falha técnica?",
    efeito: "A consulta não pôde acontecer. Se estiver paga, o paciente escolhe remarcar sem custo ou o reembolso integral; se não, é cancelada. Você não recebe por ela.",
    feito: "Falha técnica registrada. O paciente foi avisado.",
  },
};

function LinhaSlot({
  slot,
  agora,
  desfechos,
  marcacao,
  ocupado,
  onPedir,
  onConfirmar,
  onFechar,
}: {
  slot: SlotAgenda;
  agora: number;
  desfechos: ReadonlyMap<string, DesfechoSistema>;
  marcacao: Marcacao | null;
  ocupado: boolean;
  onPedir: (consultaId: string, tipo: TipoDesfecho) => void;
  onConfirmar: (m: Marcacao) => void;
  onFechar: () => void;
}) {
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
            ? slot.consultas.map((c) => `${c.paciente} (${rotuloStatusMedico(c, desfechos)})`).join(" · ")
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
      {slot.consultas.map((c) => {
        const m = marcacao?.consultaId === c.id ? marcacao : null;
        const pode = podeMarcarDesfechoNaAgenda(c, agora, desfechos);
        if (!pode && !m) return null;
        if (m && m.etapa !== "feito" && (m.etapa === "confirmar" || m.etapa === "enviando" || m.etapa === "erro")) {
          const t = TEXTO_DESFECHO[m.tipo];
          return (
            <div
              key={c.id}
              role="alertdialog"
              aria-labelledby={`bm-desfecho-${c.id}`}
              aria-describedby={`bm-desfecho-texto-${c.id}`}
              className={`mt-2 rounded-xl border-2 p-3 space-y-2 ${m.tipo === "falha_tecnica" ? "border-amber-600 dark:border-amber-300" : "border-bion-ink/30 dark:border-white/30"}`}
            >
              <p id={`bm-desfecho-${c.id}`} className="text-sm font-black">
                {t.pergunta} <span className="font-semibold">({c.paciente}, {horaClinica(c.dataISO ?? c.ts)})</span>
              </p>
              <p id={`bm-desfecho-texto-${c.id}`} className="text-xs text-bion-ink/75 dark:text-bion-paper/75">
                {t.efeito} Não dá para desfazer.
              </p>
              {m.etapa === "erro" ? (
                <p className="text-xs font-semibold text-red-700 dark:text-red-300" role="alert">{m.erro}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={m.etapa === "enviando"}
                  onClick={onFechar}
                  className="py-2 rounded-xl text-sm font-bold border border-bion-ink/25 dark:border-white/25 disabled:opacity-60"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={m.etapa === "enviando" || !pode}
                  onClick={() => onConfirmar(m)}
                  className={`py-2 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                    m.tipo === "falha_tecnica"
                      ? "bg-amber-700 text-white dark:bg-amber-300 dark:text-zinc-950"
                      : "bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                  }`}
                >
                  {m.etapa === "enviando" ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden /> : null}
                  {m.etapa === "enviando" ? "Registrando…" : "Confirmar"}
                </button>
              </div>
            </div>
          );
        }
        if (m?.etapa === "feito") {
          return (
            <p key={c.id} className="mt-1.5 text-xs font-semibold inline-flex items-center gap-1.5" role="status">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" aria-hidden /> {TEXTO_DESFECHO[m.tipo].feito}
            </p>
          );
        }
        return (
          <div key={c.id} className="mt-2 space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onPedir(c.id, "falta_paciente")}
                className="py-2 px-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 border border-bion-ink/25 dark:border-white/25 disabled:opacity-60"
              >
                <UserX className="w-4 h-4 shrink-0" aria-hidden /> Paciente não compareceu
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onPedir(c.id, "falha_tecnica")}
                className="py-2 px-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 border border-amber-600/60 text-amber-900 dark:border-amber-300/60 dark:text-amber-100 disabled:opacity-60"
              >
                <WifiOff className="w-4 h-4 shrink-0" aria-hidden /> Falha técnica
              </button>
            </div>
            <p className="text-[11px] text-bion-ink/70 dark:text-bion-paper/70">
              {c.paciente}: dá para marcar até {horaClinica(prazoDesfecho(c.dataISO ?? c.ts))} de hoje.
            </p>
          </div>
        );
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

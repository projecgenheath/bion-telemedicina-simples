"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Loader2, LogOut, UserX, WifiOff, X } from "lucide-react";
import { ModalBion } from "@/components/bion/ModalBion";

/** Estado vindo de GET /api/medico/consultas/[id]/desfecho. */
export type EstadoDesfecho = {
  consultaId: string;
  status: string;
  dataInicio: string;
  prazo: string;
  agora: string;
  pacienteEsteve: boolean;
  medicoEntrouEm: string | null;
  falta: { pode: boolean; liberaEm: string | null; mensagem: string | null };
  desfecho: { tipo: string; motivo: string; por: string } | null;
};

export type EscolhaEncerrar = "concluir" | "falta_paciente" | "falha_tecnica" | "sair";

const ROTULO_DESFECHO: Record<string, string> = {
  falta_paciente: "Falta do paciente",
  falha_tecnica: "Falha técnica",
};

const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Escolha ao encerrar a sala (só o MÉDICO). Regras do Alisson (06/10/2026):
 *  - paciente nunca entrou depois do horário: "Paciente não compareceu"
 *    (desativado com contagem até o horário + 15 min), "Falha técnica" ou
 *    "Sair sem concluir" — NUNCA concluir (o servidor também recusa);
 *  - paciente presente (ou entrou e a conexão caiu): "Concluir" ou "Falha técnica".
 * O servidor confere tudo de novo; uma recusa (409) aparece aqui.
 */
export function EncerrarAtendimento({
  aberto,
  consultaId,
  outroOnline,
  onFechar,
  onEscolher,
}: {
  aberto: boolean;
  consultaId: string | undefined;
  /** Presença do paciente vista pelo cliente agora (complementa o servidor). */
  outroOnline: boolean;
  onFechar: () => void;
  /** Executa a escolha; devolve uma mensagem de erro (recusa do servidor) ou null. */
  onEscolher: (escolha: EscolhaEncerrar) => Promise<string | null>;
}) {
  const [estado, setEstado] = useState<EstadoDesfecho | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<EscolhaEncerrar | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  /** Diferença relógio do servidor − relógio do aparelho (contagem certa mesmo com o relógio do celular adiantado). */
  const [desvio, setDesvio] = useState(0);

  const carregar = useCallback(async () => {
    if (!consultaId) return;
    setCarregando(true);
    try {
      const res = await fetch(`/api/medico/consultas/${encodeURIComponent(consultaId)}/desfecho`, {
        headers: { "Content-Type": "application/json" },
      });
      const json = (await res.json().catch(() => null)) as (EstadoDesfecho & { erro?: string }) | null;
      if (!res.ok || !json) {
        setErro(json?.erro ?? "Não foi possível conferir a sala agora.");
      } else {
        setDesvio(Date.parse(json.agora) - Date.now());
        setEstado(json);
        setErro(null);
      }
    } catch {
      setErro("Falha de conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }, [consultaId]);

  useEffect(() => {
    if (!aberto) return;
    setEnviando(null);
    void carregar();
  }, [aberto, carregar]);

  useEffect(() => {
    if (!aberto) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [aberto]);

  const liberaEm = estado?.falta.liberaEm ? Date.parse(estado.falta.liberaEm) : null;
  const faltaMs = liberaEm === null ? 0 : liberaEm - (agora + desvio);
  // A contagem chegou a zero: confirma com o servidor (que decide).
  const pediuNoZero = useRef(false);
  useEffect(() => {
    if (!aberto || !estado || estado.falta.pode || liberaEm === null) return;
    if (faltaMs > 0) {
      pediuNoZero.current = false;
      return;
    }
    if (pediuNoZero.current) return;
    pediuNoZero.current = true;
    void carregar();
  }, [aberto, estado, liberaEm, faltaMs, carregar]);

  const escolher = async (e: EscolhaEncerrar) => {
    if (enviando) return;
    setEnviando(e);
    setErro(null);
    const msg = await onEscolher(e);
    if (msg) {
      setErro(msg);
      setEnviando(null);
      void carregar();
    }
  };

  const comPaciente = !!estado?.pacienteEsteve || outroOnline;
  const desfecho = estado?.desfecho ?? null;
  const encerrada = estado && !["confirmada", "em_espera", "pendente_anamnese"].includes(estado.status);
  const ocupado = enviando !== null;

  const botaoBase =
    "w-full text-left rounded-2xl border p-4 flex items-start gap-3 transition disabled:opacity-55 disabled:cursor-not-allowed";

  return (
    <ModalBion
      aberto={aberto}
      onFechar={() => (ocupado ? undefined : onFechar())}
      titulo="Encerrar atendimento"
      largura="max-w-md"
      overlay="bg-black/70 backdrop-blur-sm"
      foraFecha={false}
      className="py-4"
    >
      <div className="bg-card text-foreground border rounded-3xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto" data-bm-encerrar>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Encerrar atendimento</h3>
          <button type="button" onClick={onFechar} disabled={ocupado} className="text-muted-foreground" aria-label="Voltar à chamada">
            <X className="w-5 h-5" />
          </button>
        </div>

        {carregando && !estado ? (
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2" role="status">
            <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden /> Conferindo a sala…
          </p>
        ) : null}

        {estado && (desfecho || encerrada) ? (
          <>
            <p className="text-sm">
              {desfecho
                ? `Esta consulta já tem desfecho registrado: ${ROTULO_DESFECHO[desfecho.tipo] ?? desfecho.tipo}${desfecho.por === "sistema" ? " (pelo sistema)" : ""}.`
                : estado.status === "concluida"
                  ? "Esta consulta já foi concluída."
                  : "Esta consulta não está mais ativa."}
            </p>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void escolher("sair")}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm"
            >
              Sair da sala
            </button>
          </>
        ) : null}

        {estado && !desfecho && !encerrada ? (
          <>
            <p className="text-sm text-muted-foreground">
              {comPaciente
                ? "O paciente entrou na sala. Como terminou o atendimento?"
                : "O paciente não entrou na sala depois do horário. A consulta não pode ser concluída sem ele."}
            </p>

            <div className="space-y-2.5">
              {comPaciente ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void escolher("concluir")}
                  className={`${botaoBase} border-emerald-600/40 bg-emerald-600/10 hover:bg-emerald-600/15`}
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-700 dark:text-emerald-400 mt-0.5" aria-hidden />
                  <span>
                    <span className="block text-sm font-bold">{enviando === "concluir" ? "Concluindo…" : "Concluir consulta"}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      O atendimento aconteceu (mesmo que a conexão tenha caído no fim). Você recebe normalmente.
                    </span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={ocupado || !estado.falta.pode}
                  onClick={() => void escolher("falta_paciente")}
                  className={`${botaoBase} border-border hover:bg-muted`}
                  aria-describedby="bm-falta-ajuda"
                >
                  <UserX className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    <span className="block text-sm font-bold">
                      {enviando === "falta_paciente" ? "Registrando…" : "Paciente não compareceu"}
                    </span>
                    <span id="bm-falta-ajuda" className="block text-xs text-muted-foreground mt-0.5">
                      {estado.falta.pode
                        ? "Você recebe normalmente. O paciente pode pedir reembolso em até 7 dias."
                        : liberaEm !== null && faltaMs > 0
                          ? `Disponível às ${fmtHora.format(liberaEm)}, 15 min depois do horário.`
                          : (estado.falta.mensagem ?? "Ainda não disponível.")}
                    </span>
                    {!estado.falta.pode && liberaEm !== null && faltaMs > 0 ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold tabular-nums" role="timer" aria-live="off">
                        <Clock className="w-3.5 h-3.5" aria-hidden /> Faltam {mmss(faltaMs)}
                      </span>
                    ) : null}
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={ocupado || agora + desvio < Date.parse(estado.dataInicio)}
                onClick={() => void escolher("falha_tecnica")}
                className={`${botaoBase} border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15`}
              >
                <WifiOff className="w-5 h-5 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" aria-hidden />
                <span>
                  <span className="block text-sm font-bold">{enviando === "falha_tecnica" ? "Registrando…" : "Falha técnica"}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    A consulta não pôde acontecer. O paciente remarca sem custo ou recebe o valor de volta, e você não recebe por ela.
                  </span>
                </span>
              </button>

              {!comPaciente ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void escolher("sair")}
                  className={`${botaoBase} border-border hover:bg-muted`}
                >
                  <LogOut className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    <span className="block text-sm font-bold">Sair sem concluir</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Nada é registrado agora. Dá para marcar pela agenda até {fmtHora.format(Date.parse(estado.prazo))} de hoje.
                    </span>
                  </span>
                </button>
              ) : null}
            </div>

            <button
              type="button"
              disabled={ocupado}
              onClick={onFechar}
              className="w-full text-center text-sm font-bold text-primary underline underline-offset-2"
            >
              Voltar à chamada
            </button>
          </>
        ) : null}

        {erro ? (
          <p className="text-sm font-semibold text-red-700 dark:text-red-400" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </ModalBion>
  );
}

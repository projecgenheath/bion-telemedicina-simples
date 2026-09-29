import { db } from "@/lib/db";
import type { FonteLlm } from "@/lib/server/llm";

export type EventoLlm = {
  ts: number;
  ok: boolean;
  ms: number;
  fonte: FonteLlm | null;
  modelo: string | null;
  textoLen: number;
  http: number | null;
  finish: string | null;
  erro: string | null;
};

const MAX = 200;
const _buf: EventoLlm[] = [];

export function registrarTurnoLlm(e: EventoLlm) {
  _buf.push(e);
  if (_buf.length > MAX) _buf.shift();
  void persistir(e);
}

export function eventosLlmMemoria(): EventoLlm[] {
  return _buf.slice().reverse();
}

async function persistir(e: EventoLlm) {
  try {
    await db.auditLog.create({
      data: {
        acao: "LLM_TURNO",
        categoria: "sistema",
        severidade: e.ok ? "info" : "warning",
        usuarioNome: "BION IA",
        role: "sistema",
        entidade: "llm",
        detalhes: JSON.stringify(e),
      },
    });
  } catch {
    // monitoramento não pode derrubar o chat
  }
}

export function resumir(eventos: EventoLlm[]) {
  const n = eventos.length;
  const oks = eventos.filter((e) => e.ok);
  const falhas = n - oks.length;
  const tempos = [...eventos.map((e) => e.ms)].sort((a, b) => a - b);
  const pct = (p: number) => (tempos.length ? tempos[Math.min(tempos.length - 1, Math.floor((p / 100) * (tempos.length - 1)))] : 0);
  const media = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;
  return {
    turnos: n,
    ok: oks.length,
    falhas,
    taxaOk: n ? Math.round((oks.length / n) * 100) : 0,
    msMedia: media,
    msP50: pct(50),
    msP95: pct(95),
    modelos: Array.from(new Set(eventos.map((e) => e.modelo).filter(Boolean))),
  };
}

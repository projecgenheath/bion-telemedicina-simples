/**
 * Espera do médico — regras PURAS (sem banco), usadas pelo servidor
 * (lib/server/espera-medico.ts), pelas rotas e pelos testes.
 *
 * Contrato combinado no grupo (19/10/2026):
 *  - a espera começa quando o paciente atende (atendidaPacienteEm);
 *  - expiraEm = max(horário marcado, atendidaPacienteEm) + 10 min;
 *  - termina como `medico_entrou` quando o médico atende (atendidaMedicoEm);
 *  - expirada: o paciente escolhe cancelar (reembolso integral) ou remarcar
 *    com outro médico livre agora (diferença cobrada ou devolvida).
 */

export const ESPERA_MEDICO_MIN = 10;
/** Reserva da consulta nova enquanto o paciente paga a diferença (10 min, combinado no grupo; a do #13 é 15). */
export const RESERVA_DIFERENCA_MIN = 10;

export const STATUS_ESPERA = ["aguardando", "medico_entrou", "expirada", "remarcando", "cancelada", "remarcada"] as const;
export type StatusEspera = (typeof STATUS_ESPERA)[number];
/** Status finais: a espera tem desfecho. */
export const STATUS_ESPERA_FINAIS: StatusEspera[] = ["medico_entrou", "cancelada", "remarcada"];

/** expiraEm = max(horário marcado, entrada do paciente) + 10 min. */
export function calcularExpiraEm(dataInicio: Date, atendidaPacienteEm: Date): Date {
  const base = Math.max(dataInicio.getTime(), atendidaPacienteEm.getTime());
  return new Date(base + ESPERA_MEDICO_MIN * 60_000);
}

/**
 * Status visto agora: prazo vencido já conta como "expirada" na LEITURA
 * (o job grava depois):
 *  - "aguardando" com expiraEm vencido → "expirada";
 *  - B40: "remarcando" com a reserva da diferença (reservaExpiraEm)
 *    vencida → "expirada" — sem isto, a tela ficava em "Pague a
 *    diferença — 00:00" até o job liberar a reserva.
 * Sem reservaExpiraEm (nada a pagar), "remarcando" não vence por aqui.
 */
export function statusEfetivo(e: { status: string; expiraEm: Date; reservaExpiraEm?: Date | null }, agora: Date): StatusEspera {
  if (e.status === "aguardando" && agora.getTime() >= e.expiraEm.getTime()) return "expirada";
  if (e.status === "remarcando" && e.reservaExpiraEm && agora.getTime() >= e.reservaExpiraEm.getTime()) return "expirada";
  return e.status as StatusEspera;
}

/** Segundos que faltam (0 depois de vencer). */
export function segundosRestantes(expiraEm: Date, agora: Date): number {
  return Math.max(0, Math.ceil((expiraEm.getTime() - agora.getTime()) / 1000));
}

const TRANSICOES: Record<StatusEspera, StatusEspera[]> = {
  aguardando: ["medico_entrou", "expirada"],
  // O médico ainda pode entrar enquanto o paciente não escolheu.
  // remarcando: médico mais caro, esperando o pagamento da diferença.
  expirada: ["medico_entrou", "cancelada", "remarcada", "remarcando"],
  // Pago → remarcada; reserva de 10 min venceu → volta para expirada.
  remarcando: ["remarcada", "expirada"],
  medico_entrou: [],
  cancelada: [],
  remarcada: [],
};

export function transicaoPermitida(de: StatusEspera, para: StatusEspera): boolean {
  return TRANSICOES[de]?.includes(para) ?? false;
}

export type Diferenca = {
  valorAntigoCentavos: number;
  valorNovoCentavos: number;
  /** novo − antigo: > 0 o paciente paga; < 0 recebe de volta. */
  diferencaCentavos: number;
  acao: "cobrar" | "devolver" | "nada";
};

/** Diferença entre o valor pago (antigo) e o do médico novo, em centavos inteiros. */
export function calcularDiferenca(valorAntigoCentavos: number, valorNovoCentavos: number): Diferenca {
  const a = Math.max(0, Math.round(valorAntigoCentavos));
  const n = Math.max(0, Math.round(valorNovoCentavos));
  const d = n - a;
  return { valorAntigoCentavos: a, valorNovoCentavos: n, diferencaCentavos: d, acao: d > 0 ? "cobrar" : d < 0 ? "devolver" : "nada" };
}

/** A diferença que o paciente viu ainda vale? Senão o servidor responde 409 preco_mudou. */
export function conferirDiferencaEsperada(esperada: number, atual: number): { ok: true } | { ok: false; erro: "preco_mudou"; diferencaAtualCentavos: number } {
  return Number.isInteger(esperada) && esperada === atual ? { ok: true } : { ok: false, erro: "preco_mudou", diferencaAtualCentavos: atual };
}

/** Corpo do POST remarcar. */
export function lerPedidoRemarcar(b: unknown): { medicoId: string; diferencaEsperadaCentavos: number } | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  if (typeof o.medicoId !== "string" || !o.medicoId.trim() || o.medicoId.length > 64) return null;
  if (typeof o.diferencaEsperadaCentavos !== "number" || !Number.isInteger(o.diferencaEsperadaCentavos)) return null;
  return { medicoId: o.medicoId.trim(), diferencaEsperadaCentavos: o.diferencaEsperadaCentavos };
}

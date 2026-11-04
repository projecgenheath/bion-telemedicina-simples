/**
 * Campos do Lembrete usados no wire (tipo estrutural, sem depender do tipo
 * gerado do Prisma — que não é gerado neste ambiente e viraria erro TS2305).
 */
export type LembreteWire = {
  id: string;
  titulo: string;
  horario: string;
  tipo: string;
  frequencia: string;
  feito: boolean;
  medicamento: string | null;
};

/** Forma de wire do Lembrete — a mesma que a rota unitária [id]/lembrete devolve. */
export function serializarLembrete(l: LembreteWire) {
  return {
    id: l.id,
    titulo: l.titulo,
    horario: l.horario,
    tipo: l.tipo,
    frequencia: l.frequencia,
    feito: l.feito,
    medicamento: l.medicamento,
  };
}

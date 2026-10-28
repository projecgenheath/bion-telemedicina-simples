import "server-only";
import { db } from "@/lib/db";

export type NotaReal = { avaliacao: number; numAvaliacoes: number };

/**
 * Nota e número de avaliações calculados SÓ a partir das avaliações reais
 * gravadas na tabela `avaliacao`. Os campos `avaliacao`/`numAvaliacoes` do
 * perfil vinham do seed (ex.: 4.9 com 312) e não podem aparecer para o
 * paciente (CDC art. 37). Médico sem avaliação: { 0, 0 }.
 */
export async function notasReais(medicoIds: string[]): Promise<Map<string, NotaReal>> {
  const mapa = new Map<string, NotaReal>();
  for (const id of medicoIds) mapa.set(id, { avaliacao: 0, numAvaliacoes: 0 });
  if (medicoIds.length === 0) return mapa;
  const grupos = await db.avaliacao.groupBy({
    by: ["medicoId"],
    where: { medicoId: { in: medicoIds } },
    _avg: { nota: true },
    _count: { _all: true },
  });
  for (const g of grupos) {
    mapa.set(g.medicoId, {
      avaliacao: Number((g._avg.nota ?? 0).toFixed(1)),
      numAvaliacoes: g._count._all,
    });
  }
  return mapa;
}

export async function notaReal(medicoId: string): Promise<NotaReal> {
  return (await notasReais([medicoId])).get(medicoId)!;
}

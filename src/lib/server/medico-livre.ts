import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { partesNoFuso } from "@/lib/server/fuso";
import { filtroEvolucaoPendente } from "@/lib/medico-livre-logica";

/**
 * Teleconsulta v2 — Médicos: "médico livre agora" (remarcação para outro
 * médico da mesma especialidade). Livre = médico ativo (User e PerfilMedico),
 * com chave PIX cadastrada, sem consulta em andamento, sem evolução em
 * rascunho de OUTRA consulta (trava; o rascunho de `excetoConsultaId` não
 * conta, mesmo critério de evolucaoPendenteDoMedico e toque.ts), sem consulta nos próximos 40 min e fora de 23:00–00:00
 * (São Paulo). A especialidade é filtrada por quem chama.
 */
export const PROXIMA_CONSULTA_MIN = 40;
export const ANDAMENTO_MIN = 60; // consulta iniciada há até 60 min e não encerrada
const STATUS_ENCERRADOS = ["cancelada", "concluida", "aguardando_reagendamento"];

export function foraDoHorarioVedado(agora: Date = new Date()): boolean {
  return partesNoFuso(agora).hora !== 23;
}

export type MotivoOcupado = "inativo" | "sem_pix" | "em_andamento" | "evolucao_pendente" | "consulta_proxima" | "horario_vedado";

export async function motivoMedicoOcupado(
  medicoId: string,
  tx?: Prisma.TransactionClient,
  agora: Date = new Date(),
  excetoConsultaId?: string,
): Promise<MotivoOcupado | null> {
  const cli = tx ?? db;
  if (!foraDoHorarioVedado(agora)) return "horario_vedado";
  const t = agora.getTime();
  const [medico, pix, consulta, evolucao] = await Promise.all([
    cli.user.findFirst({ where: { id: medicoId, role: "MEDICO", status: "ativo", perfilMedico: { status: "ativo" } }, select: { id: true } }),
    cli.dadosRecebimentoMedico.findFirst({ where: { medicoId, pixChave: { not: "" } }, select: { id: true } }),
    cli.consulta.findFirst({
      where: {
        medicoId,
        OR: [
          { status: "em_espera" },
          {
            status: { notIn: STATUS_ENCERRADOS },
            dataInicio: { gte: new Date(t - ANDAMENTO_MIN * 60_000), lt: new Date(t + PROXIMA_CONSULTA_MIN * 60_000) },
          },
        ],
      },
      select: { dataInicio: true },
    }),
    cli.evolucao.findFirst({ where: filtroEvolucaoPendente(medicoId, excetoConsultaId), select: { id: true } }),
  ]);
  if (!medico) return "inativo";
  if (!pix) return "sem_pix";
  if (consulta) return consulta.dataInicio.getTime() > t ? "consulta_proxima" : "em_andamento";
  if (evolucao) return "evolucao_pendente";
  return null;
}

/** Aceita o cliente da transação (o Admin chama dentro da remarcação). */
export async function medicoLivreAgora(
  medicoId: string,
  tx?: Prisma.TransactionClient,
  agora: Date = new Date(),
  excetoConsultaId?: string,
): Promise<boolean> {
  return (await motivoMedicoOcupado(medicoId, tx, agora, excetoConsultaId)) === null;
}

/** Reais (Float) → centavos inteiros, sem erro de arredondamento. */
export function reaisParaCentavos(v: number): number {
  return Math.round((Number.isFinite(v) ? v : 0) * 100);
}

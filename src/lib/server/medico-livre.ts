import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { horarioVedado, diaBloqueado, type ClienteBanco } from "@/lib/server/bloqueio-agenda";
import { STATUS_LIBERAM_HORARIO } from "@/lib/server/financeiro";
import { filtroEvolucaoPendente } from "@/lib/medico-livre-logica";

/**
 * Teleconsulta v2 — Médicos: "médico livre agora" (remarcação para outro
 * médico da mesma especialidade). Livre = médico ativo (User e PerfilMedico),
 * com chave PIX cadastrada, sem consulta em andamento, sem evolução em
 * rascunho de OUTRA consulta (trava; o rascunho de `excetoConsultaId` não
 * conta, mesmo critério de evolucaoPendenteDoMedico e toque.ts), sem consulta
 * nos próximos 40 min, fora de 23:00–00:00 (São Paulo) e sem o dia corrente
 * bloqueado (folga/férias).
 */
export const PROXIMA_CONSULTA_MIN = 40;
export const ANDAMENTO_MIN = 60; // consulta iniciada há até 60 min e não encerrada
// B-28: lista única de statuses que liberam o horário do médico. Antes havia
// DUAS cópias com bordas divergentes (STATUS_ENCERRADOS aqui e
// STATUS_LIBERAM_HORARIO no financeiro) — dois lugares para manter a mesma regra.
export { STATUS_LIBERAM_HORARIO } from "@/lib/server/financeiro";

/**
 * M-20 da auditoria: mesma janela vedada do agendamento (horarioVedado de
 * bloqueio-agenda, que considera a duração de 30 min — 22:31–23:59 fica
 * vedado). Antes era `hora !== 23`, criando faixa (22:31–22:59) em que a
 * lista oferecia médicos que a remarcação recusava.
 */
export function foraDoHorarioVedado(agora: Date = new Date()): boolean {
  return !horarioVedado(agora, agora);
}

export type MotivoOcupado = "inativo" | "sem_pix" | "em_andamento" | "evolucao_pendente" | "consulta_proxima" | "horario_vedado" | "dia_bloqueado";

export async function motivoMedicoOcupado(
  medicoId: string,
  tx?: Prisma.TransactionClient,
  agora: Date = new Date(),
  excetoConsultaId?: string,
): Promise<MotivoOcupado | null> {
  const cli = tx ?? db;
  if (!foraDoHorarioVedado(agora)) return "horario_vedado";
  const t = agora.getTime();
  const [medico, pix, consulta, evolucao, diaOff] = await Promise.all([
    cli.user.findFirst({ where: { id: medicoId, role: "MEDICO", status: "ativo", perfilMedico: { status: "ativo" } }, select: { id: true } }),
    cli.dadosRecebimentoMedico.findFirst({ where: { medicoId, pixChave: { not: "" } }, select: { id: true } }),
    cli.consulta.findFirst({
      where: {
        medicoId,
        OR: [
          { status: "em_espera" },
          {
            status: { notIn: STATUS_LIBERAM_HORARIO },
            dataInicio: { gte: new Date(t - ANDAMENTO_MIN * 60_000), lt: new Date(t + PROXIMA_CONSULTA_MIN * 60_000) },
          },
        ],
      },
      select: { dataInicio: true },
    }),
    cli.evolucao.findFirst({ where: filtroEvolucaoPendente(medicoId, excetoConsultaId), select: { id: true } }),
    // M-20: médico com o dia corrente bloqueado (folga/férias) não aparece
    // como livre — antes a lista oferecia quem a remarcação recusava.
    diaBloqueado(cli as ClienteBanco, medicoId, agora),
  ]);
  if (!medico) return "inativo";
  if (!pix) return "sem_pix";
  if (consulta) return consulta.dataInicio.getTime() > t ? "consulta_proxima" : "em_andamento";
  if (evolucao) return "evolucao_pendente";
  if (diaOff) return "dia_bloqueado";
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

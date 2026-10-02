/**
 * Cancelamento das consultas e reservas de UM dia da agenda do médico —
 * usado ao bloquear o dia (POST /api/medico/agenda/bloqueios).
 *
 * Mesmo comportamento do cancelamento de consulta pelo médico no
 * PATCH /api/consultas/[id] (acao "cancelar", por "medico"):
 * - paga → "aguardando_reagendamento" (o paciente escolhe reembolso integral
 *   ou remarcar sem custo — nenhum dinheiro se move aqui);
 * - não paga → "cancelada";
 * - EventoConsulta tipo "cancelada", por "medico", motivo "agenda_cancelada",
 *   multa 0 (o card do paciente mostra "O médico cancelou este horário");
 * - reserva de remarcação da própria consulta perde a validade
 *   (cancelarReservasPendentes);
 * e, como em POST /api/medico/agenda/cancelar-dia, as reservas aguardando
 * pagamento de OUTRAS consultas do médico para esse dia são liberadas
 * (cancelarReservasDoDia). Tudo numa transação.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { NotifPayload } from "@/lib/server/dados";
import { travarDiaDoMedico, OPCOES_TX_TRAVA, type ClienteBanco } from "@/lib/server/bloqueio-agenda";
import {
  cancelarReservasDoDia,
  cancelarReservasPendentes,
  diaSaoPaulo,
  filtroReservaVigente,
  registrarEvento,
  STATUS_LIBERAM_HORARIO,
} from "@/lib/server/financeiro";
import { fmtDataClinica, quandoClinica } from "@/lib/server/fuso";

/** Texto público do cancelamento (o motivo do bloqueio é privado do médico). */
export const MOTIVO_CANCELAMENTO_DIA = "Agenda do dia cancelada pelo médico";

/** Filtro das consultas do médico que ainda serão canceladas nesse dia (São Paulo). */
export function filtroConsultasDoDia(medicoId: string, instanteNoDia: Date, agora: Date) {
  const { inicio, fim } = diaSaoPaulo(instanteNoDia);
  return {
    medicoId,
    status: { notIn: STATUS_LIBERAM_HORARIO },
    dataInicio: { gte: inicio > agora ? inicio : agora, lt: fim },
  };
}

/** Filtro das reservas vigentes (aguardando pagamento) de consultas do médico para esse dia. */
export function filtroReservasDoDia(medicoId: string, instanteNoDia: Date, agora: Date) {
  const { inicio, fim } = diaSaoPaulo(instanteNoDia);
  return { ...filtroReservaVigente(agora), novaData: { gte: inicio, lt: fim }, consulta: { medicoId } };
}

/**
 * Quantas consultas/reservas seriam afetadas (para a confirmação na UI).
 * Dentro de transação, passe o `tx` (as duas contagens rodam em sequência).
 */
export async function contarAfetadosDoDia(
  client: ClienteBanco,
  medicoId: string,
  instanteNoDia: Date,
  agora: Date = new Date(),
) {
  const consultas = await client.consulta.count({ where: filtroConsultasDoDia(medicoId, instanteNoDia, agora) });
  const reservas = await client.remarcacaoPendente.count({ where: filtroReservasDoDia(medicoId, instanteNoDia, agora) });
  return { consultas, reservas };
}

/**
 * Cancela as consultas futuras do dia e libera as reservas do dia.
 * Devolve as contagens e as notificações para os pacientes (sem o motivo
 * privado do bloqueio).
 * - Com `tx`: roda DENTRO dessa transação (quem chama já tomou a trava do
 *   dia — ex.: bloquearDiaTravado).
 * - Sem `tx`: abre a própria transação e toma a trava (médico, dia).
 */
export async function cancelarConsultasDoDia(
  medicoId: string,
  instanteNoDia: Date,
  agora: Date = new Date(),
  tx?: Prisma.TransactionClient,
) {
  const executar = async (tx: Prisma.TransactionClient) => {
    const consultas = await tx.consulta.findMany({
      where: filtroConsultasDoDia(medicoId, instanteNoDia, agora),
      select: { id: true, pago: true, pacienteId: true, especialidade: true, dataInicio: true },
      orderBy: { dataInicio: "asc" },
    });
    for (const c of consultas) {
      await tx.consulta.update({
        where: { id: c.id },
        data: {
          status: c.pago ? "aguardando_reagendamento" : "cancelada",
          motivoCancelamento: MOTIVO_CANCELAMENTO_DIA,
        },
      });
      await registrarEvento(tx, {
        consultaId: c.id,
        atorId: medicoId,
        tipo: "cancelada",
        por: "medico",
        motivo: "agenda_cancelada",
        dataAnterior: c.dataInicio,
        multaCentavos: 0,
      });
      await cancelarReservasPendentes(tx, c.id);
    }
    // Reservas vigentes de OUTRAS consultas para este dia — para avisar.
    const vigentes = await tx.remarcacaoPendente.findMany({
      where: filtroReservasDoDia(medicoId, instanteNoDia, agora),
      select: { novaData: true, consulta: { select: { pacienteId: true, especialidade: true, dataInicio: true } } },
    });
    await cancelarReservasDoDia(tx, medicoId, instanteNoDia);
    return { canceladas: consultas, reservas: vigentes };
  };
  const { canceladas, reservas } = tx
    ? await executar(tx)
    : await db.$transaction(async (t) => {
        await travarDiaDoMedico(t, medicoId, instanteNoDia);
        return executar(t);
      }, OPCOES_TX_TRAVA);

  const notificacoes: NotifPayload[] = [
    ...canceladas.map((c) => ({
      tipo: "agenda",
      titulo: "Consulta cancelada",
      texto: `${c.especialidade} de ${quandoClinica(c.dataInicio)} foi cancelada. Motivo: ${MOTIVO_CANCELAMENTO_DIA}`,
      usuarioId: c.pacienteId,
    })),
    ...reservas.map((r) => ({
      tipo: "agenda",
      titulo: "Novo horário liberado",
      texto: `O médico cancelou a agenda de ${fmtDataClinica(r.novaData)}. O novo horário que você reservou (${quandoClinica(r.novaData)}) foi liberado; a consulta de ${r.consulta.especialidade} continua em ${quandoClinica(r.consulta.dataInicio)}. Se a multa da remarcação já tiver sido paga, ela volta automaticamente.`,
      usuarioId: r.consulta.pacienteId,
    })),
  ];
  return { canceladas: canceladas.length, reservasLiberadas: reservas.length, notificacoes };
}

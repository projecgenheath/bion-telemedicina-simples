import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { aplicarSideEffects, type NotifPayload } from "@/lib/server/dados";
import { cancelarReservasDoDia, diaSaoPaulo, filtroReservaVigente } from "@/lib/server/financeiro";
import { dataIsoClinica, fmtDataClinica, instanteNoFuso, quandoClinica } from "@/lib/server/fuso";
import { ok, falha } from "@/lib/server/http";

const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * POST /api/medico/agenda/cancelar-dia — body { data: "AAAA-MM-DD" }
 *
 * Parte de "Cancelar agenda do dia" (AgendaDoDia.tsx): libera as reservas de
 * remarcação AGUARDANDO PAGAMENTO (RemarcacaoPendente) de consultas do médico
 * cujo novo horário cai nesse dia, com `cancelarReservasDoDia` (financeiro.ts),
 * dentro de uma transação. Funciona também num dia que só tem reservas.
 * As consultas pagas/confirmadas do dia continuam sendo canceladas uma a uma
 * pelo PATCH /api/consultas/[id] (cancelamento pelo médico: sem multa; quem
 * pagou escolhe reembolso integral ou remarcar sem custo).
 *
 * - Só MEDICO; o médico vem SEMPRE da sessão (nunca do corpo).
 * - `data` é o dia civil em São Paulo; hoje ou qualquer dia futuro (dia
 *   passado → 400).
 * - Idempotente: repetir não cancela nada a mais.
 * Resposta: { dia, reservasLiberadas } (reservas vigentes que foram liberadas).
 */
export async function POST(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const body = (await req.json().catch(() => ({}))) as { data?: unknown };
    const m = typeof body.data === "string" ? DATA_RE.exec(body.data.trim()) : null;
    if (!m) return Response.json({ erro: "Informe o dia no formato AAAA-MM-DD." }, { status: 400 });
    const [ano, mes, diaMes] = [Number(m[1]), Number(m[2]), Number(m[3])];
    // Meio-dia em São Paulo: longe das bordas do dia, qualquer que seja o fuso do servidor.
    const instante = instanteNoFuso(ano, mes, diaMes, 12, 0);
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    if (dataIsoClinica(instante) !== iso) {
      return Response.json({ erro: "Data inválida." }, { status: 400 });
    }
    if (iso < dataIsoClinica(new Date())) {
      return Response.json({ erro: "Não dá para cancelar um dia que já passou." }, { status: 400 });
    }

    const agora = new Date();
    const { inicio, fim } = diaSaoPaulo(instante);
    const liberadas = await db.$transaction(async (tx) => {
      // Reservas vigentes (as que o médico vê como "Reservado") — para contar e avisar.
      const vigentes = await tx.remarcacaoPendente.findMany({
        where: { ...filtroReservaVigente(agora), novaData: { gte: inicio, lt: fim }, consulta: { medicoId: medico.id } },
        select: { novaData: true, consulta: { select: { pacienteId: true, especialidade: true, dataInicio: true } } },
      });
      await cancelarReservasDoDia(tx, medico.id, instante);
      return vigentes;
    });

    if (liberadas.length) {
      const notificacoes: NotifPayload[] = liberadas.map((r) => ({
        tipo: "agenda",
        titulo: "Novo horário liberado",
        texto: `O médico cancelou a agenda de ${fmtDataClinica(r.novaData)}. O novo horário que você reservou (${quandoClinica(r.novaData)}) foi liberado; a consulta de ${r.consulta.especialidade} continua em ${quandoClinica(r.consulta.dataInicio)}. Se a multa da remarcação já tiver sido paga, ela volta automaticamente.`,
        usuarioId: r.consulta.pacienteId,
      }));
      await aplicarSideEffects(medico, notificacoes);
      await registrarAudit(medico, {
        acao: "AGENDA_DIA_RESERVAS_CANCELADAS",
        categoria: "consulta",
        severidade: "warning",
        entidade: "medico",
        entidadeId: medico.id,
        detalhes: `Agenda de ${fmtDataClinica(instante)} cancelada pelo médico — ${liberadas.length} reserva(s) de remarcação aguardando pagamento liberada(s)`,
      });
    }

    return ok({ dia: iso, reservasLiberadas: liberadas.length });
  } catch (erro) {
    return falha(erro);
  }
}

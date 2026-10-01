import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { MULTA_JANELA_HORAS, MULTA_PCT, calcularMulta, type PorEvento } from "@/lib/server/financeiro";

/**
 * GET /api/consultas/[id]/cancelamento — PRÉVIA, somente leitura.
 *
 * Devolve a multa e o prazo sem multa para cancelar e para remarcar, com a
 * MESMA função (calcularMulta) que o PATCH usa ao gravar: a tela nunca
 * recalcula e a prévia nunca diverge do que é cobrado. Também devolve o
 * reembolso mais recente da consulta (para o paciente acompanhar o status).
 * Acesso: paciente dono, médico dono ou admin. Nada é gravado.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { id } = await params;

    const consulta = await db.consulta.findUnique({
      where: { id },
      select: { id: true, pacienteId: true, medicoId: true, status: true, dataInicio: true, valor: true, pago: true },
    });
    if (!consulta) return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });

    const ehAdmin = usuario.role === "ADMIN";
    const ehDonoMedico = consulta.medicoId === usuario.id;
    const ehDonoPaciente = consulta.pacienteId === usuario.id;
    if (!ehDonoPaciente && !ehDonoMedico && !ehAdmin) {
      return Response.json({ erro: "Acesso negado." }, { status: 403 });
    }

    const por: PorEvento = ehAdmin ? "admin" : ehDonoMedico ? "medico" : "paciente";
    const eventos = await db.eventoConsulta.findMany({
      where: { consultaId: id },
      select: { por: true, em: true, dataAnterior: true, motivo: true },
    });
    const previa = calcularMulta({ consulta, eventos, por });
    const encerrada = consulta.status === "cancelada" || consulta.status === "concluida";

    const reembolso = await db.reembolso.findFirst({
      where: { pagamento: { consultaId: id } },
      orderBy: { criadoEm: "desc" },
      select: { status: true, valorCentavos: true, multaCentavos: true, criadoEm: true, processadoEm: true },
    });

    return ok({
      regra: { multaPct: MULTA_PCT, janelaHoras: MULTA_JANELA_HORAS },
      status: consulta.status,
      podeCancelar: !encerrada,
      podeRemarcar: !encerrada && por !== "medico",
      // Cancelar: multa sai do valor devolvido (só há reembolso se pagou).
      cancelar: previa,
      // Remarcar: mesma multa; não há reembolso (a consulta continua).
      remarcar: { ...previa, reembolsoCentavos: 0 },
      reembolso: reembolso
        ? {
            status: reembolso.status,
            valorCentavos: reembolso.valorCentavos,
            multaCentavos: reembolso.multaCentavos,
            criadoEm: reembolso.criadoEm.toISOString(),
            processadoEm: reembolso.processadoEm?.toISOString() ?? null,
          }
        : null,
    });
  } catch (erro) {
    return falha(erro);
  }
}

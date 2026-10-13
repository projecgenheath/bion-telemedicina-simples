import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { SEM_DESFECHO_FILA_HORAS } from "@/lib/server/financeiro";
import { listarConsultasSemDesfecho } from "@/lib/server/repasse";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/consultas/sem-desfecho
 * Consultas SEM DESFECHO (ninguém concluiu nem marcou falta/falha técnica)
 * que começaram há mais de 24 h — as mesmas que o fechamento do repasse deixa
 * de fora (consultaSemDesfecho em repasse.ts). Mais antigas primeiro, até 200.
 * Alimenta a Fila do admin. Só ADMIN.
 */
export async function GET(_req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const agora = new Date();
    const ate = new Date(agora.getTime() - SEM_DESFECHO_FILA_HORAS * 3_600_000);
    const lista = await listarConsultasSemDesfecho({ ate, limite: 200 });
    return ok({
      total: lista.length,
      horas: SEM_DESFECHO_FILA_HORAS,
      consultas: lista.map((c) => ({
        id: c.id,
        medicoId: c.medicoId,
        medico: c.medico,
        paciente: c.paciente,
        especialidade: c.especialidade,
        dataInicio: c.dataInicio.toISOString(),
        status: c.status,
        pago: c.pago,
        valor: c.valor,
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

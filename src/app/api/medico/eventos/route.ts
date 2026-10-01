import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";

const MAX_INTERVALO_MS = 366 * 86_400_000;
const MAX_EVENTOS = 2000;

/**
 * GET /api/medico/eventos?de=ISO&ate=ISO — SOMENTE LEITURA.
 *
 * Eventos (cancelamento/remarcação/falha técnica) das consultas do médico
 * da sessão cuja data ORIGINAL (`dataAnterior`) ou momento (`em`) cai em
 * [de, ate). Campos mínimos, sem dados do paciente: a contagem
 * "remarcadas/canceladas pelo paciente" é feita no cliente
 * (contarAcoesPacienteHoje em medico/metricas.ts).
 * Acesso: só MEDICO. Intervalo máximo: 366 dias. Nada é gravado.
 */
export async function GET(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const url = new URL(req.url);
    const de = new Date(url.searchParams.get("de") ?? "");
    const ate = new Date(url.searchParams.get("ate") ?? "");
    if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) {
      return Response.json({ erro: "Informe de e ate como datas ISO." }, { status: 400 });
    }
    if (ate.getTime() <= de.getTime()) {
      return Response.json({ erro: "A data final precisa ser depois da inicial." }, { status: 400 });
    }
    if (ate.getTime() - de.getTime() > MAX_INTERVALO_MS) {
      return Response.json({ erro: "Intervalo máximo: 366 dias." }, { status: 400 });
    }
    const intervalo = { gte: de, lt: ate };
    const eventos = await db.eventoConsulta.findMany({
      where: {
        consulta: { medicoId: medico.id },
        OR: [{ dataAnterior: intervalo }, { em: intervalo }],
      },
      select: { consultaId: true, tipo: true, por: true, motivo: true, em: true, dataAnterior: true, dataNova: true },
      orderBy: { em: "asc" },
      take: MAX_EVENTOS,
    });
    return ok({
      eventos: eventos.map((e) => ({
        consultaId: e.consultaId,
        tipo: e.tipo,
        por: e.por,
        motivo: e.motivo,
        em: e.em.toISOString(),
        dataAnterior: e.dataAnterior.toISOString(),
        dataNova: e.dataNova?.toISOString() ?? null,
      })),
      limite: eventos.length === MAX_EVENTOS,
    });
  } catch (erro) {
    return falha(erro);
  }
}

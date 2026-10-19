import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { listarChamadasNaoAtendidas } from "@/lib/server/toque";

export const dynamic = "force-dynamic";

const HORAS = 24;

/**
 * GET /api/admin/consultas/chamadas-nao-atendidas
 * Consultas das últimas 24 h, ainda sem desfecho, em que o paciente e/ou o
 * médico não atendeu o toque (recusou ou deixou expirar as 3 tentativas).
 * Depois de 24 h sem desfecho a consulta passa para "Sem desfecho".
 * Só ADMIN. Mais recentes primeiro, até 200.
 */
export async function GET(_req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const consultas = await listarChamadasNaoAtendidas(new Date(), HORAS, 200);
    return ok({ total: consultas.length, horas: HORAS, consultas });
  } catch (erro) {
    return falha(erro);
  }
}

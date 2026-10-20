import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { listarEsperasFila } from "@/lib/server/espera-medico";

export const dynamic = "force-dynamic";

/** GET /api/admin/consultas/esperas-medico — esperas ativas e expiradas sem desfecho (24 h). Só ADMIN. */
export async function GET(_req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const consultas = await listarEsperasFila(new Date(), 200);
    return ok({ total: consultas.length, consultas });
  } catch (erro) {
    return falha(erro);
  }
}

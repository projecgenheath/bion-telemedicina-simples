import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { listarEvolucaoPendente } from "@/lib/server/evolucao-pendente";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/consultas/evolucao-pendente
 * Consultas com o paciente na sala agora cujo médico tem Evolucao em rascunho
 * de outra consulta (mesma trava de medicoLivreAgora: o job não toca). Só
 * ADMIN, só leitura.
 */
export async function GET(_req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const r = await listarEvolucaoPendente(new Date());
    return ok({ total: r.consultas.length, disponivel: r.disponivel, consultas: r.consultas });
  } catch (erro) {
    return falha(erro);
  }
}

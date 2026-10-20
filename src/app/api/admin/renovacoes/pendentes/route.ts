import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const HORAS = 24;

/**
 * GET /api/admin/renovacoes/pendentes
 * Pedidos de renovação com status 'pendente' criados há mais de 24 h.
 * LGPD: só contagem, ids e a data do mais antigo — nada de paciente,
 * remédio, médico ou texto livre. Alimenta a Fila do admin. Só ADMIN.
 */
export async function GET(_req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const ate = new Date(Date.now() - HORAS * 3_600_000);
    const onde = { status: "pendente", criadoEm: { lt: ate } };
    const [total, lista] = await Promise.all([
      db.pedidoRenovacao.count({ where: onde }),
      db.pedidoRenovacao.findMany({ where: onde, select: { id: true, criadoEm: true }, orderBy: { criadoEm: "asc" }, take: 200 }),
    ]);
    return ok({ total, horas: HORAS, ids: lista.map((p) => p.id), maisAntigoEm: lista[0]?.criadoEm.toISOString() ?? null });
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";
import { marcarFalhaBion, validarPedidoFalhaBion } from "@/lib/server/chargeback";

/**
 * POST { falhaBion: boolean, motivo: string } — só ADMIN.
 * Marca (true) ou desmarca (false) "falha da BION" num chargeback
 * (cláusula 10.13 dos termos do médico). Marcado: nada é descontado do
 * médico (o desconto pendente é removido). Motivo obrigatório (≥ 10).
 * Idempotente. 409 se o desconto já entrou num repasse; 503 se a auditoria
 * falhar (nada é alterado).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const pedido = validarPedidoFalhaBion(await req.json().catch(() => null));
    if (!pedido.ok) return Response.json({ erro: pedido.erro, codigo: "pedido_invalido" }, { status: 400 });
    const r = await marcarFalhaBion({ chargebackId: id, admin: { id: admin.id, nome: admin.nome, role: admin.role }, falhaBion: pedido.falhaBion, motivo: pedido.motivo });
    if (!r.ok) return Response.json({ erro: r.erro, codigo: r.codigo }, { status: r.status });
    return ok(r);
  } catch (erro) {
    return falha(erro);
  }
}

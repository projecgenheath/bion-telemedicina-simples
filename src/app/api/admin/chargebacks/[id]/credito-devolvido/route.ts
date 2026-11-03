import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";
import { registrarCreditoDevolvido, validarMotivo } from "@/lib/server/chargeback";

/**
 * POST { motivo } — só ADMIN. Registra que o crédito pendente ao médico
 * (disputa ganha depois do repasse) foi devolvido fora do sistema. Limpa
 * creditoPendente, grava quem/quando/por quê e audita (falha → 503, nada muda).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const pedido = validarMotivo(await req.json().catch(() => null));
    if (!pedido.ok) return Response.json({ erro: pedido.erro, codigo: "pedido_invalido" }, { status: 400 });
    const r = await registrarCreditoDevolvido({ chargebackId: id, admin: { id: admin.id, nome: admin.nome, role: admin.role }, motivo: pedido.motivo });
    if (!r.ok) return Response.json({ erro: r.erro, codigo: r.codigo }, { status: r.status });
    return ok(r);
  } catch (erro) {
    return falha(erro);
  }
}

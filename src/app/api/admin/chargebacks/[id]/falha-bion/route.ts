import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";
import { marcarFalhaBion, transferirFalhaBion, validarPedidoFalhaBion } from "@/lib/server/chargeback";

/**
 * POST { falhaBion: boolean, motivo: string } — só ADMIN.
 * Marca (true) ou desmarca (false) "falha da BION" num chargeback
 * (cláusula 10.13 dos termos do médico). Marcado: nada é descontado do
 * médico (o desconto pendente é removido). Motivo obrigatório (≥ 10).
 * Idempotente. 409 se o desconto já entrou num repasse; 503 se a auditoria
 * falhar (nada é alterado). Cobrança direta: transfere ao médico (ver
 * transferirFalhaBion); 502 se a transferência falhar (marcação mantida;
 * repetir o POST tenta de novo sem pagar duas vezes).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const pedido = validarPedidoFalhaBion(await req.json().catch(() => null));
    if (!pedido.ok) return Response.json({ erro: pedido.erro, codigo: "pedido_invalido" }, { status: 400 });
    const r = await marcarFalhaBion({ chargebackId: id, admin: { id: admin.id, nome: admin.nome, role: admin.role }, falhaBion: pedido.falhaBion, motivo: pedido.motivo });
    if (!r.ok) return Response.json({ erro: r.erro, codigo: r.codigo }, { status: r.status });
    // Cobrança direta: com a disputa perdida, a BION transfere ao médico a taxa
    // do cartão + a dispute fee (idempotente; antes do desfecho só fica marcado).
    if (!r.falhaBion) return ok(r);
    try {
      const t = await transferirFalhaBion(id);
      return ok({ ...r, transferencia: t.enviado ? { enviado: true, valorCentavos: t.valorCentavos } : { enviado: false, motivo: t.motivo } });
    } catch {
      return Response.json(
        { erro: "Marcado como falha da BION, mas a transferência ao médico falhou. Tente de novo (não paga duas vezes).", codigo: "transferencia_falhou", marcacao: r },
        { status: 502 },
      );
    }
  } catch (erro) {
    return falha(erro);
  }
}

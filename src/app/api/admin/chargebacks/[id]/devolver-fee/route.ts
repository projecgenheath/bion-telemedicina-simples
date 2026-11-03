import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";
import { devolverFeeChargeback } from "@/lib/server/chargeback";

/**
 * POST — só ADMIN. Repete a devolução dos 10% (application fee) ao médico de
 * um chargeback perdido na cobrança direta (decisão 03/11 12:33). Idempotente:
 * nunca devolve duas vezes nem mais que o saldo da fee. 502 se o Stripe falhar.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirPapel("ADMIN");
    const { id } = await params;
    try {
      const r = await devolverFeeChargeback(id);
      if (!r.enviado && r.motivo === "nao_encontrado") return Response.json({ erro: "Chargeback não encontrado.", codigo: "nao_encontrado" }, { status: 404 });
      return ok(r);
    } catch {
      return Response.json({ erro: "A devolução da taxa da BION falhou no Stripe. Tente de novo (não devolve duas vezes).", codigo: "fee_refund_falhou" }, { status: 502 });
    }
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";
import { cobrarTaxasChargebackPlataforma } from "@/lib/server/chargeback";

/**
 * POST — só ADMIN. Repete a cobrança das taxas do chargeback ao médico no
 * modo plataforma (decisão do Alisson de 27/11, alternativa B da 10.13;
 * migração 20261127c): reversão da TransferenciaMedico enviada ou desconto
 * em recebimentos futuros. Idempotente: nunca cobra duas vezes nem mais que
 * a taxa de contestação. Só com disputa perdida, sem falha da BION e com
 * médico. 502 se o Stripe falhar (a dívida segue descontável; repetir tenta
 * de novo sem duplicar).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirPapel("ADMIN");
    const { id } = await params;
    try {
      const r = await cobrarTaxasChargebackPlataforma(id);
      if (!r.cobrado && r.motivo === "nao_encontrado") return Response.json({ erro: "Chargeback não encontrado.", codigo: "nao_encontrado" }, { status: 404 });
      return ok(r);
    } catch {
      return Response.json({ erro: "A cobrança das taxas falhou no Stripe. Tente de novo (não cobra duas vezes).", codigo: "taxas_plataforma_falhou" }, { status: 502 });
    }
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { ok, falha } from "@/lib/server/http";
import { autorizadoCron } from "@/lib/server/toque";
import { enviarReembolsoStripe, reembolsosStripePendentes } from "@/lib/server/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Envia ao Stripe os Reembolsos 'aprovado' de pagamento Stripe.
 * `Authorization: Bearer <CRON_SECRET>`. Idempotente (Idempotency-Key =
 * reembolso.id). M-24 da auditoria: AGORA AGENDADO no vercel.json a cada
 * 15 min — com o reembolso automático ativado e textos prometendo devolução
 * integral, valores aprovados não podem ficar retidos até execução manual.
 * Resposta só com contagens.
 */
async function executar(req: NextRequest) {
  try {
    const autorizado = autorizadoCron(req);
    if (autorizado === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!autorizado) return Response.json({ erro: "Não autorizado." }, { status: 401 });
    if (!process.env.STRIPE_SECRET_KEY?.trim()) return Response.json({ erro: "STRIPE_SECRET_KEY não configurada." }, { status: 503 });
    let enviados = 0, ignorados = 0, erros = 0;
    for (const id of await reembolsosStripePendentes()) {
      try {
        const r = await enviarReembolsoStripe(id);
        if (r.enviado) enviados++; else ignorados++;
      } catch (e) {
        erros++;
        console.error("[cron reembolsos-stripe]", id, e instanceof Error ? e.message : "erro");
      }
    }
    return ok({ enviados, ignorados, erros });
  } catch (erro) {
    return falha(erro);
  }
}

export const GET = executar;
export const POST = executar;

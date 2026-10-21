import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { executarRetencao } from "@/lib/server/retencao";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Compara o Bearer com o CRON_SECRET em tempo constante. */
function autorizado(req: NextRequest): boolean | null {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return null;
  const recebido = req.headers.get("authorization") ?? "";
  const a = crypto.createHash("sha256").update(`Bearer ${segredo}`).digest();
  const b = crypto.createHash("sha256").update(recebido).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Cron da Vercel (vercel.json, 06:00 UTC = 03:00 em SP): descarte e
 * pseudonimização pelos prazos do Jurídico (lib/retencao-logica.ts).
 * Idempotente e em lotes; registra só contagens, sem dado pessoal.
 */
export async function GET(req: NextRequest) {
  try {
    const ok_ = autorizado(req);
    if (ok_ === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!ok_) return Response.json({ erro: "Não autorizado." }, { status: 401 });

    const r = await executarRetencao(new Date());
    console.log("[cron/descarte-retencao]", JSON.stringify(r));
    await registrarAudit(null, {
      acao: "RETENCAO_DESCARTE_CRON",
      categoria: "sistema",
      entidade: "Retencao",
      detalhes: JSON.stringify(r),
    });
    return ok(r);
  } catch (erro) {
    return falha(erro);
  }
}

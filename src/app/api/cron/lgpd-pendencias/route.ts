import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { reprocessarPendenciasLgpd } from "@/lib/server/lgpd";

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
 * Cron da Vercel (vercel.json, 07:00 UTC = 04:00 em SP): tenta de novo as
 * pendências LGPD que ficaram depois do commit da anonimização (remoção do
 * Supabase Auth, objetos do Storage, desbloqueio do login) e avisa na
 * auditoria as abertas há mais de 10 dias (prazo LGPD de 15). Só contagens.
 */
export async function GET(req: NextRequest) {
  try {
    const ok_ = autorizado(req);
    if (ok_ === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!ok_) return Response.json({ erro: "Não autorizado." }, { status: 401 });

    const r = await reprocessarPendenciasLgpd();
    console.log("[cron/lgpd-pendencias]", JSON.stringify(r));
    await registrarAudit(null, {
      acao: "LGPD_PENDENCIAS_CRON",
      categoria: "admin",
      entidade: "Lgpd",
      detalhes: JSON.stringify(r),
    });
    return ok(r);
  } catch (erro) {
    return falha(erro);
  }
}

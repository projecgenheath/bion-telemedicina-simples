import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { competenciaPadraoParaFechar, fecharRepasse } from "@/lib/server/repasse";

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
 * Cron da Vercel (vercel.json, 02:30 UTC = 23:30 em SP): fecha o repasse do
 * dia para todos os médicos. Idempotente: se rodar de novo ou atrasar para
 * depois da meia-noite, fecha a competência certa sem duplicar
 * (corte = mínimo entre agora e o fim do dia em SP).
 */
export async function GET(req: NextRequest) {
  try {
    const ok_ = autorizado(req);
    if (ok_ === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!ok_) return Response.json({ erro: "Não autorizado." }, { status: 401 });

    const agora = new Date();
    // Atrasou para depois da meia-noite: ainda é o dia anterior que precisa fechar.
    const dia = competenciaPadraoParaFechar(agora);
    const r = await fecharRepasse(dia, { agora });
    const fechados = r.resultados.filter((x) => x.situacao === "fechado").length;
    const erros = r.resultados.filter((x) => x.situacao === "erro").length;
    await registrarAudit(null, {
      acao: "repasse_fechado_cron",
      categoria: "financeiro",
      severidade: erros ? "warning" : "info",
      entidade: "Repasse",
      detalhes: JSON.stringify({ competencia: dia, fechados, erros }),
    });
    return ok({ competencia: dia, fechados, erros });
  } catch (erro) {
    return falha(erro);
  }
}

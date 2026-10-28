import { NextRequest } from "next/server";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";
import { listarPendenciasLgpd, reprocessarPendenciasLgpd } from "@/lib/server/lgpd";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_POR_HORA = 6;
const JANELA_MS = 60 * 60_000;

/** GET — pendências LGPD abertas (Auth, Storage, desban), com dias em aberto. Só ADMIN; só ids. */
export async function GET() {
  try {
    await exigirPapel("ADMIN");
    return ok({ pendencias: await listarPendenciasLgpd() });
  } catch (erro) {
    return falha(erro);
  }
}

/** POST — "Reprocessar agora" (mesmo trabalho do cron diário). Só ADMIN, 6 por hora. */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    const origem = req.headers.get("origin");
    if (origem && new URL(origem).host !== req.nextUrl.host) return Response.json({ erro: "Origem não permitida." }, { status: 403 });
    const v = await limitarAsync(`lgpd:pendencias:${admin.id}`, MAX_POR_HORA, JANELA_MS);
    if (!v.permitido) return resposta429(v.restanteSeg, "Muitos reprocessamentos seguidos. Aguarde e tente novamente.");
    const r = await reprocessarPendenciasLgpd();
    await registrarAudit(admin, {
      acao: "LGPD_PENDENCIAS_REPROCESSADAS",
      categoria: "admin",
      entidade: "Lgpd",
      detalhes: JSON.stringify(r),
    });
    return ok({ resultado: r, pendencias: await listarPendenciasLgpd() });
  } catch (erro) {
    return falha(erro);
  }
}

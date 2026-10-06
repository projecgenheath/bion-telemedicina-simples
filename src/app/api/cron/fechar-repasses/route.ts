import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { competenciaPadraoParaFechar, fecharRepasse, listarConsultasSemDesfecho } from "@/lib/server/repasse";

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
 *
 * Desfecho (regras do Alisson, 06/10/2026): consultas SEM DESFECHO (status
 * ainda "ia acontecer" e sem falta/falha técnica vigente) ficam fora do
 * fechamento e entram no primeiro fechamento depois de ganhar desfecho
 * (repasse.ts). O cron NÃO muda status nem roda a verificação de presença:
 * só conta as que ficaram de fora (`semDesfecho`, na auditoria) — a Fila do
 * admin mostra as que estão assim há mais de 24 h.
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
    // Só leitura: quantas consultas até o corte ficaram de fora por falta de desfecho.
    const semDesfecho = (await listarConsultasSemDesfecho({ ate: new Date(r.corte), limite: 500 }).catch(() => [])).length;
    await registrarAudit(null, {
      acao: "repasse_fechado_cron",
      categoria: "financeiro",
      severidade: erros ? "warning" : "info",
      entidade: "Repasse",
      detalhes: JSON.stringify({ competencia: dia, fechados, erros, semDesfecho }),
    });
    return ok({ competencia: dia, fechados, erros, semDesfecho });
  } catch (erro) {
    return falha(erro);
  }
}

import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { competenciaPadraoParaFechar, cronFechaRepassePix, fecharRepasse, listarConsultasSemDesfecho } from "@/lib/server/repasse";

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
 * Não fecha PIX novo. O médico recebe na conta conectada da Stripe; a
 * Stripe transfere ao banco no calendário dela. A BION não faz outro
 * repasse. O vercel.json não declara cron. Se algo ainda chamar esta
 * rota, ela autentica e responde sem criar lote.
 *
 * O corpo antigo só roda se cronFechaRepassePix() voltar a ser true.
 * Consulta sem desfecho continua fora de fecharRepasse, e esta rota não
 * muda status nem presença.
 */
export async function GET(req: NextRequest) {
  try {
    const ok_ = autorizado(req);
    if (ok_ === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!ok_) return Response.json({ erro: "Não autorizado." }, { status: 401 });

    if (!cronFechaRepassePix()) {
      return ok({
        fechamentoPixAutomatico: false,
        fechados: 0,
        motivo: "Fechamento PIX automático desligado. O médico recebe só pela Stripe, na conta conectada.",
      });
    }

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

import { NextRequest } from "next/server";
import { ok, falha } from "@/lib/server/http";
import { autorizadoCron } from "@/lib/server/toque";
import { rodarEsperaMedico } from "@/lib/server/espera-medico";
import { vencerEscolhasCorrecao } from "@/lib/server/financeiro";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Job da espera do médico (a cada minuto, como o do toque): abre esperas,
 * fecha como medico_entrou e marca expiradas. `Authorization: Bearer
 * <CRON_SECRET>`. Idempotente. Resposta só com contagens. Agendada pelo pg_cron
 * (migração 20261020c_pg_cron_espera_medico), via POST. Também faz o
 * reembolso automático das escolhas vencidas depois de uma correção de
 * desfecho (vencerEscolhasCorrecao, 7 dias úteis).
 */
async function executar(req: NextRequest) {
  try {
    const autorizado = autorizadoCron(req);
    if (autorizado === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!autorizado) return Response.json({ erro: "Não autorizado." }, { status: 401 });
    const agora = new Date();
    const espera = await rodarEsperaMedico(agora);
    const escolhas = await vencerEscolhasCorrecao(agora);
    return ok({ ...espera, escolhasVencidas: escolhas.vencidas, reembolsosAutomaticos: escolhas.reembolsadas });
  } catch (erro) {
    return falha(erro);
  }
}

export const GET = executar;
export const POST = executar;

import { NextRequest } from "next/server";
import { ok, falha } from "@/lib/server/http";
import { autorizadoCron } from "@/lib/server/toque";
import { rodarEsperaMedico } from "@/lib/server/espera-medico";
import { vencerReembolsosAutomaticos } from "@/lib/server/financeiro";
import { enviarTransferenciasPendentes } from "@/lib/server/transferencia-medico";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Job da espera do médico (a cada minuto, como o do toque): abre esperas,
 * fecha como medico_entrou e marca expiradas. `Authorization: Bearer
 * <CRON_SECRET>`. Idempotente. Resposta só com contagens. Agendada pelo pg_cron
 * (migração 20261020c_pg_cron_espera_medico), via POST. Também faz o
 * reembolso automático das faltas sem remarcação (regras 4 e 5, 7 dias
 * corridos; vencerReembolsosAutomaticos) e envia as TransferenciaMedico
 * pendentes ao Stripe (modelo 21/11).
 */
async function executar(req: NextRequest) {
  try {
    const autorizado = autorizadoCron(req);
    if (autorizado === null) return Response.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
    if (!autorizado) return Response.json({ erro: "Não autorizado." }, { status: 401 });
    const agora = new Date();
    const espera = await rodarEsperaMedico(agora);
    const reembolsos = await vencerReembolsosAutomaticos(agora);
    const transferencias = await enviarTransferenciasPendentes(10);
    return ok({
      ...espera,
      reembolsosAutomaticos: reembolsos.reembolsadas,
      consultasVencidas: reembolsos.vencidas,
      transferenciasEnviadas: transferencias.enviadas,
      transferenciasFalhas: transferencias.falhas,
    });
  } catch (erro) {
    return falha(erro);
  }
}

export const GET = executar;
export const POST = executar;

import { TAREFAS_AGENDA, VERCEL_JSON_TEM_CRONS } from "@/components/bion/admin/travas/agenda";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";
import { estadoTravas } from "@/lib/server/travas-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/travas — leitura. Não devolve chave nem segredo.
 * Não liga cron e não altera a cobrança.
 */
export async function GET() {
  try {
    await exigirPapel("ADMIN");
    return ok({
      travas: estadoTravas(process.env),
      vercelJsonTemCrons: VERCEL_JSON_TEM_CRONS,
      tarefas: TAREFAS_AGENDA,
      nota: "Leitura apenas. Esta tela não liga cron, não muda a chave e não consulta o Supabase.",
    });
  } catch (erro) {
    return falha(erro);
  }
}

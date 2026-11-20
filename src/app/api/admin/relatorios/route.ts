import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";
import { carregarRelatorio, filtrosRelatorioDe } from "@/lib/server/relatorio-admin";

export const dynamic = "force-dynamic";

/** GET /api/admin/relatorios?periodo=7|30|90|todos&especialidade=&medico= — só ADMIN. */
export async function GET(req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    return ok(await carregarRelatorio(filtrosRelatorioDe(req.nextUrl.searchParams)));
  } catch (erro) {
    return falha(erro);
  }
}

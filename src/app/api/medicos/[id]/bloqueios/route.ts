import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { dateParaDiaIso, diaParaDate, hojeSaoPaulo, JANELA_PUBLICA_DIAS, somarDiasIso } from "@/lib/server/bloqueio-agenda";
import { ok, falha } from "@/lib/server/http";

/**
 * GET /api/medicos/[id]/bloqueios → { dias: ["AAAA-MM-DD", ...] }
 *
 * Dias inteiros em que o médico NÃO atende (bloqueados por ele), de hoje até
 * hoje + JANELA_PUBLICA_DIAS (dias civis de São Paulo). Exige login (qualquer
 * papel). Só datas: o motivo do bloqueio é privado e nunca sai daqui.
 * Usado pela agenda do paciente para esconder esses dias.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirSessao();
    const { id } = await params;
    if (!id || id.length > 64) return ok({ dias: [] as string[] });
    const hoje = hojeSaoPaulo();
    const rows = await db.bloqueioAgenda.findMany({
      where: {
        medicoId: id,
        dia: { gte: diaParaDate(hoje), lte: diaParaDate(somarDiasIso(hoje, JANELA_PUBLICA_DIAS)) },
      },
      orderBy: { dia: "asc" },
      select: { dia: true },
    });
    return ok({ dias: rows.map((r) => dateParaDiaIso(r.dia)) });
  } catch (erro) {
    return falha(erro);
  }
}

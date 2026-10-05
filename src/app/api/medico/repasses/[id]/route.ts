import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { mascararChavePix } from "@/lib/server/recebimento";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";
import { urlAssinadaDocumento } from "@/lib/supabase/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/medico/repasses/[id] — detalhe do repasse do PRÓPRIO médico.
 * 404 se não existir ou for de outro. Privacidade: só o NOME do paciente;
 * sem CPF, contato, chave do item, reembolsoId. Chave PIX usada (se pago)
 * chega MASCARADA. Comprovante: URL assinada curta (10 min) quando o
 * storage estiver configurado; senão omitido.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await ctx.params;

    const r = await db.repasse.findFirst({
      where: { id, medicoId: medico.id },
      include: {
        itens: {
          orderBy: { criadoEm: "asc" },
          include: {
            consulta: {
              select: {
                dataInicio: true,
                paciente: { select: { nome: true } },
              },
            },
          },
        },
        ajustes: { orderBy: { criadoEm: "asc" } },
      },
    });
    if (!r) return Response.json({ erro: "Repasse não encontrado." }, { status: 404 });

    let comprovanteUrl: string | null = null;
    if (r.comprovantePath && supabaseServiceRoleKey()) {
      comprovanteUrl = await urlAssinadaDocumento(r.comprovantePath, 600).catch(() => null);
    }

    return ok({
      repasse: {
        id: r.id,
        competencia: r.competencia,
        status: r.status,
        brutoCentavos: r.brutoCentavos,
        comissaoCentavos: r.comissaoCentavos,
        taxasCentavos: r.taxasCentavos,
        reembolsosCentavos: r.reembolsosCentavos,
        multasCentavos: r.multasCentavos,
        ajustesCentavos: r.ajustesCentavos,
        liquidoCentavos: r.liquidoCentavos,
        fechadoEm: r.fechadoEm?.toISOString() ?? null,
        pagoEm: r.pagoEm?.toISOString() ?? null,
        comprovanteUrl,
        pixUsado:
          r.status === "pago" && r.pixTipo && r.pixChave
            ? {
                pixTipo: r.pixTipo,
                chaveMascarada: mascararChavePix(r.pixTipo, r.pixChave),
                titularNome: r.pixTitularNome,
              }
            : null,
        itens: r.itens.map((i) => ({
          tipo: i.tipo,
          data: i.consulta.dataInicio.toISOString(),
          paciente: i.consulta.paciente.nome,
          brutoCentavos: i.brutoCentavos,
          comissaoCentavos: i.comissaoCentavos,
          taxasCentavos: i.taxasCentavos,
          reembolsosCentavos: i.reembolsosCentavos,
          multasCentavos: i.multasCentavos,
          liquidoCentavos: i.liquidoCentavos,
        })),
        ajustes: r.ajustes.map((a) => ({
          motivo: a.motivo,
          valorCentavos: a.valorCentavos,
          valorAplicadoCentavos: a.valorAplicadoCentavos,
          criadoEm: a.criadoEm.toISOString(),
        })),
      },
    });
  } catch (erro) {
    return falha(erro);
  }
}

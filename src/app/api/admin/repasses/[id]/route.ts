import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { chaveTrocadaRecente, cnpjDivergente, marcarRepassePago } from "@/lib/server/repasse";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";
import { uploadDocumento, urlAssinadaDocumento } from "@/lib/supabase/storage";

const TIPOS_COMPROVANTE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};
const MAX_COMPROVANTE = 10 * 1024 * 1024;

type Ctx = { params: Promise<{ id: string }> };

/** GET: detalhe do repasse com itens, descontos e o link do comprovante. Só ADMIN. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await exigirPapel("ADMIN");
    const { id } = await ctx.params;
    const r = await db.repasse.findUnique({
      where: { id },
      include: {
        pagoPor: { select: { nome: true } },
        medico: { select: { nome: true, perfilMedico: { select: { cnpj: true } }, dadosRecebimento: true } },
        itens: {
          orderBy: { criadoEm: "asc" },
          include: {
            consulta: { select: { dataInicio: true, especialidade: true, status: true, paciente: { select: { nome: true } } } },
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
    const pix = r.medico.dadosRecebimento;
    const agora = new Date();
    return ok({
      repasse: {
        id: r.id,
        medicoId: r.medicoId,
        medico: r.medico.nome,
        cnpj: r.medico.perfilMedico?.cnpj || null,
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
        pagoPor: r.pagoPor?.nome ?? null,
        comprovanteUrl,
        pixUsado: r.status === "pago" ? { pixTipo: r.pixTipo, pixChave: r.pixChave, titularNome: r.pixTitularNome, titularDocumento: r.pixTitularDocumento } : null,
        recebimento: pix
          ? {
              pixTipo: pix.pixTipo,
              pixChave: pix.pixChave,
              titularTipo: pix.titularTipo,
              titularNome: pix.titularNome,
              titularDocumento: pix.titularDocumento,
              atualizadoEm: pix.atualizadoEm.toISOString(),
              chaveTrocadaRecente: chaveTrocadaRecente(pix, agora),
              cnpjDivergente: cnpjDivergente(pix, r.medico.perfilMedico?.cnpj),
            }
          : null,
        itens: r.itens.map((i) => ({
          id: i.id,
          tipo: i.tipo,
          consultaId: i.consultaId,
          remarcacaoId: i.remarcacaoId,
          dataConsulta: i.consulta.dataInicio.toISOString(),
          especialidade: i.consulta.especialidade,
          statusConsulta: i.consulta.status,
          paciente: i.consulta.paciente.nome,
          brutoCentavos: i.brutoCentavos,
          comissaoCentavos: i.comissaoCentavos,
          taxasCentavos: i.taxasCentavos,
          reembolsosCentavos: i.reembolsosCentavos,
          multasCentavos: i.multasCentavos,
          liquidoCentavos: i.liquidoCentavos,
        })),
        ajustes: r.ajustes.map((a) => ({
          id: a.id,
          motivo: a.motivo,
          consultaId: a.consultaId,
          reembolsoId: a.reembolsoId,
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

/**
 * PATCH (multipart): marca como pago.
 *   comprovante: arquivo PDF, PNG ou JPG (até 10 MB)
 *   pixChaveConferida: a chave que o admin viu na tela antes de pagar
 * Recusa (409) se a chave do médico mudou nesse meio-tempo.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await ctx.params;
    if (!supabaseServiceRoleKey()) {
      return Response.json({ erro: "O envio de comprovantes não está configurado no servidor." }, { status: 503 });
    }
    const form = await req.formData().catch(() => null);
    const arquivo = form?.get("comprovante");
    const conferida = form?.get("pixChaveConferida");
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return Response.json({ erro: "Anexe o comprovante do PIX." }, { status: 400 });
    }
    const ext = TIPOS_COMPROVANTE[arquivo.type];
    if (!ext) return Response.json({ erro: "O comprovante precisa ser PDF, PNG ou JPG." }, { status: 400 });
    if (arquivo.size > MAX_COMPROVANTE) return Response.json({ erro: "O comprovante pode ter até 10 MB." }, { status: 400 });
    if (typeof conferida !== "string" || !conferida.trim()) {
      return Response.json({ erro: "Confira a chave PIX antes de marcar como pago." }, { status: 400 });
    }

    const atual = await db.repasse.findUnique({ where: { id }, select: { medicoId: true, status: true, competencia: true } });
    if (!atual) return Response.json({ erro: "Repasse não encontrado." }, { status: 404 });
    if (atual.status !== "fechado") {
      return Response.json({ erro: "Esse repasse já foi marcado como pago." }, { status: 409 });
    }

    const { path } = await uploadDocumento(
      `repasses/${atual.medicoId}`,
      `${atual.competencia}.${ext}`,
      Buffer.from(await arquivo.arrayBuffer()),
      arquivo.type,
    );
    const pago = await marcarRepassePago({ repasseId: id, adminId: admin.id, comprovantePath: path, pixChaveConferida: conferida.trim() });
    await registrarAudit(admin, {
      acao: "repasse_pago",
      categoria: "financeiro",
      entidade: "Repasse",
      entidadeId: id,
      detalhes: JSON.stringify({ medicoId: pago.medicoId, competencia: pago.competencia, liquidoCentavos: pago.liquidoCentavos }),
    });
    return ok({ id, status: pago.status, pagoEm: pago.pagoEm.toISOString() });
  } catch (erro) {
    return falha(erro);
  }
}

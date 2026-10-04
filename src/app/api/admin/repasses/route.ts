import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import {
  chaveTrocadaRecente,
  competenciaPadraoParaFechar,
  fecharRepasse,
  previaDoDia,
} from "@/lib/server/repasse";

const STATUS_FILTRO = ["fechado", "pago"];
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE = 200;

type Pix = { pixTipo: string; pixChave: string; titularTipo: string; titularNome: string; titularDocumento: string; criadoEm: Date; atualizadoEm: Date } | null;

/** Dados de recebimento completos: só o admin vê (o GET do médico mascara). */
function recebimentoAdmin(pix: Pix, agora: Date) {
  if (!pix) return null;
  return {
    pixTipo: pix.pixTipo,
    pixChave: pix.pixChave,
    titularTipo: pix.titularTipo,
    titularNome: pix.titularNome,
    titularDocumento: pix.titularDocumento,
    atualizadoEm: pix.atualizadoEm.toISOString(),
    chaveTrocadaRecente: chaveTrocadaRecente(pix, agora),
  };
}

/**
 * GET /api/admin/repasses
 *   ?status=fechado (padrão) | pago | todos
 *   ?de=AAAA-MM-DD&ate=AAAA-MM-DD  (competência)
 *   ?medicoId=...
 *   ?previa=1  → em vez da lista, a prévia de hoje de cada médico
 * Só ADMIN. Traz o CNPJ do médico e a chave PIX completa.
 */
export async function GET(req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const sp = req.nextUrl.searchParams;
    const agora = new Date();
    const medicoId = sp.get("medicoId") || undefined;

    if (sp.get("previa") === "1") {
      const medicos = await db.user.findMany({
        where: { role: "MEDICO", ...(medicoId ? { id: medicoId } : {}) },
        select: {
          id: true,
          nome: true,
          perfilMedico: { select: { cnpj: true } },
          dadosRecebimento: true,
        },
        orderBy: { nome: "asc" },
      });
      const previas: Record<string, unknown>[] = [];
      for (const m of medicos) {
        const p = await previaDoDia(m.id, agora);
        if (p.itens.length === 0 && p.ajustes.length === 0) continue;
        previas.push({
          medicoId: m.id,
          medico: m.nome,
          cnpj: m.perfilMedico?.cnpj || null,
          recebimento: recebimentoAdmin(m.dadosRecebimento, agora),
          competencia: p.competencia,
          corte: p.corte,
          itens: p.itens.length,
          totais: p.totais,
          ajustesPendentesRestantesCentavos: p.ajustesPendentesRestantesCentavos,
        });
      }
      return ok({ competenciaPadraoParaFechar: competenciaPadraoParaFechar(agora), previas });
    }

    const pedido = sp.get("status") ?? "fechado";
    const status = pedido === "todos" ? undefined : STATUS_FILTRO.includes(pedido) ? pedido : "fechado";
    const de = sp.get("de");
    const ate = sp.get("ate");
    const competencia = {
      ...(de && DIA.test(de) ? { gte: de } : {}),
      ...(ate && DIA.test(ate) ? { lte: ate } : {}),
    };
    const where = {
      ...(status ? { status } : {}),
      ...(medicoId ? { medicoId } : {}),
      ...(Object.keys(competencia).length ? { competencia } : {}),
    };

    const [total, soma, rows] = await Promise.all([
      db.repasse.count({ where }),
      db.repasse.aggregate({ where, _sum: { liquidoCentavos: true } }),
      db.repasse.findMany({
        where,
        orderBy: [{ competencia: status === "fechado" ? "asc" : "desc" }, { medicoId: "asc" }],
        take: LIMITE,
        include: {
          _count: { select: { itens: true } },
          pagoPor: { select: { nome: true } },
          medico: {
            select: { nome: true, perfilMedico: { select: { cnpj: true } }, dadosRecebimento: true },
          },
        },
      }),
    ]);

    return ok({
      total,
      totalLiquidoCentavos: soma._sum.liquidoCentavos ?? 0,
      competenciaPadraoParaFechar: competenciaPadraoParaFechar(agora),
      repasses: rows.map((r) => ({
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
        itens: r._count.itens,
        fechadoEm: r.fechadoEm?.toISOString() ?? null,
        pagoEm: r.pagoEm?.toISOString() ?? null,
        pagoPor: r.pagoPor?.nome ?? null,
        // pago: a chave usada (cópia); aberto: a chave atual do médico
        pixUsado: r.status === "pago" ? { pixTipo: r.pixTipo, pixChave: r.pixChave, titularNome: r.pixTitularNome, titularDocumento: r.pixTitularDocumento } : null,
        recebimento: r.status === "pago" ? null : recebimentoAdmin(r.medico.dadosRecebimento, agora),
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * POST /api/admin/repasses  { competencia?: "AAAA-MM-DD", medicoId?: string }
 * "Fechar agora". Sem competência: hoje se já passou das 23:00 (SP), senão
 * ontem. O que ficar elegível depois do fechamento entra no repasse do dia
 * seguinte (o repasse é único por médico e dia).
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    const body = (await req.json().catch(() => ({}))) as { competencia?: unknown; medicoId?: unknown };
    const agora = new Date();
    const dia = typeof body.competencia === "string" && body.competencia ? body.competencia : competenciaPadraoParaFechar(agora);
    const medicoIds = typeof body.medicoId === "string" && body.medicoId ? [body.medicoId] : undefined;
    const r = await fecharRepasse(dia, { agora, medicoIds });
    const fechados = r.resultados.filter((x) => x.situacao === "fechado").length;
    const erros = r.resultados.filter((x) => x.situacao === "erro").length;
    await registrarAudit(admin, {
      acao: "repasse_fechado_manual",
      categoria: "financeiro",
      severidade: erros ? "warning" : "info",
      entidade: "Repasse",
      detalhes: JSON.stringify({ competencia: dia, fechados, erros, medicoId: medicoIds?.[0] ?? null }),
    });
    return ok(r);
  } catch (erro) {
    return falha(erro);
  }
}

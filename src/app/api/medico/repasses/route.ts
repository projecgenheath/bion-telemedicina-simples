import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { previaDoDia } from "@/lib/server/repasse";

/**
 * GET /api/medico/repasses — SOMENTE LEITURA.
 *
 * Lista os repasses do PRÓPRIO médico (fechados e pagos), a prévia de hoje
 * (ainda não fechada) e o saldo a receber. O médicoId vem só da sessão
 * (`exigirPapel("MEDICO")`); nunca de query/corpo.
 *
 * Saldo = soma dos líquidos dos repasses `fechado` + prévia.líquido
 * − ajustes pendentes que não couberam na prévia. Cada repasse fechado é
 * pago inteiro; o restante dos ajustes só desconta dos próximos.
 *
 * Privacidade: sem CPF/contato/chave do item/reembolsoId. A prévia traz
 * só tipo, data e valores (sem nome de paciente — ainda não há consulta
 * ligada na prévia pura). `temChavePix` é booleano (a chave completa
 * fica em /api/medico/recebimento, mascarada).
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    const agora = new Date();

    const [rows, previa, pix] = await Promise.all([
      db.repasse.findMany({
        where: { medicoId: medico.id },
        orderBy: [{ competencia: "desc" }, { fechadoEm: "desc" }],
        select: {
          id: true,
          competencia: true,
          status: true,
          brutoCentavos: true,
          comissaoCentavos: true,
          taxasCentavos: true,
          reembolsosCentavos: true,
          multasCentavos: true,
          ajustesCentavos: true,
          liquidoCentavos: true,
          fechadoEm: true,
          pagoEm: true,
          _count: { select: { itens: true } },
        },
      }),
      previaDoDia(medico.id, agora),
      db.dadosRecebimentoMedico.findUnique({
        where: { medicoId: medico.id },
        select: { medicoId: true },
      }),
    ]);

    const somaFechados = rows
      .filter((r) => r.status === "fechado")
      .reduce((s, r) => s + r.liquidoCentavos, 0);
    const saldoCentavos =
      somaFechados + previa.totais.liquidoCentavos;

    return ok({
      saldoCentavos,
      temChavePix: !!pix,
      aviso:
        "Cada repasse fechado é pago inteiro. O restante dos ajustes (reembolsos depois do fechamento) só desconta dos próximos repasses.",
      previa: {
        competencia: previa.competencia,
        corte: previa.corte,
        totais: previa.totais,
        ajustesPendentesRestantesCentavos: previa.ajustesPendentesRestantesCentavos,
        itens: previa.itens.map((i) => ({
          tipo: i.tipo,
          data: i.quando,
          brutoCentavos: i.brutoCentavos,
          comissaoCentavos: i.comissaoCentavos,
          taxasCentavos: i.taxasCentavos,
          reembolsosCentavos: i.reembolsosCentavos,
          multasCentavos: i.multasCentavos,
          liquidoCentavos: i.liquidoCentavos,
        })),
        ajustes: previa.ajustes.map((a) => ({
          valorCentavos: a.valorCentavos,
          aplicadoCentavos: a.aplicadoCentavos,
        })),
      },
      repasses: rows.map((r) => ({
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
        itens: r._count.itens,
        fechadoEm: r.fechadoEm?.toISOString() ?? null,
        pagoEm: r.pagoEm?.toISOString() ?? null,
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

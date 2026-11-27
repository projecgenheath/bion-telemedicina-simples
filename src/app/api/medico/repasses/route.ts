import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { previaDoDia, recebidosDiretoNoStripe, totalRecebidoDireto } from "@/lib/server/repasse";
import { retidoNaPlataforma } from "@/lib/server/retido-plataforma";
import { AVISO_GERAL_RECEBIMENTO, TOTAIS_ZERO } from "@/lib/recebimento-modelo";

/**
 * GET /api/medico/repasses — SOMENTE LEITURA.
 *
 * Contrato-api-pagamento-2111.md, seção 2 (emenda de 27/11):
 * `BION_PAGAMENTO_RETIDO === "1"` (chave de SERVIDOR) escolhe o formato.
 * Sem a chave, `modelo: "legado"` e a resposta é exatamente a da main, mais
 * o campo `modelo`: o médico continua vendo o que tem a receber por PIX.
 * Com a chave, `modelo: "plataforma"` e o valor retido/transferências/
 * reembolsos do modelo novo. Nenhum dos dois formatos inventa número.
 *
 * `medicoId` vem só da sessão (`exigirPapel("MEDICO")`), nunca de query/corpo.
 * Privacidade: sem CPF/contato/chave do item/reembolsoId.
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    const plataforma = process.env.BION_PAGAMENTO_RETIDO === "1";

    if (plataforma) {
      // Modelo novo: valor pago que fica na plataforma até a consulta terminar.
      const retido = await retidoNaPlataforma(medico.id);
      return ok({
        modelo: "plataforma" as const,
        retido,
        transferencias: [],
        reembolsos: [],
        totais: TOTAIS_ZERO,
        aviso: AVISO_GERAL_RECEBIMENTO,
      });
    }

    // Modelo atual da main (PIX diário + cobrança direta), preservado até o
    // Admin virar a cobrança para a plataforma.
    const agora = new Date();
    const [rows, previa, pix, diretos] = await Promise.all([
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
      // Cobrança direta: já caiu na conta Stripe do médico; fora do saldo PIX.
      recebidosDiretoNoStripe(medico.id),
    ]);

    const somaFechados = rows
      .filter((r) => r.status === "fechado")
      .reduce((s, r) => s + r.liquidoCentavos, 0);
    // M-15 da auditoria: o comentário promete descontar os ajustes pendentes
    // que não couberam na prévia, mas o cálculo não descontava — o saldo
    // superestimava o valor real quando há reembolsos pendentes.
    const saldoCentavos =
      somaFechados + previa.totais.liquidoCentavos - previa.ajustesPendentesRestantesCentavos;

    return ok({
      modelo: "legado" as const,
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
      // Valor COBRADO (bruto − reembolsos) direto na conta Stripe do médico,
      // antes da application fee (10%) e da taxa do Stripe. Não é o recebido.
      recebidoDiretoStripe: {
        aviso: "Valor cobrado direto na sua conta Stripe, antes da comissão da BION (10%) e da taxa do Stripe. Não entra no repasse por PIX.",
        totais: totalRecebidoDireto(diretos),
        itens: diretos,
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

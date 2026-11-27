import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { previaDoDia, recebidosDiretoNoStripe, totalRecebidoDireto } from "@/lib/server/repasse";
import { retidoNaPlataforma } from "@/lib/server/retido-plataforma";
import { AVISO_GERAL_RECEBIMENTO, TOTAIS_ZERO } from "@/lib/recebimento-modelo";

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
 * Esse saldo/prévia/fechamento das 23:30 é do modelo ANTERIOR (PIX).
 *
 * Modelo NOVO (decisão do Alisson de 21/11/2026, contrato-api-pagamento-2111.md):
 * `retido` traz o valor pago que fica na conta da plataforma até a consulta
 * terminar; `transferencias`, `reembolsos` e `totais` completam o contrato.
 * A transferência de 90% menos a taxa do cartão após o desfecho "realizada"
 * é parte do Admin. Ver src/lib/server/retido-plataforma.ts.
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

    const [rows, previa, pix, diretos, retido] = await Promise.all([
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
      // Cobrança direta (modelo anterior): já caiu na conta Stripe do médico; fora do saldo PIX.
      recebidosDiretoNoStripe(medico.id),
      // Modelo novo: valor pago que fica na plataforma até a consulta terminar.
      retidoNaPlataforma(medico.id),
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
      /**
       * Modelo novo (contrato-api-pagamento-2111.md, seção 2). `modelo` fica
       * "legado" enquanto o Admin não ligar a cobrança na plataforma; aí ele
       * vira "plataforma". `transferencias` e `reembolsos` saem vazios porque a
       * tabela TransferenciaMedico ainda não existe (parte do Admin).
       */
      modelo: "legado" as const,
      retido,
      transferencias: [],
      reembolsos: [],
      totais: TOTAIS_ZERO,
      aviso: AVISO_GERAL_RECEBIMENTO,
      // ---- Campos do modelo ANTERIOR: mantidos até o Admin ligar o novo. ----
      saldoCentavos,
      temChavePix: !!pix,
      avisoModeloAnterior:
        "Os repasses, a prévia e o saldo abaixo são do modelo anterior (PIX), com fechamento diário às 23:30. Cada repasse fechado é pago inteiro; o restante dos ajustes (reembolsos depois do fechamento) só desconta dos próximos repasses. No modelo novo, o valor fica na plataforma até a consulta terminar e o repasse (90% menos a taxa do cartão) vai para a sua conta Stripe depois da consulta realizada.",
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
      // Modelo ANTERIOR: valor COBRADO (bruto − reembolsos) direto na conta
      // Stripe do médico, antes da application fee (10%) e da taxa do Stripe.
      // Não é o recebido. No modelo novo a cobrança é na conta da plataforma.
      recebidoDiretoStripe: {
        aviso: "Modelo anterior: valor cobrado direto na sua conta Stripe, antes da comissão da BION (10%) e da taxa do Stripe. Não entra no repasse por PIX.",
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

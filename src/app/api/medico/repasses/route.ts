import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { EVENTO_VIGENTE, TIPOS_EVENTO_DESFECHO, desfechoDaConsulta, liquidoDaConsulta, liquidoComReembolso, reaisParaCentavos } from "@/lib/server/financeiro";

/**
 * GET /api/medico/repasses — SOMENTE LEITURA (modelo de 21/11/2026).
 *
 * O médicoId vem só da sessão (`exigirPapel("MEDICO")`). Contrato em
 * C:\Users\Alisson\OpenBot\Shared\contrato-api-pagamento-2111.md:
 * { modelo, retido{aviso,totalCentavos,itens}, transferencias[], reembolsos[],
 *   totais, aviso }. Os campos do modelo antigo (saldoCentavos, temChavePix,
 * previa, repasses, recebidoDiretoStripe) SAIRAM da resposta.
 *
 * Privacidade: sem CPF, sem chave PIX, sem nome de paciente e sem repasseId.
 * Nada é escrito; a cobrança fica retida na plataforma até a consulta ser
 * realizada, quando nasce a TransferenciaMedico.
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");

    const [consultas, transferencias] = await Promise.all([
      db.consulta.findMany({
        where: { medicoId: medico.id, pago: true, pagamento: { status: "confirmado" } },
        select: {
          id: true,
          dataInicio: true,
          valor: true,
          status: true,
          eventos: {
            where: { tipo: { in: TIPOS_EVENTO_DESFECHO }, ...EVENTO_VIGENTE },
            select: { tipo: true, motivo: true, dataAnterior: true },
          },
          pagamento: {
            select: {
              stripeTaxaCentavos: true,
              transferencias: { select: { id: true }, take: 1 },
              reembolsos: {
                select: {
                  id: true,
                  valorCentavos: true,
                  status: true,
                  motivo: true,
                  criadoEm: true,
                  processadoEm: true,
                  repasseAjuste: { select: { valorAplicadoCentavos: true } },
                },
                orderBy: { criadoEm: "desc" as const },
              },
            },
          },
        },
        orderBy: { dataInicio: "desc" as const },
        take: 200,
      }),
      db.transferenciaMedico.findMany({
        where: { medicoId: medico.id },
        select: {
          id: true,
          tipo: true,
          consultaId: true,
          remarcacaoId: true,
          status: true,
          brutoCentavos: true,
          comissaoCentavos: true,
          taxasCentavos: true,
          multasCentavos: true,
          liquidoCentavos: true,
          criadaEm: true,
          enviadaEm: true,
        },
        orderBy: { criadaEm: "desc" as const },
        take: 200,
      }),
    ]);

    const itens: {
      consultaId: string;
      dataInicio: string;
      valorCentavos: number;
      comissaoCentavos: number;
      taxaCentavos: number | null;
      previstoCentavos: number;
      desfecho: string;
    }[] = [];
    const reembolsos: {
      consultaId: string;
      valorCentavos: number;
      taxaNaoDevolvidaCentavos: number;
      descontadoDoMedicoCentavos: number;
      motivo: string;
      processadoEm: string | null;
    }[] = [];

    for (const c of consultas) {
      const bruto = reaisParaCentavos(c.valor);
      const taxa = c.pagamento?.stripeTaxaCentavos ?? null;
      const v = liquidoDaConsulta(bruto, taxa);
      const rs = c.pagamento?.reembolsos ?? [];
      // Já transferido ou estornado: o valor não está mais retido na BION.
      const jaTransferido = (c.pagamento?.transferencias?.length ?? 0) > 0;
      const jaReembolsado = rs.some((r) => ["aprovado", "processado"].includes(r.status));
      if (!jaTransferido && !jaReembolsado) {
        itens.push({
          consultaId: c.id,
          dataInicio: c.dataInicio.toISOString(),
          valorCentavos: v.brutoCentavos,
          comissaoCentavos: v.comissaoCentavos,
          taxaCentavos: taxa,
          previstoCentavos: v.brutoCentavos - v.comissaoCentavos - v.taxaCentavos,
          desfecho: desfechoDaConsulta({ status: c.status, dataInicio: c.dataInicio, eventos: c.eventos }),
        });
      }
      for (const r of rs) {
        if (!["aprovado", "processado"].includes(r.status)) continue;
        reembolsos.push({
          consultaId: c.id,
          valorCentavos: r.valorCentavos,
          taxaNaoDevolvidaCentavos: c.pagamento?.stripeTaxaCentavos ?? 0,
          descontadoDoMedicoCentavos: r.repasseAjuste?.valorAplicadoCentavos ?? 0,
          motivo: r.motivo,
          processadoEm: r.processadoEm?.toISOString() ?? null,
        });
      }
    }

    const soma = (k: "brutoCentavos" | "comissaoCentavos" | "taxasCentavos" | "multasCentavos" | "liquidoCentavos") =>
      transferencias.reduce((s, t) => s + t[k], 0);
    const reembolsosCentavos = reembolsos.reduce((s, r) => {
      const c = consultas.find((x) => x.id === r.consultaId);
      const bruto = reaisParaCentavos(c?.valor ?? 0);
      const taxa = c?.pagamento?.stripeTaxaCentavos ?? null;
      return s + liquidoComReembolso(bruto, taxa, r.valorCentavos).reembolsosCentavos;
    }, 0);

    return ok({
      modelo: "plataforma",
      retido: {
        aviso: "O valor é cobrado na marcação e fica na conta da BION até a consulta ser realizada.",
        totalCentavos: itens.reduce((s, i) => s + i.previstoCentavos, 0),
        itens,
      },
      // `previsaoBanco` fica null: a data de disponibilidade depende do
      // calendário de payout da Stripe e não é gravada no banco. Não inventar.
      transferencias: transferencias.map((t) => ({
        id: t.id,
        tipo: t.tipo,
        consultaId: t.consultaId,
        remarcacaoId: t.remarcacaoId,
        status: t.status,
        brutoCentavos: t.brutoCentavos,
        comissaoCentavos: t.comissaoCentavos,
        taxasCentavos: t.taxasCentavos,
        multasCentavos: t.multasCentavos,
        liquidoCentavos: t.liquidoCentavos,
        criadaEm: t.criadaEm.toISOString(),
        enviadaEm: t.enviadaEm?.toISOString() ?? null,
        previsaoBanco: null,
      })),
      reembolsos,
      totais: {
        brutoCentavos: soma("brutoCentavos"),
        comissaoCentavos: soma("comissaoCentavos"),
        taxasCentavos: soma("taxasCentavos"),
        multasCentavos: soma("multasCentavos"),
        reembolsosCentavos,
        liquidoCentavos: soma("liquidoCentavos") - reembolsosCentavos,
      },
      aviso: "A BION fica com 10%. A taxa do cartão sai do médico, inclusive no reembolso. O depósito no banco segue o calendário da Stripe.",
    });
  } catch (erro) {
    return falha(erro);
  }
}

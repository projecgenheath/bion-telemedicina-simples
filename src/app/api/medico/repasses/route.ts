import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import {
  EVENTO_VIGENTE,
  TIPOS_EVENTO_DESFECHO,
  desfechoDaConsulta,
  liquidoDaConsulta,
  liquidoComReembolso,
  reaisParaCentavos,
} from "@/lib/server/financeiro";
import { previaDoDia, recebidosDiretoNoStripe, totalRecebidoDireto } from "@/lib/server/repasse";

/**
 * GET /api/medico/repasses — SOMENTE LEITURA.
 *
 * O médicoId vem só da sessão (`exigirPapel("MEDICO")`). Dois formatos,
 * escolhidos pela chave DE SERVIDOR `BION_PAGAMENTO_RETIDO === "1"`
 * (emenda do Presidente, contrato 21/11, seção 2):
 * - padrão: `modelo: "legado"` com o corpo exato da main (o médico continua
 *   vendo o repasse PIX que existe hoje);
 * - com a chave: `modelo: "plataforma"`, o formato novo do contrato
 *   (retido/transferencias/reembolsos/totais), sem os campos antigos.
 *
 * Privacidade nos dois: sem CPF, sem chave PIX completa, sem nome de paciente.
 */

type Medico = { id: string };

/** Formato antigo (main 4ce47df), inalterado até o Admin virar a cobrança. */
async function respostaLegada(medico: Medico) {
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
    db.dadosRecebimentoMedico.findUnique({ where: { medicoId: medico.id }, select: { medicoId: true } }),
    recebidosDiretoNoStripe(medico.id),
  ]);
  const somaFechados = rows.filter((r) => r.status === "fechado").reduce((s, r) => s + r.liquidoCentavos, 0);
  const saldoCentavos = somaFechados + previa.totais.liquidoCentavos - previa.ajustesPendentesRestantesCentavos;
  return ok({
    modelo: "legado",
    saldoCentavos,
    temChavePix: !!pix,
    aviso: "Cada repasse fechado é pago inteiro. O restante dos ajustes (reembolsos depois do fechamento) só desconta dos próximos repasses.",
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
      ajustes: previa.ajustes.map((a) => ({ valorCentavos: a.valorCentavos, aplicadoCentavos: a.aplicadoCentavos })),
    },
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
}

/** Formato do modelo de 21/11 (contrato do Presidente). */
async function respostaPlataforma(medico: Medico) {
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
    return s + liquidoComReembolso(reaisParaCentavos(c?.valor ?? 0), c?.pagamento?.stripeTaxaCentavos ?? null, r.valorCentavos).reembolsosCentavos;
  }, 0);

  return ok({
    modelo: "plataforma",
    retido: {
      aviso: "O valor é cobrado na marcação e fica na conta da BION até a consulta ser realizada.",
      totalCentavos: itens.reduce((s, i) => s + i.previstoCentavos, 0),
      itens,
    },
    // `previsaoBanco` fica null: depende do calendário de payout da Stripe,
    // que não é gravado no banco. Não inventar data.
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
}

export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    return process.env.BION_PAGAMENTO_RETIDO === "1" ? await respostaPlataforma(medico) : await respostaLegada(medico);
  } catch (erro) {
    return falha(erro);
  }
}

import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";
import { descontoChargebackCentavos } from "@/lib/server/chargeback";

/** GET — chargebacks (mais recentes primeiro), só ADMIN. */
export async function GET() {
  try {
    await exigirPapel("ADMIN");
    const linhas = await db.chargeback.findMany({
      orderBy: { criadoEm: "desc" },
      take: 200,
      select: {
        id: true, stripeDisputeId: true, consultaId: true, valorCentavos: true, taxaCartaoCentavos: true, taxaDisputaCentavos: true,
        statusStripe: true, motivoStripe: true, falhaBion: true, falhaBionMotivo: true, falhaBionEm: true, criadoEm: true,
        medico: { select: { nome: true } },
        falhaBionPor: { select: { nome: true } },
        ajustes: { select: { valorCentavos: true, repasseId: true } },
      },
    });
    return ok({
      chargebacks: linhas.map((c) => ({
        id: c.id,
        stripeDisputeId: c.stripeDisputeId,
        consultaId: c.consultaId,
        medico: c.medico?.nome ?? null,
        valorCentavos: c.valorCentavos,
        taxaCartaoCentavos: c.taxaCartaoCentavos,
        taxaDisputaCentavos: c.taxaDisputaCentavos,
        descontoCentavos: descontoChargebackCentavos(c),
        statusStripe: c.statusStripe,
        motivoStripe: c.motivoStripe,
        falhaBion: c.falhaBion,
        falhaBionMotivo: c.falhaBionMotivo,
        falhaBionPor: c.falhaBionPor?.nome ?? null,
        falhaBionEm: c.falhaBionEm,
        liquidado: c.ajustes.some((a) => a.repasseId !== null),
        criadoEm: c.criadoEm,
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

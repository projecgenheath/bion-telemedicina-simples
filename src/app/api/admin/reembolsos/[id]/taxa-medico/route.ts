import { NextRequest } from "next/server";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { retentarTaxaAoMedico } from "@/lib/server/reembolso-taxa-medico";

/**
 * POST — admin tenta de novo devolver ao médico a taxa do cartão de um
 * reembolso integral por falta do paciente (linha 'falhou', ou taxa que não
 * estava disponível). Idempotente: se já foi enviada, não faz nada.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    let resultado;
    try {
      resultado = await retentarTaxaAoMedico(id);
    } catch {
      // Erro do Stripe já foi registrado (auditoria + linha 'falhou').
      return Response.json({ erro: "A transferência falhou. Veja a auditoria e tente de novo mais tarde." }, { status: 502 });
    }
    await registrarAudit(admin, {
      acao: "REEMBOLSO_TAXA_MEDICO_RETENTADA",
      categoria: "pagamento",
      severidade: "warning",
      entidade: "reembolso",
      entidadeId: id,
      detalhes: `Nova tentativa da devolução da taxa ao médico: ${resultado.enviado ? "enviada" : resultado.motivo}`,
    });
    return ok({ enviado: resultado.enviado, ...(resultado.enviado ? { valorCentavos: resultado.valorCentavos } : { motivo: resultado.motivo }) });
  } catch (erro) {
    return falha(erro);
  }
}

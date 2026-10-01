import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { quandoClinica } from "@/lib/server/fuso";
import { decidirReembolsoManual, reembolsoManualWire } from "@/lib/server/financeiro";

/**
 * PATCH { decisao: "aprovar" | "negar", resposta? } — decisão do admin sobre um
 * pedido manual em análise. Negar exige resposta (vai para o paciente).
 * Aprovado: status "aprovado" (o envio ao gateway segue o fluxo dos
 * reembolsos) e a consulta sai do repasse do médico.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { decisao?: unknown; resposta?: unknown };
    if (body.decisao !== "aprovar" && body.decisao !== "negar") {
      return Response.json({ erro: "Decisão inválida: use aprovar ou negar." }, { status: 400 });
    }
    const res = await decidirReembolsoManual({
      reembolsoId: id,
      adminId: admin.id,
      decisao: body.decisao,
      resposta: typeof body.resposta === "string" ? body.resposta : undefined,
    });
    if (!res.ok) return Response.json({ erro: res.erro }, { status: res.status });

    const r = res.reembolso;
    const pag = r.pagamentoId
      ? await db.pagamento.findUnique({
          where: { id: r.pagamentoId },
          select: { consulta: { select: { id: true, pacienteId: true, especialidade: true, dataInicio: true } } },
        })
      : null;
    const c = pag?.consulta;
    const valor = `R$ ${(r.valorCentavos / 100).toFixed(2)}`;
    const aprovado = body.decisao === "aprovar";

    await registrarAudit(admin, {
      acao: aprovado ? "REEMBOLSO_MANUAL_APROVADO" : "REEMBOLSO_MANUAL_NEGADO",
      categoria: "pagamento",
      severidade: "warning",
      entidade: "reembolso",
      entidadeId: r.id,
      detalhes: `${aprovado ? "Aprovado" : "Negado"} reembolso de ${valor} da consulta ${c?.id ?? "?"}${r.respostaAdmin ? ` — ${r.respostaAdmin}` : ""}`,
    });
    if (c) {
      const quando = quandoClinica(c.dataInicio);
      await db.notificacao.create({
        data: {
          usuarioId: c.pacienteId,
          tipo: "suporte",
          titulo: aprovado ? "Reembolso aprovado" : "Reembolso negado",
          texto: aprovado
            ? `Seu pedido de reembolso da consulta de ${c.especialidade} (${quando}) foi aprovado: ${valor} serão devolvidos pelo mesmo meio de pagamento.`
            : `Seu pedido de reembolso da consulta de ${c.especialidade} (${quando}) foi negado. Motivo: ${r.respostaAdmin}`,
        },
      });
    }
    return ok({ reembolso: reembolsoManualWire(r) });
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { quandoClinica } from "@/lib/server/fuso";
import { pedirReembolsoManual, prazoReembolsoManual, reembolsoManualWire } from "@/lib/server/financeiro";

/**
 * Reembolso MANUAL de uma consulta marcada como falta do paciente.
 *
 * POST { justificativa } → paciente dono pede o reembolso (status em_analise).
 *      Só com evento falta_paciente, pagamento confirmado e dentro de
 *      REEMBOLSO_MANUAL_PRAZO_DIAS depois da consulta. Um pedido por
 *      pagamento: se já houver (inclusive negado) → 409.
 * GET  → { reembolso | null, podePedirAte | null } para o paciente dono ou admin.
 *
 * A decisão é do admin: PATCH /api/admin/reembolsos/[id].
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { id } = await params;
    const consulta = await db.consulta.findUnique({
      where: { id },
      select: {
        pacienteId: true,
        dataInicio: true,
        eventos: { where: { tipo: "falta_paciente" }, select: { id: true }, take: 1 },
        pagamento: {
          select: { reembolsos: { where: { origem: "manual" }, orderBy: { criadoEm: "desc" }, take: 1 } },
        },
      },
    });
    if (!consulta) return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
    if (consulta.pacienteId !== usuario.id && usuario.role !== "ADMIN") {
      return Response.json({ erro: "Acesso negado." }, { status: 403 });
    }
    const r = consulta.pagamento?.reembolsos[0];
    return ok({
      reembolso: r ? reembolsoManualWire(r) : null,
      podePedirAte: consulta.eventos.length ? prazoReembolsoManual(consulta.dataInicio).toISOString() : null,
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { id } = await params;
    if (usuario.role !== "PACIENTE") {
      return Response.json({ erro: "Só o paciente da consulta pode pedir o reembolso." }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { justificativa?: unknown };
    const res = await pedirReembolsoManual({
      consultaId: id,
      pacienteId: usuario.id,
      justificativa: typeof body.justificativa === "string" ? body.justificativa : "",
    });
    if (!res.ok) return Response.json({ erro: res.erro }, { status: res.status });

    const consulta = await db.consulta.findUnique({ where: { id }, select: { especialidade: true, dataInicio: true } });
    const quando = consulta ? quandoClinica(consulta.dataInicio) : "";
    await registrarAudit(usuario, {
      acao: "REEMBOLSO_MANUAL_SOLICITADO",
      categoria: "pagamento",
      severidade: "warning",
      entidade: "reembolso",
      entidadeId: res.reembolso.id,
      detalhes: `Pedido de reembolso (falta) da consulta ${id}${quando ? ` de ${quando}` : ""}: R$ ${(res.reembolso.valorCentavos / 100).toFixed(2)}`,
    });
    await db.notificacao.create({
      data: {
        paraRole: "ADMIN",
        tipo: "suporte",
        titulo: "Pedido de reembolso para analisar",
        texto: `${usuario.nome} pediu reembolso de uma consulta marcada como falta${consulta ? ` (${consulta.especialidade}, ${quando})` : ""}.`,
      },
    });
    return Response.json({ reembolso: reembolsoManualWire(res.reembolso) }, { status: 201 });
  } catch (erro) {
    return falha(erro);
  }
}

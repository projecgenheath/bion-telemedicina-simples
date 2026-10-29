import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { quandoClinica } from "@/lib/server/fuso";
import { pedirReembolsoManual, prazoReembolsoManual, reembolsoManualWire } from "@/lib/server/financeiro";

/**
 * Reembolso MANUAL de uma consulta marcada como falta do paciente.
 *
 * POST { justificativa } → paciente dono pede o reembolso. Regra de 20/10:
 *      aprovado NA HORA (status aprovado, sem análise do admin), integral e
 *      por PIX; as taxas do meio de pagamento ficam com o app.
 *      Só com evento falta_paciente, pagamento confirmado e dentro de
 *      REEMBOLSO_MANUAL_PRAZO_DIAS depois da consulta. Um pedido por
 *      pagamento: se já houver (inclusive negado) → 409.
 * GET  → { reembolso | null, podePedirAte | null } para o paciente dono ou admin.
 *
 * PATCH /api/admin/reembolsos/[id] continua para pedidos antigos em_analise.
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
        // M2: só a falta VIGENTE conta, como o POST (pedirReembolsoManual)
        // exige — corrigidoEm: null aqui e, abaixo, o evento precisa ser da
        // data atual (dataAnterior = dataInicio, a mesma regra de
        // eventoDesfechoVigente). Sem isso, a prévia prometia prazo para
        // falta já corrigida pelo admin (ou de uma data antiga) e o POST
        // respondia 409.
        eventos: { where: { tipo: "falta_paciente", corrigidoEm: null }, select: { id: true, dataAnterior: true } },
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
    const faltaVigente = consulta.eventos.some((e) => e.dataAnterior.getTime() === consulta.dataInicio.getTime());
    return ok({
      reembolso: r ? reembolsoManualWire(r) : null,
      podePedirAte: faltaVigente ? prazoReembolsoManual(consulta.dataInicio).toISOString() : null,
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
      acao: "REEMBOLSO_MANUAL_APROVADO_AUTOMATICO",
      categoria: "pagamento",
      severidade: "warning",
      entidade: "reembolso",
      entidadeId: res.reembolso.id,
      detalhes: `Pedido de reembolso (falta) da consulta ${id}${quando ? ` de ${quando}` : ""}: R$ ${(res.reembolso.valorCentavos / 100).toFixed(2)}`,
    });
    await db.notificacao.create({
      data: {
        usuarioId: usuario.id,
        tipo: "suporte",
        titulo: "Reembolso aprovado",
        texto: `Seu reembolso${consulta ? ` da consulta de ${consulta.especialidade} (${quando})` : ""} foi aprovado: R$ ${(res.reembolso.valorCentavos / 100).toFixed(2)}, reembolso integral e automático, sem desconto de taxas.`,
      },
    });
    return Response.json({ reembolso: reembolsoManualWire(res.reembolso) }, { status: 201 });
  } catch (erro) {
    return falha(erro);
  }
}

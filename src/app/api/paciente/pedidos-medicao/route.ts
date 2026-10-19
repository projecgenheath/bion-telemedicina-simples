import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { lerTiposPedido } from "@/lib/saude-paciente";

/**
 * GET /api/paciente/pedidos-medicao[?consultaId=]
 * Pedidos de medição PENDENTES do próprio paciente (peso, altura, pressão).
 * Só o paciente dono vê; o médico cria o pedido pelo lado dele.
 */
export async function GET(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const consultaId = req.nextUrl.searchParams.get("consultaId") || undefined;
    const pedidos = await db.pedidoMedicao.findMany({
      where: { pacienteId: usuario.id, status: "pendente", ...(consultaId ? { consultaId } : {}) },
      orderBy: { criadoEm: "desc" },
      take: 20,
      select: { id: true, consultaId: true, tipos: true, criadoEm: true, medico: { select: { nome: true } } },
    });
    return ok({
      pedidos: pedidos
        .map((p) => ({
          id: p.id,
          consultaId: p.consultaId,
          tipos: lerTiposPedido(p.tipos),
          medico: p.medico?.nome ?? "Seu médico",
          criadoEm: p.criadoEm.toISOString(),
        }))
        .filter((p) => p.tipos.length > 0),
    });
  } catch (erro) {
    return falha(erro);
  }
}

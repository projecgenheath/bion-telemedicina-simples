import { NextRequest, after } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { broadcastCanal } from "@/lib/supabase/broadcast";
import { topicoSala } from "@/lib/server/sala-canal";

/**
 * "Pedir levantamento": o MÉDICO dono da consulta pede medidas ao paciente.
 *
 * POST   /api/medico/pedidos-medicao  { consultaId, tipos: ("peso"|"altura"|"pressao")[] }
 *        → 200 { pedido: { id, consultaId, pacienteId, medicoId, tipos, status: "pendente", criadoEm } }
 *        Broadcast "pedido_medicao_criado" { pedidoId } no canal privado topicoSala(consultaId).
 *        Já existe pendente com os mesmos tipos nessa consulta → devolve o mesmo (jaExistia: true).
 * DELETE /api/medico/pedidos-medicao?id=...   (ou corpo { pedidoId })
 *        → só o médico do pedido; updateMany WHERE status='pendente' → 'cancelado'.
 *        409 { erro: "pedido_nao_pendente" } se nada mudou. Broadcast "pedido_medicao_cancelado" { pedidoId }.
 * Auditoria só com ids e tipos (nada de valores clínicos).
 */
const TIPOS = new Set(["peso", "altura", "pressao"]);

export async function POST(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const body = ((await req.json().catch(() => ({}))) ?? {}) as { consultaId?: string; tipos?: unknown };
    if (typeof body.consultaId !== "string" || !body.consultaId) {
      return Response.json({ erro: "Informe consultaId." }, { status: 400 });
    }
    // B-24: validação explícita de lista — o cast forçado comparava
    // comprimentos de não-listas e só funcionava por coincidência.
    if (!Array.isArray(body.tipos)) {
      return Response.json({ erro: "tipos: use peso, altura e/ou pressao." }, { status: 400 });
    }
    const tipos = [...new Set(body.tipos.filter((t): t is string => typeof t === "string" && TIPOS.has(t)))].sort();
    if (tipos.length === 0 || tipos.length !== body.tipos.length) {
      return Response.json({ erro: "tipos: use peso, altura e/ou pressao." }, { status: 400 });
    }
    const consulta = await db.consulta.findFirst({
      where: { id: body.consultaId, medicoId: medico.id },
      select: { id: true, pacienteId: true, status: true },
    });
    if (!consulta) return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
    if (consulta.status === "cancelada") return Response.json({ erro: "consulta_cancelada" }, { status: 409 });

    const tiposJson = JSON.stringify(tipos);
    // Sem pendentes duplicados: trava a linha da consulta (SELECT … FOR UPDATE)
    // e, dentro da mesma transação, procura um pendente com os mesmos tipos.
    const { pedido, existente } = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Consulta" WHERE "id" = ${consulta.id} FOR UPDATE`;
      const existente = await tx.pedidoMedicao.findFirst({
        where: { consultaId: consulta.id, medicoId: medico.id, status: "pendente", tipos: tiposJson },
      });
      const pedido =
        existente ??
        (await tx.pedidoMedicao.create({
          data: { consultaId: consulta.id, pacienteId: consulta.pacienteId, medicoId: medico.id, tipos: tiposJson },
        }));
      return { pedido, existente };
    });
    if (!existente) {
      after(() => broadcastCanal(topicoSala(consulta.id), "pedido_medicao_criado", { pedidoId: pedido.id }, { privado: true }));
      await registrarAudit(medico, {
        acao: "PEDIDO_MEDICAO_CRIADO",
        categoria: "prontuario",
        entidade: "pedidoMedicao",
        entidadeId: pedido.id,
        detalhes: `consultaId=${consulta.id} tipos=${tipos.join(",")}`,
      });
    }
    return ok({ pedido: wire(pedido), jaExistia: Boolean(existente) });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    let id = req.nextUrl.searchParams.get("id");
    if (!id) {
      const body = ((await req.json().catch(() => ({}))) ?? {}) as { pedidoId?: string };
      id = typeof body.pedidoId === "string" ? body.pedidoId : null;
    }
    if (!id) return Response.json({ erro: "Informe o id do pedido." }, { status: 400 });
    const pedido = await db.pedidoMedicao.findFirst({ where: { id, medicoId: medico.id }, select: { id: true, consultaId: true } });
    if (!pedido) return Response.json({ erro: "Pedido não encontrado." }, { status: 404 });
    const r = await db.pedidoMedicao.updateMany({
      where: { id, medicoId: medico.id, status: "pendente" },
      data: { status: "cancelado" },
    });
    if (r.count === 0) return Response.json({ erro: "pedido_nao_pendente" }, { status: 409 });
    if (pedido.consultaId) {
      const cid = pedido.consultaId;
      after(() => broadcastCanal(topicoSala(cid), "pedido_medicao_cancelado", { pedidoId: id }, { privado: true }));
    }
    await registrarAudit(medico, {
      acao: "PEDIDO_MEDICAO_CANCELADO",
      categoria: "prontuario",
      entidade: "pedidoMedicao",
      entidadeId: id,
      detalhes: pedido.consultaId ? `consultaId=${pedido.consultaId}` : undefined,
    });
    return ok({ pedido: { id, status: "cancelado" } });
  } catch (erro) {
    return falha(erro);
  }
}

function wire(p: { id: string; consultaId: string | null; pacienteId: string; medicoId: string; tipos: string; status: string; criadoEm: Date; atendidoEm: Date | null }) {
  let tipos: string[] = [];
  try { tipos = JSON.parse(p.tipos); } catch { tipos = []; }
  return {
    id: p.id, consultaId: p.consultaId, pacienteId: p.pacienteId, medicoId: p.medicoId, tipos,
    status: p.status, criadoEm: p.criadoEm.toISOString(), atendidoEm: p.atendidoEm?.toISOString() ?? null,
  };
}

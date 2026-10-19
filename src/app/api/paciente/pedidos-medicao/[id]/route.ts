import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { medidaCanonica } from "@/lib/medidas-paciente";
import { lerTiposPedido, validarResposta, type RespostaPedido } from "@/lib/saude-paciente";

/**
 * POST /api/paciente/pedidos-medicao/:id — o paciente responde o pedido.
 * Body: { peso?, altura?, sistolica?, diastolica? } (só os tipos pedidos contam).
 * Grava as Medicao (origem "pedido", pedidoId, consultaId) e marca o pedido
 * como atendido na MESMA transação; responder duas vezes dá 409.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const body = ((await req.json().catch(() => ({}))) ?? {}) as RespostaPedido;

    const pedido = await db.pedidoMedicao.findUnique({ where: { id } });
    if (!pedido || pedido.pacienteId !== usuario.id) {
      return Response.json({ erro: "Pedido não encontrado." }, { status: 404 });
    }
    if (pedido.status !== "pendente") {
      return Response.json({ erro: "Este pedido já foi respondido ou cancelado." }, { status: 409 });
    }
    const v = validarResposta(lerTiposPedido(pedido.tipos), body);
    if (!v.ok) return Response.json({ erro: v.erro }, { status: 400 });

    const criadas = await db.$transaction(async (tx) => {
      // Trava otimista: só um envio vira "atendido".
      const marcou = await tx.pedidoMedicao.updateMany({
        where: { id, pacienteId: usuario.id, status: "pendente" },
        data: { status: "atendido", atendidoEm: new Date() },
      });
      if (marcou.count !== 1) return null;
      const lista: Awaited<ReturnType<typeof tx.medicao.create>>[] = [];
      for (const m of v.medicoes) {
        lista.push(
          await tx.medicao.create({
            data: {
              usuarioId: usuario.id,
              tipo: m.tipo,
              valor1: m.valor1,
              ...(m.valor2 !== undefined ? { valor2: m.valor2 } : {}),
              origem: "pedido",
              pedidoId: id,
              consultaId: pedido.consultaId,
            },
          }),
        );
      }
      return lista;
    });
    if (!criadas) return Response.json({ erro: "Este pedido já foi respondido." }, { status: 409 });

    // Mesmo sincronismo de POST /api/medicoes (peso/altura atuais do perfil).
    const perfil: { peso?: string; altura?: string } = {};
    for (const m of v.medicoes) {
      if (m.tipo === "peso") perfil.peso = medidaCanonica(m.valor1);
      if (m.tipo === "altura") perfil.altura = medidaCanonica(m.valor1);
    }
    if (Object.keys(perfil).length) {
      await db.perfilPaciente.updateMany({ where: { userId: usuario.id }, data: perfil });
    }

    await aplicarSideEffects(usuario, undefined, {
      acao: "PEDIDO_MEDICAO_ATENDIDO",
      categoria: "prontuario",
      entidade: "pedidoMedicao",
      entidadeId: id,
      detalhes: v.medicoes.map((m) => `${m.tipo}: ${m.valor1}${m.valor2 ? `/${m.valor2}` : ""}`).join("; "),
    });

    return ok({
      pedidoId: id,
      medicoes: criadas.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        valor1: m.valor1,
        valor2: m.valor2 ?? undefined,
        criadoEm: m.criadoEm.toISOString(),
      })),
      ...(Object.keys(perfil).length ? { perfilPaciente: perfil } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}

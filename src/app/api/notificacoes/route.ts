import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";

/**
 * PATCH — marca notificação(ões) como lida(s): { id } ou { todas: true }.
 * Contrato delta: devolve APENAS as notificações que acabaram de ser marcadas.
 *
 * POST foi REMOVIDO por segurança (hardening): o cliente não pode criar
 * notificações arbitrando destinatário, título ou conteúdo — toda
 * notificação é gerada pelo servidor a partir do evento real
 * (ver rotas de mutação + src/lib/server/dados.ts).
 */
export async function POST() {
  try {
    await exigirSessao();
    return Response.json(
      { erro: "Criação de notificações pelo cliente não é permitida. Eventos são gerados pelo servidor." },
      { status: 405 },
    );
  } catch (erro) {
    return falha(erro);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as { id?: string; todas?: boolean };

    const paraWire = (r: {
      id: string;
      paraRole: string | null;
      tipo: string;
      titulo: string;
      texto: string;
      createdAt: Date;
    }) => ({
      id: r.id,
      paraRole: r.paraRole,
      tipo: r.tipo,
      titulo: r.titulo,
      texto: r.texto,
      lida: true,
      createdAt: r.createdAt.toISOString(),
    });

    if (body.todas) {
      const alvo = await db.notificacao.findMany({
        where: {
          lida: false,
          OR: [
            { usuarioId: usuario.id },
            { paraRole: usuario.role },
            { AND: [{ usuarioId: null }, { paraRole: null }] },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (alvo.length) {
        await db.notificacao.updateMany({
          where: { id: { in: alvo.map((n) => n.id) } },
          data: { lida: true },
        });
      }
      return ok({ notificacoes: alvo.map(paraWire) });
    }

    if (body.id) {
      // Mesma regra do original: dono da notificação ou destinatário por papel
      // (linhas de transmissão ampla são marcadas apenas por { todas: true }).
      const alvo = await db.notificacao.findFirst({
        where: {
          id: body.id,
          lida: false,
          OR: [{ usuarioId: usuario.id }, { paraRole: usuario.role }],
        },
      });
      if (alvo) {
        await db.notificacao.update({ where: { id: alvo.id }, data: { lida: true } });
        return ok({ notificacoes: [paraWire(alvo)] });
      }
    }

    return ok({ notificacoes: [] });
  } catch (erro) {
    return falha(erro);
  }
}

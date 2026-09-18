import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { carregarDados, type NotifPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * POST   — cria notificação(ões) enviadas pelo cliente (comportamento do antigo notificar()).
 * PATCH  — marca notificação(ões) como lida(s): { id } ou { todas: true }.
 */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as NotifPayload | { lista: NotifPayload[] };
    const lista = "lista" in body ? body.lista : [body];

    if (lista.length) {
      await db.notificacao.createMany({
        data: lista.map((n) => ({
          tipo: n.tipo,
          titulo: n.titulo,
          texto: n.texto,
          paraRole: n.para ? n.para.toUpperCase() : null,
          usuarioId: n.usuarioId ?? null,
        })),
      });
    }
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

/** PATCH — marca notificação(ões) como lida(s): { id } ou { todas: true }.
 *  Contrato delta: devolve APENAS as notificações que acabaram de ser marcadas. */
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

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

export async function PATCH(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as { id?: string; todas?: boolean };

    if (body.todas) {
      await db.notificacao.updateMany({
        where: {
          lida: false,
          OR: [
            { usuarioId: usuario.id },
            { paraRole: usuario.role },
            { AND: [{ usuarioId: null }, { paraRole: null }] },
          ],
        },
        data: { lida: true },
      });
    } else if (body.id) {
      await db.notificacao.updateMany({
        where: { id: body.id, OR: [{ usuarioId: usuario.id }, { paraRole: usuario.role }] },
        data: { lida: true },
      });
    }

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

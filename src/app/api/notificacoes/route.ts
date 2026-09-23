import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";

/**
 * PATCH — marca notificação(ões) como lida(s): { id } ou { todas: true }.
 * Contrato delta: devolve APENAS as notificações que acabaram de ser marcadas.
 *
 * V7 — leitura POR USUÁRIO: notificações dirigidas (usuarioId preenchido)
 * guardam "lida" na própria linha; BROADCASTS (usuarioId nulo, por papel ou
 * globais) são linhas COMPARTILHADAS — o estado de leitura fica em
 * NotificacaoLeitura, então marcar como lida NÃO apaga o badge dos demais
 * destinatários.
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

    // Visibilidade = mesma regra do bootstrap (dados.ts): dirigidas ao usuário,
    // broadcasts do seu papel e broadcasts globais.
    const visiveis = [
      { usuarioId: usuario.id },
      { usuarioId: null, paraRole: usuario.role },
      { usuarioId: null, paraRole: null },
    ];

    if (body.todas) {
      // Dirigidas não lidas + broadcasts ainda não lidos POR ESTE usuário
      const alvo = await db.notificacao.findMany({
        where: {
          OR: [
            { usuarioId: usuario.id, lida: false },
            {
              usuarioId: null,
              AND: [{ OR: visiveis.slice(1) }, { leituras: { none: { usuarioId: usuario.id } } }],
            },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      const dirigidas = alvo.filter((n) => n.usuarioId);
      const broadcasts = alvo.filter((n) => n.usuarioId === null);

      if (dirigidas.length) {
        await db.notificacao.updateMany({
          where: { id: { in: dirigidas.map((n) => n.id) } },
          data: { lida: true },
        });
      }
      if (broadcasts.length) {
        await db.notificacaoLeitura.createMany({
          data: broadcasts.map((n) => ({ notificacaoId: n.id, usuarioId: usuario.id })),
          skipDuplicates: true,
        });
      }
      return ok({ notificacoes: alvo.map(paraWire) });
    }

    if (body.id) {
      const alvo = await db.notificacao.findFirst({
        where: {
          id: body.id,
          OR: [
            { usuarioId: usuario.id, lida: false },
            {
              usuarioId: null,
              AND: [{ OR: visiveis.slice(1) }, { leituras: { none: { usuarioId: usuario.id } } }],
            },
          ],
        },
      });
      if (alvo) {
        if (alvo.usuarioId) {
          await db.notificacao.update({ where: { id: alvo.id }, data: { lida: true } });
        } else {
          await db.notificacaoLeitura.upsert({
            where: {
              notificacaoId_usuarioId: { notificacaoId: alvo.id, usuarioId: usuario.id },
            },
            create: { notificacaoId: alvo.id, usuarioId: usuario.id },
            update: {},
          });
        }
        return ok({ notificacoes: [paraWire(alvo)] });
      }
    }

    return ok({ notificacoes: [] });
  } catch (erro) {
    return falha(erro);
  }
}

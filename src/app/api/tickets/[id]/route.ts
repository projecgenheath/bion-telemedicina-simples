import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Resposta a chamado de suporte (apenas admin). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const usuario = await exigirPapel("ADMIN");
    const { id } = await params;
    const body = (await req.json()) as {
      resposta: string;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return Response.json({ erro: "Chamado não encontrado." }, { status: 404 });
    }

    await db.ticket.update({
      where: { id },
      data: {
        status: "resolvido",
        resposta: body.resposta?.trim(),
        respondidoPor: "Suporte BION",
        dataResposta: new Date(),
      },
    });

    await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "TICKET_RESPONDIDO",
        categoria: "suporte",
        detalhes: `Chamado "${ticket.assunto}" respondido`,
      }),
      entidade: "ticket",
      entidadeId: id,
    });

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

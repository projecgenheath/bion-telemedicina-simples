import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, ticketWire } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Resposta a chamado de suporte (apenas admin).
 *  Notificação ao autor do chamado e auditoria geradas PELO SERVIDOR. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const usuario = await exigirPapel("ADMIN");
    const { id } = await params;
    const body = (await req.json()) as { resposta: string };

    const ticket = await db.ticket.findUnique({
      where: { id },
      include: { usuario: { select: { nome: true } } },
    });
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

    // Contrato delta (auditoria FASE 2): devolve APENAS o chamado atualizado
    // + efeitos — a lista do admin não recarrega o app inteiro.
    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "suporte",
          titulo: "Chamado respondido",
          texto: `Seu chamado "${ticket.assunto}" foi respondido pela equipe de suporte.`,
          usuarioId: ticket.usuarioId,
        },
      ],
      {
        acao: "TICKET_RESPONDIDO",
        categoria: "suporte",
        entidade: "ticket",
        entidadeId: id,
        detalhes: `Chamado "${ticket.assunto}" respondido`,
      },
    );

    const atualizado = await db.ticket.findUnique({
      where: { id },
      include: { usuario: { select: { nome: true } } },
    });

    return ok({ ...(atualizado ? { ticket: ticketWire(atualizado) } : {}), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

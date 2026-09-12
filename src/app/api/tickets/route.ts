import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Abertura de chamado de suporte. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as {
      assunto: string;
      categoria: string;
      mensagem: string;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    if (!body.assunto?.trim() || !body.mensagem?.trim()) {
      return Response.json({ erro: "Informe assunto e mensagem do chamado." }, { status: 400 });
    }

    const ticket = await db.ticket.create({
      data: {
        usuarioId: usuario.id,
        perfil: usuario.role === "MEDICO" ? "medico" : "paciente",
        assunto: body.assunto.trim(),
        categoria: body.categoria || "outro",
        mensagem: body.mensagem.trim(),
      },
    });

    await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "TICKET_CRIADO",
        categoria: "suporte",
        detalhes: `Chamado "${body.assunto}" aberto por ${usuario.nome} (${body.categoria})`,
      }),
      entidade: "ticket",
      entidadeId: ticket.id,
    });

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

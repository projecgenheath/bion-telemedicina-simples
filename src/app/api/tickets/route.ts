import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { aplicarSideEffects, ticketWire } from "@/lib/server/dados";
import {ok, falha, lerCorpoJson, corpoObjeto, textoDoCorpo} from "@/lib/server/http";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";

/** Abertura de chamado de suporte.
 *  Notificações (autor + administração) e auditoria geradas PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    // M9 (auditoria): teto por usuário — abrir chamado é raro; 10/h (mesmo
    // teto do aceite de termos) barra spam ao suporte sem atrapalhar ninguém.
    const teto = await limitarAsync(`tickets:${usuario.id}`, 10, 3_600_000);
    if (!teto.permitido) return resposta429(teto.restanteSeg);
    // B1: guarda de objeto/tipo antes de .trim().
    const bruto = corpoObjeto(await lerCorpoJson(req));
    if (!bruto) {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }
    const body = {
      assunto: textoDoCorpo(bruto.assunto),
      categoria: textoDoCorpo(bruto.categoria),
      mensagem: textoDoCorpo(bruto.mensagem),
    };

    const assunto = body.assunto?.trim() ?? "";
    const mensagem = body.mensagem?.trim() ?? "";
    if (!assunto || !mensagem) {
      return Response.json({ erro: "Informe assunto e mensagem do chamado." }, { status: 400 });
    }

    const ticket = await db.ticket.create({
      data: {
        usuarioId: usuario.id,
        perfil: usuario.role === "MEDICO" ? "medico" : "paciente",
        assunto,
        categoria: body.categoria || "outro",
        mensagem,
      },
      include: { usuario: { select: { nome: true } } },
    });

    // Contrato delta (auditoria FASE 2): devolve APENAS o chamado criado
    // + efeitos — sem recarregar o estado inteiro.
    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "suporte",
          titulo: "Chamado aberto",
          texto: `Seu chamado "${ticket.assunto}" foi recebido por nossa equipe. Resposta em até 15 minutos.`,
          usuarioId: usuario.id,
        },
        {
          tipo: "suporte",
          titulo: "Novo chamado de suporte",
          texto: `${usuario.nome} (${ticket.perfil}) abriu chamado sobre: ${ticket.assunto}`,
          para: "admin",
        },
      ],
      {
        acao: "TICKET_CRIADO",
        categoria: "suporte",
        entidade: "ticket",
        entidadeId: ticket.id,
        detalhes: `Chamado "${ticket.assunto}" aberto por ${usuario.nome} (${ticket.categoria})`,
      },
    );

    return ok({ ticket: ticketWire(ticket), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

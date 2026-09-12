import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import {
  carregarDados,
  aplicarSideEffects,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * Mensageria assíncrona BION (paciente ↔ médico, e suporte BION).
 *
 * GET    — payload leve ({ mensagens }) para polling do cliente (~4s).
 * POST   — envia mensagem: { paraId, texto, notificacoes?, audit? }.
 *          Devolve o estado fresco completo (mesmo contrato das demais mutações).
 * PATCH  — marca conversa como lida: { comUsuarioId } → estado fresco.
 */

const MAX_TEXTO = 4000;

export async function GET() {
  try {
    const usuario = await exigirSessao();
    const mensagens = await db.mensagem.findMany({
      where: { OR: [{ deId: usuario.id }, { paraId: usuario.id }] },
      include: {
        de: { select: { nome: true } },
        para: { select: { nome: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return ok({
      mensagens: mensagens.map((m) => ({
        id: m.id,
        deId: m.deId,
        de: m.de.nome,
        paraId: m.paraId,
        para: m.para.nome,
        texto: m.texto,
        lida: m.lida,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as {
      paraId?: string;
      texto?: string;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    const texto = (body.texto ?? "").trim();
    if (!body.paraId || !texto) {
      return Response.json({ erro: "Informe destinatário e mensagem." }, { status: 400 });
    }
    if (texto.length > MAX_TEXTO) {
      return Response.json(
        { erro: `Mensagem muito longa (máximo de ${MAX_TEXTO} caracteres).` },
        { status: 400 },
      );
    }

    const destinatario = await db.user.findUnique({
      where: { id: body.paraId },
      select: { id: true, nome: true, status: true },
    });
    if (!destinatario || destinatario.status !== "ativo") {
      return Response.json({ erro: "Destinatário não encontrado ou inativo." }, { status: 404 });
    }
    if (destinatario.id === usuario.id) {
      return Response.json(
        { erro: "Você não pode enviar uma mensagem para si mesmo." },
        { status: 400 },
      );
    }

    await db.mensagem.create({
      data: { deId: usuario.id, paraId: destinatario.id, texto },
    });

    await aplicarSideEffects(usuario, body.notificacoes, body.audit);

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as { comUsuarioId?: string; todas?: boolean };

    if (body.comUsuarioId) {
      await db.mensagem.updateMany({
        where: { deId: body.comUsuarioId, paraId: usuario.id, lida: false },
        data: { lida: true },
      });
    } else if (body.todas) {
      await db.mensagem.updateMany({
        where: { paraId: usuario.id, lida: false },
        data: { lida: true },
      });
    }

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

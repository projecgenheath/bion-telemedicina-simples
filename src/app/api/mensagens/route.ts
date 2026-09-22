import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { aplicarSideEffects, carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * Mensageria assíncrona BION (paciente ↔ médico, e suporte BION).
 *
 * GET    — payload leve ({ mensagens }) para polling do cliente (~4s).
 * POST   — envia mensagem: { paraId, texto }. A notificação ao destinatário
 *          é gerada PELO SERVIDOR a partir do evento real.
 *          Contrato delta: devolve APENAS a mensagem criada.
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
      select: { id: true, nome: true, status: true, role: true },
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

    // HARDENING (V8): regra de relacionamento em TODOS os pares de papéis.
    //  - Paciente ↔ médico: exigem vínculo de consulta (paciente tem janela de
    //    30 dias após a consulta; o médico pode iniciar o contato profissional).
    //  - Paciente→paciente e médico→médico: bloqueados (o produto não oferece;
    //    IDs de médicos são públicos no diretório — sem a regra, qualquer um
    //    spammaria qualquer um).
    //  - Envolver ADMIN = suporte BION: permitido em ambos os sentidos.
    if (usuario.role !== "ADMIN" && destinatario.role !== "ADMIN") {
      if (usuario.role === destinatario.role) {
        return Response.json(
          { erro: "Esta conversa não é permitida na plataforma. Use o Suporte BION quando precisar." },
          { status: 403 },
        );
      }
      const pacienteId = usuario.role === "PACIENTE" ? usuario.id : destinatario.id;
      const medicoId = usuario.role === "MEDICO" ? usuario.id : destinatario.id;
      const consulta = await db.consulta.findFirst({
        where: { pacienteId, medicoId, status: { not: "cancelada" } },
        orderBy: { dataInicio: "desc" },
      });
      if (!consulta) {
        return Response.json(
          { erro: "Você pode enviar mensagens apenas a pacientes/médicos com quem tem consultas." },
          { status: 403 },
        );
      }
      if (usuario.role === "PACIENTE") {
        const janelaDias = 30;
        const limite = consulta.dataInicio.getTime() + janelaDias * 86_400_000;
        if (Date.now() > limite) {
          return Response.json(
            {
              erro: `A conversa com ${destinatario.nome} se encerrou 30 dias após a consulta. Para novos assuntos, agende outra consulta.`,
            },
            { status: 403 },
          );
        }
      }
    }

    const msg = await db.mensagem.create({
      data: { deId: usuario.id, paraId: destinatario.id, texto },
      include: {
        de: { select: { nome: true } },
        para: { select: { nome: true } },
      },
    });

    // Notificação gerada pelo SERVIDOR a partir do evento real (o cliente
    // não define destinatário/título/conteúdo de notificações).
    const recorte = texto.trim().slice(0, 80);
    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "mensagem",
          titulo: `Nova mensagem de ${usuario.nome || "BION"}`,
          texto: recorte.length < texto.trim().length ? `${recorte}…` : recorte,
          usuarioId: destinatario.id,
        },
      ],
      undefined,
    );

    // Contrato delta: devolve APENAS a mensagem criada (+ efeitos colaterais
    // criados, quando visíveis ao próprio usuário).
    return ok({
      mensagem: {
        id: msg.id,
        deId: msg.deId,
        de: msg.de.nome,
        paraId: msg.paraId,
        para: msg.para.nome,
        texto: msg.texto,
        lida: msg.lida,
        createdAt: msg.createdAt.toISOString(),
      },
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
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

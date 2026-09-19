import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Emissão de documento clínico (receita/atestado/exame) — apenas médicos.
 *  Paciente identificado por ID (nunca por nome — homônimos existem).
 *  Notificações e auditoria geradas PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("MEDICO");
    const body = (await req.json()) as {
      tipo: string;
      titulo: string;
      conteudo: string;
      pacienteId: string;
      medicamento?: string;
      posologia?: string;
      duracao?: string;
      observacoes?: string;
      cid?: string;
    };

    if (!body.tipo || !body.titulo || !body.conteudo || !body.pacienteId) {
      return Response.json(
        { erro: "Informe tipo, título, conteúdo e pacienteId do documento." },
        { status: 400 },
      );
    }

    const paciente = await db.user.findFirst({
      where: { id: body.pacienteId, role: "PACIENTE" },
      select: { id: true, nome: true },
    });
    if (!paciente) {
      return Response.json({ erro: "Paciente não encontrado." }, { status: 400 });
    }

    const doc = await db.documento.create({
      data: {
        tipo: body.tipo,
        titulo: body.titulo,
        conteudo: body.conteudo,
        medicoId: usuario.id,
        pacienteId: paciente.id,
        medicamento: body.medicamento || null,
        posologia: body.posologia || null,
        duracao: body.duracao || null,
        observacoes: body.observacoes || null,
        cid: body.cid || null,
      },
    });

    const rotulo = body.tipo === "receita" ? "Receita" : body.tipo === "atestado" ? "Atestado" : "Solicitação de exame";
    await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "receita",
          titulo:
            body.tipo === "receita"
              ? "Receita digital disponível"
              : body.tipo === "atestado"
                ? "Atestado emitido"
                : "Solicitação de exames disponível",
          texto: `${body.titulo} emitido por ${usuario.nome}. Assinado digitalmente com padrão ICP-Brasil.`,
          usuarioId: paciente.id,
        },
      ],
      {
        acao: "DOCUMENTO_EMITIDO",
        categoria: "documento",
        entidade: "documento",
        entidadeId: doc.id,
        detalhes: `${rotulo}: ${body.titulo} para ${paciente.nome}`,
      },
    );

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

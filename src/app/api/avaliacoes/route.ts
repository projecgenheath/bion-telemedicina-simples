import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Registro de avaliação de consulta (apenas pacientes).
 *  Notificações e auditoria geradas PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as {
      consultaId?: string;
      medicoId: string;
      nota: number;
      comentario?: string;
      pontualidade?: number;
      atencao?: number;
      clareza?: number;
    };

    const medico = await db.user.findFirst({
      where: { id: body.medicoId, role: "MEDICO" },
      include: { perfilMedico: true },
    });
    if (!medico?.perfilMedico) {
      return Response.json({ erro: "Médico não encontrado." }, { status: 400 });
    }
    const nota = Math.min(5, Math.max(1, Math.round(body.nota)));

    await db.avaliacao.create({
      data: {
        consultaId: body.consultaId || null,
        pacienteId: usuario.id,
        medicoId: medico.id,
        nota,
        comentario: body.comentario || null,
        pontualidade: body.pontualidade,
        atencao: body.atencao,
        clareza: body.clareza,
      },
    });

    // Atualização incremental da média do médico
    const perfil = medico.perfilMedico;
    const novaMedia = (perfil.avaliacao * perfil.numAvaliacoes + nota) / (perfil.numAvaliacoes + 1);
    await db.perfilMedico.update({
      where: { userId: medico.id },
      data: { avaliacao: Number(novaMedia.toFixed(1)), numAvaliacoes: { increment: 1 } },
    });

    await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "agenda",
          titulo: "Avaliação enviada",
          texto: `Você avaliou ${medico.nome} com ${nota} estrela(s). Obrigado pelo retorno!`,
          usuarioId: usuario.id,
        },
        {
          tipo: "mensagem",
          titulo: "Nova avaliação recebida",
          texto: `${usuario.nome} avaliou seu atendimento com ${nota} estrela(s).${body.comentario ? ` "${body.comentario.slice(0, 80)}"` : ""}`,
          usuarioId: medico.id,
        },
      ],
      {
        acao: "AVALIACAO_REGISTRADA",
        categoria: "consulta",
        entidade: "avaliacao",
        detalhes: `Avaliação ${nota} estrela(s) para ${medico.nome}${body.comentario ? ` — "${body.comentario.slice(0, 80)}"` : ""}`,
      },
    );

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

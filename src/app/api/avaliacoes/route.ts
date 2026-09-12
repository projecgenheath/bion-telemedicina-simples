import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Registro de avaliação de consulta (apenas pacientes). */
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
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
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

    await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "AVALIACAO_REGISTRADA",
        categoria: "consulta",
        detalhes: `Avaliação ${nota} estrela(s) para ${medico.nome}${body.comentario ? ` — "${body.comentario.slice(0, 80)}"` : ""}`,
      }),
      entidade: "avaliacao",
    });

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

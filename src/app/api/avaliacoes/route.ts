import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Registro de avaliação de consulta (apenas pacientes).
 *  Notificações e auditoria geradas PELO SERVIDOR.
 *
 *  HARDENING (V2): avaliar exige PROVA DE ATENDIMENTO — o servidor deriva a
 *  consulta concluída do próprio paciente com o médico avaliado (e sem
 *  avaliação anterior); consultaId informado no body é validado contra a
 *  sessão (nada de vincular a consulta de terceiro). Notas limitadas a 1–5;
 *  comentário limitado a 500 caracteres. */
const clampNota = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
};

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
    const nota = clampNota(body.nota);
    if (!nota) {
      return Response.json({ erro: "A nota deve ser de 1 a 5 estrelas." }, { status: 400 });
    }

    // Prova de atendimento: consulta CONCLUÍDA do próprio paciente com o
    // médico avaliado. Se o cliente mandou consultaId, ela deve ser EXATAMENTE
    // essa (dona + médico certo); sem consultaId, o servidor usa a consulta
    // mais recente ainda não avaliada — e nenhuma consulta, nenhuma avaliação.
    let consultaVinculada: { id: string; medicoId: string } | null = null;
    if (body.consultaId) {
      const c = await db.consulta.findFirst({
        where: { id: body.consultaId, pacienteId: usuario.id, status: "concluida" },
        select: { id: true, medicoId: true },
      });
      if (!c) {
        return Response.json(
          { erro: "Consulta inválida para avaliação." },
          { status: 403 },
        );
      }
      if (c.medicoId !== medico.id) {
        return Response.json(
          { erro: "Esta avaliação pertence a outro médico." },
          { status: 403 },
        );
      }
      consultaVinculada = c;
    } else {
      const candidatas = await db.consulta.findMany({
        where: { pacienteId: usuario.id, medicoId: medico.id, status: "concluida" },
        orderBy: { dataInicio: "desc" },
        select: { id: true, medicoId: true },
      });
      const jaAvaliadas = new Set(
        (
          await db.avaliacao.findMany({
            where: { pacienteId: usuario.id, medicoId: medico.id, consultaId: { not: null } },
            select: { consultaId: true },
          })
        )
          .map((a) => a.consultaId)
          .filter(Boolean) as string[],
      );
      consultaVinculada = candidatas.find((c) => !jaAvaliadas.has(c.id)) ?? null;
    }
    if (!consultaVinculada) {
      return Response.json(
        { erro: "Só é possível avaliar consultas já realizadas com este médico." },
        { status: 403 },
      );
    }
    const duplicada = await db.avaliacao.findFirst({
      where: { consultaId: consultaVinculada.id },
      select: { id: true },
    });
    if (duplicada) {
      return Response.json(
        { erro: "Esta consulta já foi avaliada." },
        { status: 409 },
      );
    }

    await db.avaliacao.create({
      data: {
        consultaId: consultaVinculada.id,
        pacienteId: usuario.id,
        medicoId: medico.id,
        nota,
        comentario: body.comentario?.trim().slice(0, 500) || null,
        pontualidade: clampNota(body.pontualidade),
        atencao: clampNota(body.atencao),
        clareza: clampNota(body.clareza),
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

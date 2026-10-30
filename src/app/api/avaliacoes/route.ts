import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, avaliacaoWire, medicoWire } from "@/lib/server/dados";
import { agendarPushNotificacao } from "@/lib/server/push-notificacao";
import { notaReal } from "@/lib/server/notas-medico";
import {ok, falha, lerCorpoJson} from "@/lib/server/http";

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
    const body = (await lerCorpoJson(req)) as {
      consultaId?: string;
      medicoId: string;
      nota: number;
      comentario?: string;
      pontualidade?: number;
      atencao?: number;
      clareza?: number;
    };

    if (!body) {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }

    // M1: medicoId precisa ser uma string presente e sã ANTES de qualquer
    // query — no Prisma, `undefined` no where é ignorado e o findFirst
    // devolveria o PRIMEIRO médico do banco (a prova de atendimento seria
    // testada contra um médico que o paciente não avaliou).
    if (typeof body.medicoId !== "string" || !body.medicoId.trim() || body.medicoId.length > 64) {
      return Response.json({ erro: "Médico não informado." }, { status: 400 });
    }

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

    // M3: a checagem de duplicada acima é a primeira camada (mensagem
    // amigável); a garantia contra corrida é o índice único de
    // Avaliacao.consultaId no banco — dois POSTs concorrentes fazem o 2º
    // create bater no P2002, que vira o mesmo 409.
    const avaliacao = await db.avaliacao
      .create({
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
        include: {
          // B-6: id para o wire filtrar por identificador (nunca por nome)
          paciente: { select: { id: true, nome: true } },
          medico: { select: { id: true, nome: true, perfilMedico: { select: { especialidade: true } } } },
        },
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === "P2002") return null;
        throw e;
      });
    if (!avaliacao) {
      return Response.json(
        { erro: "Esta consulta já foi avaliada." },
        { status: 409 },
      );
    }

    // Média recalculada só com avaliações reais (o perfil podia trazer
    // nota do seed, ex.: 4.9 com 312, que não pode entrar na conta).
    const real = await notaReal(medico.id);
    await db.perfilMedico.update({
      where: { userId: medico.id },
      data: { avaliacao: real.avaliacao, numAvaliacoes: real.numAvaliacoes },
    });

    // Contrato delta (auditoria FASE 2): devolve APENAS a avaliação criada +
    // o médico atualizado (nova média) + efeitos — sem recarregar o estado.
    const efeitos = await aplicarSideEffects(
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

    // Item 12: a "Nova avaliação recebida" também vira Web Push para o
    // médico (título genérico, sem nome do paciente nem comentário).
    agendarPushNotificacao(medico.id, "Nova avaliação recebida", "/medico");

    const perfilAtualizado = await db.perfilMedico.findUnique({
      where: { userId: medico.id },
      include: { user: { select: { id: true, nome: true } } },
    });

    return ok({
      avaliacao: avaliacaoWire(avaliacao),
      ...(perfilAtualizado ? { medico: medicoWire(perfilAtualizado, real) } : {}),
      ...efeitos,
    });
  } catch (erro) {
    return falha(erro);
  }
}

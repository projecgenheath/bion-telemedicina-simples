import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Criação de lembretes de saúde (apenas pacientes).
 *  Notificações e auditoria geradas PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as {
      titulo: string;
      horario: string;
      tipo: string;
      frequencia: string;
      medicamento?: string;
    };

    if (!body.titulo?.trim()) {
      return Response.json({ erro: "Informe o título do lembrete." }, { status: 400 });
    }

    const lembrete = await db.lembrete.create({
      data: {
        usuarioId: usuario.id,
        titulo: body.titulo.trim(),
        horario: body.horario || "08:00",
        tipo: body.tipo || "Medicação",
        frequencia: body.frequencia || "Todos os dias",
        medicamento: body.medicamento || null,
      },
    });

    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "lembrete",
          titulo: "Lembrete criado",
          texto: `${lembrete.titulo} programado para ${lembrete.horario} (${lembrete.frequencia}).`,
          usuarioId: usuario.id,
        },
      ],
      {
        acao: "LEMBRETE_CRIADO",
        categoria: "sistema",
        entidade: "lembrete",
        entidadeId: lembrete.id,
        detalhes: `Lembrete "${lembrete.titulo}" — ${lembrete.horario} (${lembrete.frequencia})`,
      },
    );

    // Contrato delta: devolve APENAS o lembrete criado (+ efeitos colaterais).
    return ok({
      lembrete: {
        id: lembrete.id,
        titulo: lembrete.titulo,
        horario: lembrete.horario,
        tipo: lembrete.tipo,
        frequencia: lembrete.frequencia,
        feito: lembrete.feito,
        medicamento: lembrete.medicamento,
      },
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}

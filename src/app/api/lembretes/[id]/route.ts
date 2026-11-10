import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import {ok, falha, lerCorpoJson} from "@/lib/server/http";

/** Marca/desmarca conclusão (PATCH) ou remove (DELETE) um lembrete do próprio usuário.
 *  Contrato delta: devolve APENAS o lembrete afetado — sem estado fresco completo. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const body = (await lerCorpoJson(req)) as { feito: boolean };

    if (!body) {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }

    const lembrete = await db.lembrete.findUnique({ where: { id } });
    if (!lembrete || lembrete.usuarioId !== usuario.id) {
      return Response.json({ erro: "Lembrete não encontrado." }, { status: 404 });
    }

    // F7: grava QUANDO foi marcado (feitoEm) — o feito vale para o dia da
    // clínica em que foi marcado e volta a pendente no dia seguinte
    // (regra pura em src/lib/lembrete-ciclo.ts). CAST DE ATIVAÇÃO: a
    // coluna chega pela migração 20261104a (NÃO APLICADA) e o model
    // Prisma só a ganha depois dela (convenção do repo: schema não anda
    // na frente do banco). Se a coluna ainda não existe, o update com o
    // campo extra falha — por isso ele vai separado e engolido: o toggle
    // do `feito` (comportamento atual) nunca quebra por causa do F7.
    const atualizado = await db.lembrete.update({
      where: { id },
      data: { feito: !!body.feito },
    });
    const feitoEm = body.feito ? new Date() : null;
    await db.lembrete
      .update({ where: { id }, data: { feitoEm } })
      .catch(() => null);
    return ok({
      lembrete: {
        id: atualizado.id,
        titulo: atualizado.titulo,
        horario: atualizado.horario,
        tipo: atualizado.tipo,
        frequencia: atualizado.frequencia,
        feito: atualizado.feito,
        feitoEm: feitoEm ? feitoEm.toISOString() : null,
        medicamento: atualizado.medicamento,
      },
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;

    const lembrete = await db.lembrete.findUnique({ where: { id } });
    if (!lembrete || lembrete.usuarioId !== usuario.id) {
      return Response.json({ erro: "Lembrete não encontrado." }, { status: 404 });
    }

    await db.lembrete.delete({ where: { id } });
    return ok({ lembreteRemovido: id });
  } catch (erro) {
    return falha(erro);
  }
}

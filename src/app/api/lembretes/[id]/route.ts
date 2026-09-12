import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Marca/desmarca conclusão (PATCH) ou remove (DELETE) um lembrete do próprio usuário. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const body = (await req.json()) as { feito: boolean };

    const lembrete = await db.lembrete.findUnique({ where: { id } });
    if (!lembrete || lembrete.usuarioId !== usuario.id) {
      return Response.json({ erro: "Lembrete não encontrado." }, { status: 404 });
    }

    await db.lembrete.update({ where: { id }, data: { feito: !!body.feito } });
    const dados = await carregarDados(usuario);
    return ok(dados);
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
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

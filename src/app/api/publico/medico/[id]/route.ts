import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notaReal } from "@/lib/server/notas-medico";

/**
 * Dados PÚBLICOS do médico (sem informações sensíveis) — sustenta a página
 * compartilhável /p/[id]. P1-5 da auditoria: antes consultava a tabela
 * Supabase "medicos", que não existe no esquema Prisma nem em migração
 * alguma (404 permanente em qualquer deploy novo), não tinha try/catch e
 * era bloqueada pelo middleware (401 para visitantes anônimos, derrotando
 * o propósito do link de divulgação). Agora:
 *  - lê pelo Prisma (PerfilMedico + User), só campos públicos;
 *  - só status "ativo" (o legado filtrava por status no banco);
 *  - try/catch com 404 apropriado (nunca 500 não tratado);
 *  - liberada no middleware (ver PUBLICOS em src/middleware.ts).
 * Rate limit / abuso: a rota só devolve dados já públicos de médicos ativos.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || id.length > 64) {
      return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
    }

    const perfil = await db.perfilMedico.findUnique({
      where: { userId: id },
      select: {
        userId: true,
        crm: true,
        especialidade: true,
        bio: true,
        valor: true,
        foto: true,
        status: true,
        horariosDisponiveis: true,
        user: { select: { id: true, nome: true, role: true, status: true } },
      },
    });

    if (!perfil || perfil.status !== "ativo" || perfil.user?.role !== "MEDICO" || perfil.user?.status !== "ativo") {
      return NextResponse.json({ erro: "Médico não encontrado" }, { status: 404 });
    }

    // Só avaliações reais (mesma regra do medicoWire) — nunca o valor do seed.
    const nota = await notaReal(id);

    return NextResponse.json({
      id: perfil.userId,
      nome: perfil.user.nome,
      especialidade: perfil.especialidade,
      crm: perfil.crm,
      bio: perfil.bio ?? "",
      valor: perfil.valor,
      avaliacao: nota.avaliacao,
      numAvaliacoes: nota.numAvaliacoes,
      foto: perfil.foto ?? undefined,
      horariosDisponiveis: JSON.parse(perfil.horariosDisponiveis || "[]") as string[],
    });
  } catch (erro) {
    // Banco fora do ar ou inesperado: 404 de perfil público é mais seguro
    // (não vaza detalhes internos do servidor ao visitante anônimo).
    console.error("[api/publico/medico] falha:", erro);
    return NextResponse.json({ erro: "Médico não encontrado" }, { status: 404 });
  }
}

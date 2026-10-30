import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notaReal } from "@/lib/server/notas-medico";
import { limitarAsync, obterIp, resposta429 } from "@/lib/server/rate-limit";

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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // B11: rota ANÔNIMA com agregação por requisição — rate-limit por IP
    // (padrão limitarAsync do repo) contra scraping em lote/DoS leve.
    const teto = await limitarAsync(`publico-medico:ip:${obterIp(req)}`, 60, 60_000);
    if (!teto.permitido) return resposta429(teto.restanteSeg);
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
        subespecialidades: true,
        formacao: true,
        experiencia: true,
        idiomas: true,
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

    return NextResponse.json(
      {
        id: perfil.userId,
        nome: perfil.user.nome,
        especialidade: perfil.especialidade,
        crm: perfil.crm,
        // Formação/atuação: os mesmos campos públicos do medicoWire (o
        // diretório já os expõe a pacientes autenticados) — a página
        // compartilhável mostra o perfil completo, não só a bio.
        subespecialidades: JSON.parse(perfil.subespecialidades || "[]") as string[],
        formacao: perfil.formacao ?? "",
        experiencia: perfil.experiencia ?? "",
        idiomas: JSON.parse(perfil.idiomas || "[]") as string[],
        bio: perfil.bio ?? "",
        valor: perfil.valor,
        avaliacao: nota.avaliacao,
        numAvaliacoes: nota.numAvaliacoes,
        foto: perfil.foto ?? undefined,
        horariosDisponiveis: JSON.parse(perfil.horariosDisponiveis || "[]") as string[],
      },
      // B11: dados públicos e pouco voláteis — cache compartilhado de 60 s
      // reduz a agregação repetida no banco.
      { headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  } catch (erro) {
    // Banco fora do ar ou inesperado: 404 de perfil público é mais seguro
    // (não vaza detalhes internos do servidor ao visitante anônimo).
    console.error("[api/publico/medico] falha:", erro);
    return NextResponse.json({ erro: "Médico não encontrado" }, { status: 404 });
  }
}

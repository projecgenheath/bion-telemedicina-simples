import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * Exames laboratoriais do paciente (app imersivo — seção 3).
 *
 * GET    — lista do próprio paciente.
 * POST   — cadastro manual: { titulo, dataColeta, itens: [{nome, valor, unidade, refMin?, refMax?}] }.
 * DELETE — remove: { id }.
 */
export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const exames = await db.exameLaboratorial.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { dataColeta: "asc" },
      take: 200,
    });
    return ok({
      exames: exames.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        dataColeta: e.dataColeta.toISOString(),
        itens: JSON.parse(e.itens || "[]"),
        arquivoNome: e.arquivoNome ?? undefined,
        origem: e.origem,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

type ItemExame = { nome: string; valor: number; unidade: string; refMin?: number; refMax?: number };

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as {
      titulo?: string;
      dataColeta?: string;
      itens?: ItemExame[];
    };

    const titulo = (body.titulo ?? "").trim();
    if (!titulo || !Array.isArray(body.itens) || !body.itens.length) {
      return Response.json({ erro: "Informe o título do exame e ao menos um resultado." }, { status: 400 });
    }
    const itensValidos = body.itens.filter(
      (i) => i?.nome && Number.isFinite(Number(i.valor)),
    );
    if (!itensValidos.length) {
      return Response.json({ erro: "Nenhum resultado válido informado." }, { status: 400 });
    }

    const dataColeta = body.dataColeta ? new Date(body.dataColeta) : new Date();

    await db.exameLaboratorial.create({
      data: {
        usuarioId: usuario.id,
        titulo: titulo.slice(0, 120),
        dataColeta: Number.isNaN(dataColeta.getTime()) ? new Date() : dataColeta,
        itens: JSON.stringify(
          itensValidos.slice(0, 40).map((i) => ({
            nome: String(i.nome).slice(0, 120),
            valor: Number(i.valor),
            unidade: String(i.unidade ?? "").slice(0, 30),
            ...(Number.isFinite(Number(i.refMin)) ? { refMin: Number(i.refMin) } : {}),
            ...(Number.isFinite(Number(i.refMax)) ? { refMax: Number(i.refMax) } : {}),
          })),
        ),
        origem: "manual",
      },
    });

    await aplicarSideEffects(usuario, undefined, {
      acao: "EXAME_REGISTRADO",
      categoria: "prontuario",
      detalhes: `Exame "${titulo}" registrado manualmente (${itensValidos.length} resultados)`,
    });

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as { id?: string };
    if (!body.id) {
      return Response.json({ erro: "Informe o exame a remover." }, { status: 400 });
    }
    // Exclusão escopada no próprio usuário (sem chance de remover de outro paciente)
    await db.exameLaboratorial.deleteMany({
      where: { id: body.id, usuarioId: usuario.id },
    });
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

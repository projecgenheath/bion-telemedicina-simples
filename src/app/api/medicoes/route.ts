import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * Medições do paciente (app imersivo — peso, altura, pressão arterial).
 *
 * GET  — lista do próprio paciente.
 * POST — registra medição: { tipo: "peso" | "altura" | "pa", valor1, valor2? }.
 *        Auditoria gerada PELO SERVIDOR. Sincroniza peso/altura do perfil.
 */
const TIPOS = ["peso", "altura", "pa"] as const;

export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const medicoes = await db.medicao.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { criadoEm: "asc" },
      take: 200,
    });
    return ok({
      medicoes: medicoes.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        valor1: m.valor1,
        valor2: m.valor2 ?? undefined,
        criadoEm: m.criadoEm.toISOString(),
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as {
      tipo?: string;
      valor1?: number;
      valor2?: number;
    };

    const tipo = body.tipo ?? "";
    if (!TIPOS.includes(tipo as (typeof TIPOS)[number]) || typeof body.valor1 !== "number" || !Number.isFinite(body.valor1)) {
      return Response.json(
        { erro: "Informe o tipo da medição (peso, altura ou pa) e um valor numérico." },
        { status: 400 },
      );
    }
    if (tipo === "pa" && (body.valor1 < 50 || body.valor1 > 300)) {
      return Response.json({ erro: "Pressão sistólica fora do intervalo plausível (50–300)." }, { status: 400 });
    }
    if (tipo === "pa" && body.valor2 !== undefined && (body.valor2 < 30 || body.valor2 > 200)) {
      return Response.json({ erro: "Pressão diastólica fora do intervalo plausível (30–200)." }, { status: 400 });
    }
    if (tipo === "peso" && (body.valor1 < 20 || body.valor1 > 400)) {
      return Response.json({ erro: "Peso fora do intervalo plausível (20–400 kg)." }, { status: 400 });
    }
    if (tipo === "altura" && (body.valor1 < 50 || body.valor1 > 250)) {
      return Response.json({ erro: "Altura fora do intervalo plausível (50–250 cm)." }, { status: 400 });
    }

    const medicao = await db.medicao.create({
      data: {
        usuarioId: usuario.id,
        tipo,
        valor1: body.valor1,
        ...(tipo === "pa" && typeof body.valor2 === "number" ? { valor2: body.valor2 } : {}),
      },
    });

    // Sincroniza os valores atuais do perfil (peso/altura usados pelo app e pelo médico)
    const perfilAtualizado: { peso?: string; altura?: string } = {};
    if (tipo === "peso") {
      perfilAtualizado.peso = String(body.valor1);
      await db.perfilPaciente.updateMany({
        where: { userId: usuario.id },
        data: { peso: String(body.valor1) },
      });
    } else if (tipo === "altura") {
      perfilAtualizado.altura = String(body.valor1);
      await db.perfilPaciente.updateMany({
        where: { userId: usuario.id },
        data: { altura: String(body.valor1) },
      });
    }

    const efeitos = await aplicarSideEffects(usuario, undefined, {
      acao: "MEDICAO_REGISTRADA",
      categoria: "prontuario",
      detalhes: `Medição de ${tipo}: ${body.valor1}${tipo === "pa" && body.valor2 ? `/${body.valor2}` : ""}`,
    });

    // Contrato delta: devolve APENAS a medição criada + o valor do perfil
    // sincronizado — sem recarregar o estado inteiro.
    return ok({
      medicao: {
        id: medicao.id,
        tipo: medicao.tipo,
        valor1: medicao.valor1,
        valor2: medicao.valor2 ?? undefined,
        criadoEm: medicao.criadoEm.toISOString(),
      },
      ...(Object.keys(perfilAtualizado).length ? { perfilPaciente: perfilAtualizado } : {}),
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}

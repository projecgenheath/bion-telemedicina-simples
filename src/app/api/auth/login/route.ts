import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { criarSessao, verificarSenha, registrarAudit } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  try {
    const { email, senha } = (await req.json()) as { email?: string; senha?: string };
    if (!email || !senha) {
      return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
    }

    const user = await db.user.findFirst({
      where: { email: email.trim().toLowerCase() },
    });

    // Mensagem genérica para não revelar se o e-mail existe
    if (!user || !(await verificarSenha(senha, user.senhaHash))) {
      return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
    }

    if (user.status === "inativo") {
      return NextResponse.json(
        { erro: "Sua conta está inativa. Entre em contato com o suporte." },
        { status: 403 },
      );
    }
    if (user.status === "suspenso") {
      return NextResponse.json(
        { erro: "Sua conta está suspensa. Entre em contato com o suporte." },
        { status: 403 },
      );
    }

    await criarSessao(user.id);
    const usuario = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role as "PACIENTE" | "MEDICO" | "ADMIN",
    };
    await registrarAudit(usuario, {
      acao: "LOGIN",
      categoria: "autenticacao",
      detalhes: "Login realizado com sucesso",
    });
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

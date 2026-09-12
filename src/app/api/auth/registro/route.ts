import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { criarSessao, hashSenha, registrarAudit } from "@/lib/server/auth";
import { carregarDados, slugEmail } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      nome?: string;
      email?: string;
      senha?: string;
      cpf?: string;
    };

    const nome = body.nome?.trim();
    const email = body.email?.trim().toLowerCase();
    const senha = body.senha ?? "";

    if (!nome || nome.length < 3) {
      return NextResponse.json({ erro: "Informe seu nome completo." }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ erro: "Informe um e-mail válido." }, { status: 400 });
    }
    if (senha.length < 6) {
      return NextResponse.json(
        { erro: "A senha deve ter pelo menos 6 caracteres." },
        { status: 400 },
      );
    }

    const existente = await db.user.findUnique({ where: { email } });
    if (existente) {
      return NextResponse.json({ erro: "Já existe uma conta com este e-mail." }, { status: 409 });
    }

    const senhaHash = await hashSenha(senha);
    const user = await db.user.create({
      data: {
        nome,
        email,
        senhaHash,
        role: "PACIENTE",
        perfilPaciente: { create: { cpf: body.cpf?.trim() ?? "" } },
      },
    });

    await criarSessao(user.id);
    const usuario = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: "PACIENTE" as const,
    };
    await registrarAudit(usuario, {
      acao: "CADASTRO_REALIZADO",
      categoria: "autenticacao",
      detalhes: `Novo paciente cadastrado: ${nome}`,
    });
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

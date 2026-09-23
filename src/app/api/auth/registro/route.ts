import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { criarSessao, hashSenha, registrarAudit } from "@/lib/server/auth";
import { carregarDados, slugEmail } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  limitar,
  obterIp,
  resposta429,
  validarSenhaForte,
  LIMITE_REGISTRO_IP_POR_HORA,
} from "@/lib/server/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      nome?: string;
      email?: string;
      senha?: string;
      cpf?: string;
    };

    // P0 — anti-spam de contas: teto de auto-cadastro por IP por hora.
    const teto = limitar(`registro:ip:${obterIp(req)}`, LIMITE_REGISTRO_IP_POR_HORA, 3_600_000);
    if (!teto.permitido) {
      return resposta429(teto.restanteSeg);
    }

    const nome = body.nome?.trim();
    const email = body.email?.trim().toLowerCase();
    const senha = body.senha ?? "";

    // P0 — senha mínima 10 caracteres com letras e números (política única).
    const erroSenha = validarSenhaForte(senha);
    if (erroSenha) {
      return NextResponse.json({ erro: erroSenha }, { status: 400 });
    }

    if (!nome || nome.length < 3) {
      return NextResponse.json({ erro: "Informe seu nome completo." }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ erro: "Informe um e-mail válido." }, { status: 400 });
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
      precisaTrocarSenha: user.precisaTrocarSenha,
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

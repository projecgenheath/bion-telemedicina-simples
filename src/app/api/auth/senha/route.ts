import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  exigirSessao,
  hashSenha,
  verificarSenha,
  tokenSessaoAtual,
  registrarAudit,
} from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";

/**
 * V4 — Troca de senha autenticada.
 *
 * Contas criadas pela administração nascem com senha padrão (bion123) e o
 * flag `precisaTrocarSenha` ativo — o app bloqueia o uso até a troca. A
 * senha escolhida substitui o hash, limpa o flag e REVOGA as demais sessões
 * do usuário (a sessão atual permanece válida).
 *
 * POST { senhaAtual, novaSenha } → 200 { mensagem }
 */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as { senhaAtual?: string; novaSenha?: string };

    const senhaAtual = body.senhaAtual ?? "";
    const novaSenha = body.novaSenha ?? "";

    if (!senhaAtual || !novaSenha) {
      return Response.json(
        { erro: "Informe a senha atual e a nova senha." },
        { status: 400 },
      );
    }

    if (novaSenha.length < 8 || novaSenha.length > 64) {
      return Response.json(
        { erro: "A nova senha deve ter entre 8 e 64 caracteres." },
        { status: 400 },
      );
    }
    if (!/[A-Za-z]/.test(novaSenha) || !/[0-9]/.test(novaSenha)) {
      return Response.json(
        { erro: "A nova senha deve conter letras e números." },
        { status: 400 },
      );
    }
    if (novaSenha === senhaAtual) {
      return Response.json(
        { erro: "A nova senha deve ser diferente da atual." },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({ where: { id: usuario.id } });
    if (!user) {
      return Response.json({ erro: "Usuário não encontrado." }, { status: 404 });
    }
    if (!(await verificarSenha(senhaAtual, user.senhaHash))) {
      return Response.json({ erro: "A senha atual está incorreta." }, { status: 401 });
    }

    await db.user.update({
      where: { id: usuario.id },
      data: { senhaHash: await hashSenha(novaSenha), precisaTrocarSenha: false },
    });

    // Revoga TODAS as outras sessões (a atual permanece — o usuário continua navegando)
    const tokenAtual = await tokenSessaoAtual();
    await db.sessao.deleteMany({
      where: { userId: usuario.id, ...(tokenAtual ? { id: { not: tokenAtual } } : {}) },
    });

    await registrarAudit(usuario, {
      acao: "SENHA_ALTERADA",
      categoria: "autenticacao",
      severidade: "info",
      detalhes: "Senha alterada pelo próprio usuário; demais sessões revogadas",
    });

    return ok({ mensagem: "Senha alterada com sucesso." });
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { criarSessao, verificarSenha, registrarAudit } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  limitar,
  consultar,
  resetar,
  obterIp,
  resposta429,
  LIMITE_LOGIN_IP_POR_MIN,
  MAX_FALHAS_LOGIN,
  JANELA_FALHAS_MS,
} from "@/lib/server/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { email, senha } = (await req.json()) as { email?: string; senha?: string };
    if (!email || !senha) {
      return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
    }

    // P0 — anti-força bruta: teto por IP + bloqueio por falhas acumuladas
    // (IP+e-mail). Sucesso reseta as falhas; só FALHAS contam para o bloqueio.
    const ip = obterIp(req);
    const tetoIp = limitar(`login:ip:${ip}`, LIMITE_LOGIN_IP_POR_MIN, 60_000);
    if (!tetoIp.permitido) {
      return resposta429(tetoIp.restanteSeg);
    }

    const emailNorm = email.trim().toLowerCase();
    const chaveFalhas = `login:falha:${ip}:${emailNorm}`;
    if (consultar(chaveFalhas, JANELA_FALHAS_MS) >= MAX_FALHAS_LOGIN) {
      await registrarAudit(null, {
        acao: "LOGIN_BLOQUEADO_RATE_LIMIT",
        categoria: "autenticacao",
        severidade: "critical",
        detalhes: `${MAX_FALHAS_LOGIN}+ falhas para ${emailNorm} no IP ${ip} — tentativas bloqueadas por 10 min`,
      });
      return resposta429(
        JANELA_FALHAS_MS / 1000,
        "Muitas tentativas para esta conta. Aguarde alguns minutos e tente novamente.",
      );
    }

    const user = await db.user.findFirst({
      where: { email: emailNorm },
    });

    // Mensagem genérica para não revelar se o e-mail existe
    if (!user || !(await verificarSenha(senha, user.senhaHash))) {
      limitar(chaveFalhas, MAX_FALHAS_LOGIN, JANELA_FALHAS_MS);
      return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
    }
    resetar(chaveFalhas);

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
      precisaTrocarSenha: user.precisaTrocarSenha,
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

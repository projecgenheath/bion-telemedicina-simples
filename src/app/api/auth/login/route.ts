import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  criarSessaoLegada,
  verificarSenha,
  registrarAudit,
  garantirUsuarioPrismaDeAuth,
  supabaseAdminOuNull,
} from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { emailNorm, isErro } from "@/lib/server/validar";
import {
  limitarAsync,
  consultarAsync,
  resetarAsync,
  obterIp,
  resposta429,
  LIMITE_LOGIN_IP_POR_MIN,
  MAX_FALHAS_LOGIN,
  JANELA_FALHAS_MS,
} from "@/lib/server/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/env";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; senha?: string };
    const emailOk = emailNorm(body.email);
    if (isErro(emailOk) || !body.senha) {
      return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
    }
    const senha = body.senha;
    const emailNormado = emailOk;

    const ip = obterIp(req);
    const tetoIp = await limitarAsync(`login:ip:${ip}`, LIMITE_LOGIN_IP_POR_MIN, 60_000);
    if (!tetoIp.permitido) return resposta429(tetoIp.restanteSeg);

    const chaveFalhas = `login:falha:${ip}:${emailNormado}`;
    if ((await consultarAsync(chaveFalhas, JANELA_FALHAS_MS)) >= MAX_FALHAS_LOGIN) {
      await registrarAudit(null, {
        acao: "LOGIN_BLOQUEADO_RATE_LIMIT",
        categoria: "autenticacao",
        severidade: "critical",
        detalhes: `${MAX_FALHAS_LOGIN}+ falhas para ${emailNormado} no IP ${ip}`,
      });
      return resposta429(
        JANELA_FALHAS_MS / 1000,
        "Muitas tentativas para esta conta. Aguarde alguns minutos e tente novamente.",
      );
    }

    // --- Caminho principal: Supabase Auth ---
    if (supabaseConfigurado()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNormado,
        password: senha,
      });

      if (!error && data.user) {
        await resetarAsync(chaveFalhas);
        // A5: a senha recém-validada no Auth serve de prova para vincular uma
        // conta legada de mesmo e-mail; sem prova, 409 e a sessão Auth é
        // encerrada (não fica cookie de um Auth sem usuário vinculado).
        let row: Awaited<ReturnType<typeof garantirUsuarioPrismaDeAuth>>;
        try {
          row = await garantirUsuarioPrismaDeAuth({
            supabaseId: data.user.id,
            email: emailNormado,
            nome: (data.user.user_metadata?.nome as string) || emailNormado.split("@")[0],
            senhaParaVincular: senha,
          });
        } catch (erroVinculo) {
          await supabase.auth.signOut().catch(() => {});
          throw erroVinculo;
        }
        if (row.status !== "ativo") {
          await supabase.auth.signOut();
          return NextResponse.json(
            { erro: row.status === "suspenso" ? "Sua conta está suspensa." : "Sua conta está inativa." },
            { status: 403 },
          );
        }
        const usuario = {
          id: row.id,
          nome: row.nome,
          email: row.email,
          role: row.role as "PACIENTE" | "MEDICO" | "ADMIN",
          precisaTrocarSenha: row.precisaTrocarSenha,
          supabaseId: row.supabaseId,
        };
        await registrarAudit(usuario, {
          acao: "LOGIN",
          categoria: "autenticacao",
          detalhes: "Login via Supabase Auth",
        });
        return ok(await carregarDados(usuario));
      }

      // Conta legada Prisma (bcrypt): valida e provisiona no Auth
      const legado = await db.user.findFirst({ where: { email: emailNormado } });
      if (legado && (await verificarSenha(senha, legado.senhaHash))) {
        if (legado.status !== "ativo") {
          return NextResponse.json(
            {
              erro:
                legado.status === "suspenso"
                  ? "Sua conta está suspensa. Entre em contato com o suporte."
                  : "Sua conta está inativa. Entre em contato com o suporte.",
            },
            { status: 403 },
          );
        }
        const admin = supabaseAdminOuNull();
        if (admin) {
          // Cria no Auth se ainda não existir
          if (!legado.supabaseId) {
            const created = await admin.auth.admin.createUser({
              email: emailNormado,
              password: senha,
              email_confirm: true,
              user_metadata: { nome: legado.nome },
            });
            if (created.data.user) {
              await db.user.update({
                where: { id: legado.id },
                data: { supabaseId: created.data.user.id },
              });
            }
          }
          // Sessão no cookie via sign-in
          await supabase.auth.signInWithPassword({ email: emailNormado, password: senha });
        } else {
          // Sem service role: mantém cookie legado
          await criarSessaoLegada(legado.id);
        }
        await resetarAsync(chaveFalhas);
        const usuario = {
          id: legado.id,
          nome: legado.nome,
          email: legado.email,
          role: legado.role as "PACIENTE" | "MEDICO" | "ADMIN",
          precisaTrocarSenha: legado.precisaTrocarSenha,
          supabaseId: legado.supabaseId,
        };
        await registrarAudit(usuario, {
          acao: "LOGIN",
          categoria: "autenticacao",
          detalhes: "Login legado migrado/ Supabase parcial",
        });
        return ok(await carregarDados(usuario));
      }

      await limitarAsync(chaveFalhas, MAX_FALHAS_LOGIN, JANELA_FALHAS_MS);
      return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
    }

    // --- Fallback sem Supabase configurado (dev) ---
    const user = await db.user.findFirst({ where: { email: emailNormado } });
    if (!user || !(await verificarSenha(senha, user.senhaHash))) {
      await limitarAsync(chaveFalhas, MAX_FALHAS_LOGIN, JANELA_FALHAS_MS);
      return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
    }
    await resetarAsync(chaveFalhas);
    if (user.status !== "ativo") {
      return NextResponse.json({ erro: "Conta indisponível." }, { status: 403 });
    }
    await criarSessaoLegada(user.id);
    const usuario = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role as "PACIENTE" | "MEDICO" | "ADMIN",
      precisaTrocarSenha: user.precisaTrocarSenha,
    };
    await registrarAudit(usuario, { acao: "LOGIN", categoria: "autenticacao", detalhes: "Login legado" });
    return ok(await carregarDados(usuario));
  } catch (erro) {
    return falha(erro);
  }
}

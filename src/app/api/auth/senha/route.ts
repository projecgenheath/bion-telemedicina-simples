import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  exigirSessaoPermitindoTrocaSenha,
  hashSenha,
  verificarSenha,
  tokenSessaoAtual,
  registrarAudit,
  supabaseAdminOuNull,
} from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import {
  limitarAsync,
  consultarAsync,
  resetarAsync,
  obterIp,
  resposta429,
  validarSenhaForte,
  MAX_FALHAS_SENHA,
  JANELA_FALHAS_MS,
} from "@/lib/server/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/env";

/**
 * Troca de senha autenticada.
 * - Atualiza hash Prisma (legado / fallback)
 * - Se houver Supabase Auth, atualiza a senha no Auth (fonte da verdade do login)
 * - Revoga sessões legadas extras
 */
export async function POST(req: NextRequest) {
  try {
    // Única rota (junto de sessao/logout) liberada com troca de senha pendente.
    const usuario = await exigirSessaoPermitindoTrocaSenha();
    const body = (await req.json()) as { senhaAtual?: string; novaSenha?: string };

    const senhaAtual = body.senhaAtual ?? "";
    const novaSenha = body.novaSenha ?? "";

    if (!senhaAtual || !novaSenha) {
      return Response.json(
        { erro: "Informe a senha atual e a nova senha." },
        { status: 400 },
      );
    }

    const erroSenha = validarSenhaForte(novaSenha);
    if (erroSenha) {
      return Response.json({ erro: erroSenha }, { status: 400 });
    }
    if (novaSenha === senhaAtual) {
      return Response.json(
        { erro: "A nova senha deve ser diferente da atual." },
        { status: 400 },
      );
    }

    const chaveFalhas = `senha:falha:${usuario.id}:${obterIp(req)}`;
    if ((await consultarAsync(chaveFalhas, JANELA_FALHAS_MS)) >= MAX_FALHAS_SENHA) {
      await registrarAudit(usuario, {
        acao: "TROCA_SENHA_BLOQUEADA_RATE_LIMIT",
        categoria: "autenticacao",
        severidade: "critical",
        detalhes: `${MAX_FALHAS_SENHA}+ falhas na senha atual — tentativas bloqueadas por 10 min`,
      });
      return resposta429(
        JANELA_FALHAS_MS / 1000,
        "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      );
    }

    const user = await db.user.findUnique({ where: { id: usuario.id } });
    if (!user) {
      return Response.json({ erro: "Usuário não encontrado." }, { status: 404 });
    }

    // Valida senha atual: bcrypt legado OU Supabase Auth
    let senhaOk = await verificarSenha(senhaAtual, user.senhaHash);
    if (!senhaOk && supabaseConfigurado() && user.email) {
      try {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: senhaAtual,
        });
        senhaOk = !error;
      } catch {
        senhaOk = false;
      }
    }

    if (!senhaOk) {
      await limitarAsync(chaveFalhas, MAX_FALHAS_SENHA, JANELA_FALHAS_MS);
      return Response.json({ erro: "A senha atual está incorreta." }, { status: 401 });
    }
    await resetarAsync(chaveFalhas);

    // 1) Supabase Auth (preferencial)
    if (supabaseConfigurado()) {
      try {
        const supabase = await createSupabaseServerClient();
        const { error: updErr } = await supabase.auth.updateUser({ password: novaSenha });
        if (updErr) {
          // Fallback: admin API se o usuário estiver linkado
          const admin = supabaseAdminOuNull();
          if (admin && user.supabaseId) {
            const { error: adminErr } = await admin.auth.admin.updateUserById(user.supabaseId, {
              password: novaSenha,
            });
            if (adminErr) {
              return Response.json(
                { erro: adminErr.message || "Não foi possível atualizar a senha no Auth." },
                { status: 400 },
              );
            }
          } else {
            return Response.json(
              { erro: updErr.message || "Não foi possível atualizar a senha no Auth." },
              { status: 400 },
            );
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha ao atualizar senha no Supabase.";
        return Response.json({ erro: msg }, { status: 500 });
      }
    }

    // 2) Espelho Prisma (login legado / migração)
    await db.user.update({
      where: { id: usuario.id },
      data: { senhaHash: await hashSenha(novaSenha), precisaTrocarSenha: false },
    });

    const tokenAtual = await tokenSessaoAtual();
    await db.sessao.deleteMany({
      where: { userId: usuario.id, ...(tokenAtual ? { id: { not: tokenAtual } } : {}) },
    });

    await registrarAudit(usuario, {
      acao: "SENHA_ALTERADA",
      categoria: "autenticacao",
      severidade: "info",
      detalhes: supabaseConfigurado()
        ? "Senha alterada no Supabase Auth + Prisma; demais sessões legadas revogadas"
        : "Senha alterada (Prisma); demais sessões revogadas",
    });

    return ok({ mensagem: "Senha alterada com sucesso." });
  } catch (erro) {
    return falha(erro);
  }
}

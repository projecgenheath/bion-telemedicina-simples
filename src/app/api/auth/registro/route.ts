import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  criarSessaoLegada,
  hashSenha,
  registrarAudit,
} from "@/lib/server/auth";
import { usuarioSemNome } from "@/lib/server/audit-sem-nome";
import { carregarDados } from "@/lib/server/dados";
import {ok, falha, lerCorpoJson, corpoObjeto, textoDoCorpo} from "@/lib/server/http";

/**
 * B3: cadastro NÃO pode enumerar contas — dizer "já existe conta com este
 * e-mail" (ou CPF) a um visitante anônimo confirma que e-mail/CPF pertencem
 * a um paciente. Duplicado devolve esta resposta genérica, indistinguível
 * entre e-mail, CPF e falha do provedor de Auth.
 */
const ERRO_CADASTRO_GENERICO =
  "Não foi possível concluir o cadastro com os dados informados. Se você já tem uma conta, faça login; se o problema continuar, fale com o suporte.";
import {
  limitarAsync,
  obterIp,
  resposta429,
  validarSenhaForte,
  LIMITE_REGISTRO_IP_POR_HORA,
} from "@/lib/server/rate-limit";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/env";
import { validarCpf } from "@/lib/server/validar-perfil";
import { cpfEmUsoPorOutroPaciente } from "@/lib/server/cpf-paciente";
import { validarAceiteTermos } from "@/lib/aceite-termos";
import { auditarAceiteCadastro, gravarAceiteCadastro, type LinhasAceite } from "@/lib/server/aceite-termos";

/** Remove a conta recém-criada no Supabase Auth (best effort, via service role). */
async function desfazerAuth(supabaseId: string) {
  try {
    // Nunca apaga um Auth que já pertence a uma conta existente na BION.
    if (await db.user.findUnique({ where: { supabaseId }, select: { id: true } })) return;
    const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(supabaseId);
    if (error) throw error;
  } catch {
    await registrarAudit(null, {
      acao: "CADASTRO_ROLLBACK_AUTH_FALHOU",
      categoria: "autenticacao",
      severidade: "critical",
      entidade: "supabase_auth",
      entidadeId: supabaseId,
      detalhes: "Transação do cadastro falhou e a conta no Supabase Auth não pôde ser removida",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    // B1 (mesma família): guarda de objeto/tipo antes de .trim().
    const bruto = corpoObjeto(await lerCorpoJson(req));
    if (!bruto) {
      return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }
    const body = {
      nome: textoDoCorpo(bruto.nome),
      email: textoDoCorpo(bruto.email),
      senha: textoDoCorpo(bruto.senha),
      cpf: textoDoCorpo(bruto.cpf),
      aceiteTermos: bruto.aceiteTermos,
    };

    const teto = await limitarAsync(
      `registro:ip:${obterIp(req)}`,
      LIMITE_REGISTRO_IP_POR_HORA,
      3_600_000,
    );
    if (!teto.permitido) return resposta429(teto.restanteSeg);

    const nome = body.nome?.trim();
    const email = body.email?.trim().toLowerCase();
    const senha = body.senha ?? "";

    const erroSenha = validarSenhaForte(senha);
    if (erroSenha) return NextResponse.json({ erro: erroSenha }, { status: 400 });
    if (!nome || nome.length < 3) {
      return NextResponse.json({ erro: "Informe seu nome completo." }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ erro: "Informe um e-mail válido." }, { status: 400 });
    }

    // Aceite obrigatório dos Termos de Uso do Paciente e da Política de
    // Privacidade (versões vigentes). Validado ANTES de criar qualquer conta.
    const aceite = validarAceiteTermos("PACIENTE", body.aceiteTermos);
    if (!aceite.ok) {
      return NextResponse.json({ erro: aceite.erro, campo: "aceiteTermos" }, { status: 400 });
    }

    const existente = await db.user.findUnique({ where: { email } });
    if (existente) {
      // B3: genérico (não confirma que o e-mail tem conta).
      return NextResponse.json({ erro: ERRO_CADASTRO_GENERICO }, { status: 409 });
    }

    // M4: CPF opcional, mas se vier precisa ter dígitos verificadores válidos
    // (gravado como 000.000.000-00) e não pode pertencer a outro paciente.
    // Validado ANTES de criar a conta no Supabase Auth.
    let cpf = "";
    if (body.cpf !== undefined && body.cpf !== null) {
      const rc = validarCpf(body.cpf);
      if (!rc.ok) return NextResponse.json({ erro: rc.erro, campo: "cpf" }, { status: 400 });
      cpf = rc.valor;
      if (cpf && (await cpfEmUsoPorOutroPaciente(cpf))) {
        // B3: genérico, sem campo — não confirma que o CPF tem conta.
        return NextResponse.json({ erro: ERRO_CADASTRO_GENERICO }, { status: 409 });
      }
    }

    // --- Supabase Auth (usuário aparece em Authentication → Users) ---
    if (supabaseConfigurado()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      });
      if (error || !data.user) {
        // B3: nunca repassar o error.message cru do Supabase (ele distingue
        // "usuário já registrado" de outros erros — enumeração + vazamento
        // de detalhe do provedor). Detalhe fica só no log do servidor.
        if (error) console.error("[registro] Supabase Auth recusou o cadastro:", error.message);
        return NextResponse.json({ erro: ERRO_CADASTRO_GENERICO }, { status: 400 });
      }
      const supabaseId = data.user.id;

      // Usuário + perfil + aceite numa transação só (tudo ou nada). Se falhar,
      // desfaz também a conta no Supabase Auth para não sobrar conta sem aceite.
      const senhaHash = await hashSenha(senha);
      let criado: { row: { id: string; nome: string; email: string; precisaTrocarSenha: boolean; supabaseId: string | null }; linhas: LinhasAceite };
      try {
        criado = await db.$transaction(async (tx) => {
          const row = await tx.user.create({
            data: { supabaseId, nome, email, senhaHash, role: "PACIENTE", perfilPaciente: { create: { cpf } } },
          });
          const linhas = await gravarAceiteCadastro(tx, row.id, "PACIENTE", aceite.valor);
          return { row, linhas };
        });
      } catch {
        await desfazerAuth(supabaseId);
        return NextResponse.json(
          { erro: "Não foi possível concluir o cadastro. Tente novamente." },
          { status: 500 },
        );
      }

      const usuario = {
        id: criado.row.id,
        nome: criado.row.nome,
        email: criado.row.email,
        role: "PACIENTE" as const,
        precisaTrocarSenha: criado.row.precisaTrocarSenha,
        supabaseId: criado.row.supabaseId,
      };
      // Auditoria antes do retorno de "confirme o e-mail" (aceite já gravado).
      await auditarAceiteCadastro(usuario, "PACIENTE", aceite.valor, criado.linhas);
      await registrarAudit(usuarioSemNome(usuario), {
        acao: "CADASTRO_REALIZADO",
        categoria: "autenticacao",
        entidade: "usuario",
        entidadeId: usuario.id,
        detalhes: "Novo paciente via Supabase Auth",
      });

      // Se o projeto exige confirmação de e-mail, pode não haver sessão ainda
      if (!data.session) {
        return NextResponse.json(
          {
            erro:
              "Conta criada. Confirme o e-mail (se exigido no Supabase) e faça login.",
            precisaConfirmarEmail: true,
          },
          { status: 201 },
        );
      }
      return ok(await carregarDados(usuario));
    }

    // --- Fallback sem Supabase ---
    const senhaHash = await hashSenha(senha);
    const { user, linhas } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { nome, email, senhaHash, role: "PACIENTE", perfilPaciente: { create: { cpf } } },
      });
      const linhas = await gravarAceiteCadastro(tx, user.id, "PACIENTE", aceite.valor);
      return { user, linhas };
    });
    await criarSessaoLegada(user.id);
    const usuario = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: "PACIENTE" as const,
      precisaTrocarSenha: user.precisaTrocarSenha,
    };
    await auditarAceiteCadastro(usuario, "PACIENTE", aceite.valor, linhas);
    await registrarAudit(usuarioSemNome(usuario), {
      acao: "CADASTRO_REALIZADO",
      categoria: "autenticacao",
      entidade: "usuario",
      entidadeId: usuario.id,
      detalhes: "Novo paciente (legado)",
    });
    return ok(await carregarDados(usuario));
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  criarSessaoLegada,
  hashSenha,
  registrarAudit,
  garantirUsuarioPrismaDeAuth,
} from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  limitarAsync,
  obterIp,
  resposta429,
  validarSenhaForte,
  LIMITE_REGISTRO_IP_POR_HORA,
} from "@/lib/server/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/env";
import { validarCpf } from "@/lib/server/validar-perfil";
import { cpfEmUsoPorOutroPaciente, ERRO_CPF_EM_USO } from "@/lib/server/cpf-paciente";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      nome?: string;
      email?: string;
      senha?: string;
      cpf?: string;
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

    const existente = await db.user.findUnique({ where: { email } });
    if (existente) {
      return NextResponse.json({ erro: "Já existe uma conta com este e-mail." }, { status: 409 });
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
        return NextResponse.json({ erro: ERRO_CPF_EM_USO, campo: "cpf" }, { status: 409 });
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
        return NextResponse.json(
          { erro: error?.message || "Não foi possível criar a conta no Supabase Auth." },
          { status: 400 },
        );
      }

      const senhaHash = await hashSenha(senha);
      const row = await garantirUsuarioPrismaDeAuth({
        supabaseId: data.user.id,
        email,
        nome,
        senhaHash,
      });
      // CPF se enviado
      if (cpf) {
        await db.perfilPaciente.upsert({
          where: { userId: row.id },
          create: { userId: row.id, cpf },
          update: { cpf },
        });
      }

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

      const usuario = {
        id: row.id,
        nome: row.nome,
        email: row.email,
        role: "PACIENTE" as const,
        precisaTrocarSenha: row.precisaTrocarSenha,
        supabaseId: row.supabaseId,
      };
      await registrarAudit(usuario, {
        acao: "CADASTRO_REALIZADO",
        categoria: "autenticacao",
        detalhes: `Novo paciente via Supabase Auth: ${nome}`,
      });
      return ok(await carregarDados(usuario));
    }

    // --- Fallback sem Supabase ---
    const senhaHash = await hashSenha(senha);
    const user = await db.user.create({
      data: {
        nome,
        email,
        senhaHash,
        role: "PACIENTE",
        perfilPaciente: { create: { cpf } },
      },
    });
    await criarSessaoLegada(user.id);
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
      detalhes: `Novo paciente (legado): ${nome}`,
    });
    return ok(await carregarDados(usuario));
  } catch (erro) {
    return falha(erro);
  }
}

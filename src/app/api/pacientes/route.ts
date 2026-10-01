import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, hashSenha } from "@/lib/server/auth";
import { aplicarSideEffects, pacienteWire } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { gerarSenhaTemporaria } from "@/lib/server/senha-temporaria";
import { emailNorm, isErro } from "@/lib/server/validar";
import { cpfEmUsoPorOutroPaciente } from "@/lib/server/cpf-paciente";
import {
  campoDuplicadoPrisma,
  ERRO_CPF_DUPLICADO_ADMIN,
  ERRO_EMAIL_DUPLICADO_ADMIN,
  validarPacienteAdmin,
} from "@/lib/server/validar-paciente-admin";

/**
 * Cadastro de paciente pela administração. Auditoria gerada PELO SERVIDOR.
 *
 * Validação (mesmos helpers do perfil do paciente — #8): CPF com dígitos
 * verificadores e único entre pacientes (409), telefone brasileiro com DDD,
 * data de nascimento "YYYY-MM-DD" opcional (não futura, idade razoável),
 * gravada como dia de calendário (coluna DATE). Dado inválido => 400.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    const body = (await req.json().catch(() => null)) as { nome?: unknown; email?: unknown } | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }

    if (typeof body.nome !== "string" || !body.nome.trim()) {
      return Response.json({ erro: "O nome do paciente é obrigatório." }, { status: 400 });
    }

    const validacao = validarPacienteAdmin(body);
    if (!validacao.ok) {
      return Response.json({ erro: validacao.erro, campo: validacao.campo }, { status: 400 });
    }
    const { dados } = validacao.valor;

    // Auditoria admin (C2): e-mail REAL obrigatório — não é mais gerado a
    // partir do nome (login adivinhável).
    const emailOk = emailNorm(body.email);
    if (isErro(emailOk)) {
      return Response.json({ erro: "Informe um e-mail válido do paciente." }, { status: 400 });
    }
    const email = emailOk;
    if (await db.user.findUnique({ where: { email } })) {
      return Response.json({ erro: ERRO_EMAIL_DUPLICADO_ADMIN, campo: "email" }, { status: 409 });
    }
    // CPF único entre pacientes: checagem prévia (mensagem clara); a corrida
    // fica com o índice único do #8 (P2002 tratado abaixo).
    if (dados.cpf && (await cpfEmUsoPorOutroPaciente(dados.cpf))) {
      return Response.json({ erro: ERRO_CPF_DUPLICADO_ADMIN, campo: "cpf" }, { status: 409 });
    }

    // Auditoria admin (C2): senha temporária ALEATÓRIA por conta (antes era
    // uma senha fixa pública). Devolvida uma única vez ao admin, abaixo.
    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await hashSenha(senhaTemporaria);
    let user;
    try {
      user = await db.user.create({
        data: {
          nome: dados.nome ?? body.nome.trim(),
          email,
          senhaHash,
          role: "PACIENTE",
          status: dados.status ?? "ativo",
          // V4: nasce com senha temporária — troca obrigatória no primeiro acesso
          // (bloqueada no servidor por exigirSessao enquanto pendente)
          precisaTrocarSenha: true,
          perfilPaciente: {
            create: {
              telefone: dados.telefone ?? "",
              cpf: dados.cpf ?? "",
              idade: dados.idade ?? 0,
              // Dia de calendário (meia-noite UTC → DATE), sem conversão de fuso.
              dataNascimento: dados.dataNascimento ?? null,
              genero: dados.genero ?? "",
              convenio: dados.convenio ?? "Particular",
            },
          },
        },
      });
    } catch (erro) {
      const campo = campoDuplicadoPrisma(erro);
      if (campo === "cpf") return Response.json({ erro: ERRO_CPF_DUPLICADO_ADMIN, campo }, { status: 409 });
      if (campo === "email") return Response.json({ erro: ERRO_EMAIL_DUPLICADO_ADMIN, campo }, { status: 409 });
      throw erro;
    }

    // Contrato delta (auditoria FASE 2): devolve APENAS o paciente criado
    // + auditoria — sem recarregar o estado inteiro do admin.
    const efeitos = await aplicarSideEffects(admin, undefined, {
      acao: "PACIENTE_CRIADO",
      categoria: "admin",
      entidade: "paciente",
      entidadeId: user.id,
      detalhes: `Paciente ${user.nome} cadastrado`,
    });

    const criado = await db.user.findFirst({
      where: { id: user.id },
      include: { perfilPaciente: true },
    });

    // `credenciais` só existe NESTA resposta (não é persistida em texto puro
    // nem gravada na auditoria): a UI mostra uma vez para o admin repassar.
    return ok({
      ...(criado ? { paciente: pacienteWire(criado) } : {}),
      ...efeitos,
      credenciais: { email, senhaTemporaria },
    });
  } catch (erro) {
    return falha(erro);
  }
}

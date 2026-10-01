import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, hashSenha } from "@/lib/server/auth";
import { aplicarSideEffects, pacienteWire } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { gerarSenhaTemporaria } from "@/lib/server/senha-temporaria";
import { emailNorm, isErro } from "@/lib/server/validar";

/** Cadastro de paciente pela administração. Auditoria gerada PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    const body = (await req.json()) as {
      nome: string;
      email?: string;
      telefone?: string;
      cpf?: string;
      idade?: number;
      genero?: string;
      convenio?: string;
      status?: string;
    };

    if (!body.nome?.trim()) {
      return Response.json({ erro: "O nome do paciente é obrigatório." }, { status: 400 });
    }

    // Auditoria admin (C2): e-mail REAL obrigatório — não é mais gerado a
    // partir do nome (login adivinhável).
    const emailOk = emailNorm(body.email);
    if (isErro(emailOk)) {
      return Response.json({ erro: "Informe um e-mail válido do paciente." }, { status: 400 });
    }
    const email = emailOk;
    if (await db.user.findUnique({ where: { email } })) {
      return Response.json({ erro: "Já existe uma conta com este e-mail." }, { status: 409 });
    }

    // Auditoria admin (C2): senha temporária ALEATÓRIA por conta (antes era
    // uma senha fixa pública). Devolvida uma única vez ao admin, abaixo.
    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await hashSenha(senhaTemporaria);
    const user = await db.user.create({
      data: {
        nome: body.nome.trim(),
        email,
        senhaHash,
        role: "PACIENTE",
        status: body.status ?? "ativo",
        // V4: nasce com senha temporária — troca obrigatória no primeiro acesso
        // (bloqueada no servidor por exigirSessao enquanto pendente)
        precisaTrocarSenha: true,
        perfilPaciente: {
          create: {
            telefone: body.telefone ?? "",
            cpf: body.cpf ?? "",
            idade: body.idade ?? 0,
            genero: body.genero ?? "",
            convenio: body.convenio ?? "Particular",
          },
        },
      },
    });

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

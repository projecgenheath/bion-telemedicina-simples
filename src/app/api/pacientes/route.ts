import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, hashSenha } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, slugEmail, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

const SENHA_PADRAO = "bion123";

/** Cadastro de paciente pela administração. */
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
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    if (!body.nome?.trim()) {
      return Response.json({ erro: "O nome do paciente é obrigatório." }, { status: 400 });
    }

    let email = body.email?.trim().toLowerCase();
    if (!email) {
      email = slugEmail(body.nome, "bion.app");
      let tentativa = 1;
      while (await db.user.findUnique({ where: { email: email! } })) {
        email = slugEmail(body.nome, "bion.app").replace("@", `${++tentativa}@`);
      }
    }
    if (await db.user.findUnique({ where: { email } })) {
      return Response.json({ erro: "Já existe uma conta com este e-mail." }, { status: 409 });
    }

    const senhaHash = await hashSenha(SENHA_PADRAO);
    const user = await db.user.create({
      data: {
        nome: body.nome.trim(),
        email,
        senhaHash,
        role: "PACIENTE",
        status: body.status ?? "ativo",
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

    await aplicarSideEffects(admin, body.notificacoes, {
      ...(body.audit ?? {
        acao: "PACIENTE_CRIADO",
        categoria: "admin",
        detalhes: `Paciente ${body.nome} cadastrado`,
      }),
      entidade: "paciente",
      entidadeId: user.id,
    });

    const dados = await carregarDados(admin);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

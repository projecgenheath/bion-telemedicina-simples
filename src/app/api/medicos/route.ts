import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, hashSenha } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, slugEmail, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

const SENHA_PADRAO = "bion123";

/** Cadastro de médico pela administração. */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    const body = (await req.json()) as {
      nome: string;
      crm: string;
      especialidade: string;
      subespecialidades?: string[];
      valor?: number;
      formacao?: string;
      experiencia?: string;
      idiomas?: string[];
      bio?: string;
      horariosDisponiveis?: string[];
      status?: string;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    if (!body.nome?.trim() || !body.crm?.trim() || !body.especialidade?.trim()) {
      return Response.json({ erro: "Nome, CRM e especialidade são obrigatórios." }, { status: 400 });
    }

    let email = slugEmail(body.nome, "med.bion.app");
    let tentativa = 1;
    while (await db.user.findUnique({ where: { email } })) {
      email = slugEmail(body.nome, "med.bion.app").replace("@", `${++tentativa}@`);
    }

    const senhaHash = await hashSenha(SENHA_PADRAO);
    const user = await db.user.create({
      data: {
        nome: body.nome.trim(),
        email,
        senhaHash,
        role: "MEDICO",
        perfilMedico: {
          create: {
            crm: body.crm.trim(),
            especialidade: body.especialidade.trim(),
            valor: body.valor ?? 150,
            formacao: body.formacao ?? "",
            experiencia: body.experiencia ?? "",
            bio: body.bio ?? "",
            status: body.status ?? "ativo",
            subespecialidades: JSON.stringify(body.subespecialidades ?? []),
            idiomas: JSON.stringify(body.idiomas ?? ["Português"]),
            horariosDisponiveis: JSON.stringify(body.horariosDisponiveis ?? ["09:00", "10:00", "14:00", "15:00"]),
          },
        },
      },
    });

    await aplicarSideEffects(admin, body.notificacoes, {
      ...(body.audit ?? {
        acao: "MEDICO_CRIADO",
        categoria: "admin",
        detalhes: `Médico ${body.nome} (${body.crm}) cadastrado`,
      }),
      entidade: "medico",
      entidadeId: user.id,
    });

    const dados = await carregarDados(admin);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

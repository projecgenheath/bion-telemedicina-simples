import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, hashSenha } from "@/lib/server/auth";
import { aplicarSideEffects, medicoWire, slugEmail } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { gerarSenhaTemporaria, sufixoAleatorio } from "@/lib/server/senha-temporaria";
import { emailNorm, isErro } from "@/lib/server/validar";

/** Cadastro de médico pela administração. Auditoria gerada PELO SERVIDOR. */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    const body = (await req.json()) as {
      nome: string;
      /** Opcional: e-mail real do médico. Sem ele, gera um login não adivinhável. */
      email?: string;
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
    };

    if (!body.nome?.trim() || !body.crm?.trim() || !body.especialidade?.trim()) {
      return Response.json({ erro: "Nome, CRM e especialidade são obrigatórios." }, { status: 400 });
    }

    // Auditoria admin (C2): o login não pode mais ser adivinhado pelo nome
    // ("nome.sobrenome@med.bion.app"). Usa o e-mail real, se informado, ou
    // um e-mail gerado com sufixo aleatório.
    let email: string;
    if (body.email?.trim()) {
      const emailOk = emailNorm(body.email);
      if (isErro(emailOk)) {
        return Response.json({ erro: "Informe um e-mail válido do médico." }, { status: 400 });
      }
      email = emailOk;
      if (await db.user.findUnique({ where: { email } })) {
        return Response.json({ erro: "Já existe uma conta com este e-mail." }, { status: 409 });
      }
    } else {
      do {
        email = slugEmail(body.nome, "med.bion.app").replace("@", `.${sufixoAleatorio()}@`);
      } while (await db.user.findUnique({ where: { email } }));
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
        role: "MEDICO",
        // V4: nasce com senha temporária — troca obrigatória no primeiro acesso
        // (bloqueada no servidor por exigirSessao enquanto pendente)
        precisaTrocarSenha: true,
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

    // Contrato delta (auditoria FASE 2): devolve APENAS o médico criado
    // + auditoria — sem recarregar o estado inteiro do admin.
    const efeitos = await aplicarSideEffects(admin, undefined, {
      acao: "MEDICO_CRIADO",
      categoria: "admin",
      entidade: "medico",
      entidadeId: user.id,
      detalhes: `Médico ${user.nome} (${body.crm}) cadastrado`,
    });

    const perfil = await db.perfilMedico.findUnique({
      where: { userId: user.id },
      include: { user: { select: { id: true, nome: true } } },
    });

    // `credenciais` só existe NESTA resposta (não é persistida em texto puro
    // nem gravada na auditoria): a UI mostra uma vez para o admin repassar.
    return ok({
      ...(perfil ? { medico: medicoWire(perfil) } : {}),
      ...efeitos,
      credenciais: { email, senhaTemporaria },
    });
  } catch (erro) {
    return falha(erro);
  }
}

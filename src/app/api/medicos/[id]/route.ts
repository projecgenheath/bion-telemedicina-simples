import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

type MedicoPatch = {
  acao?: "aprovar" | "suspender" | "atualizar";
  nome?: string;
  crm?: string;
  especialidade?: string;
  subespecialidades?: string[];
  valor?: number;
  formacao?: string;
  experiencia?: string;
  idiomas?: string[];
  bio?: string;
  horariosDisponiveis?: string[];
  notificacoes?: NotifPayload[];
  audit?: AuditPayload;
};

/** Ações administrativas sobre médicos: aprovar, suspender, editar e excluir. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const body = (await req.json()) as MedicoPatch;

    const medico = await db.user.findFirst({
      where: { id, role: "MEDICO" },
      include: { perfilMedico: true },
    });
    if (!medico?.perfilMedico) {
      return Response.json({ erro: "Médico não encontrado." }, { status: 404 });
    }

    const acao = body.acao ?? "atualizar";

    if (acao === "aprovar") {
      await db.perfilMedico.update({ where: { userId: id }, data: { status: "ativo" } });
      await aplicarSideEffects(admin, body.notificacoes, {
        ...(body.audit ?? {
          acao: "MEDICO_APROVADO",
          categoria: "admin",
          severidade: "critical",
          detalhes: `CRM de ${medico.nome} validado e ativado`,
        }),
        entidade: "medico",
        entidadeId: id,
      });
    } else if (acao === "suspender") {
      await db.perfilMedico.update({ where: { userId: id }, data: { status: "suspenso" } });
      await aplicarSideEffects(admin, body.notificacoes, {
        ...(body.audit ?? {
          acao: "MEDICO_SUSPENSO",
          categoria: "admin",
          severidade: "critical",
          detalhes: `${medico.nome} suspenso da plataforma`,
        }),
        entidade: "medico",
        entidadeId: id,
      });
    } else {
      await db.$transaction([
        db.user.update({
          where: { id },
          data: body.nome ? { nome: body.nome.trim() } : {},
        }),
        db.perfilMedico.update({
          where: { userId: id },
          data: {
            ...(body.crm !== undefined ? { crm: body.crm } : {}),
            ...(body.especialidade !== undefined ? { especialidade: body.especialidade } : {}),
            ...(body.subespecialidades !== undefined
              ? { subespecialidades: JSON.stringify(body.subespecialidades) }
              : {}),
            ...(body.valor !== undefined ? { valor: body.valor } : {}),
            ...(body.formacao !== undefined ? { formacao: body.formacao } : {}),
            ...(body.experiencia !== undefined ? { experiencia: body.experiencia } : {}),
            ...(body.idiomas !== undefined ? { idiomas: JSON.stringify(body.idiomas) } : {}),
            ...(body.bio !== undefined ? { bio: body.bio } : {}),
            ...(body.horariosDisponiveis !== undefined
              ? { horariosDisponiveis: JSON.stringify(body.horariosDisponiveis) }
              : {}),
          },
        }),
      ]);
      await aplicarSideEffects(admin, body.notificacoes, {
        ...(body.audit ?? {
          acao: "MEDICO_ATUALIZADO",
          categoria: "admin",
          detalhes: `Dados atualizados: ${Object.keys(body).filter((k) => k !== "acao" && k !== "notificacoes" && k !== "audit").join(", ")}`,
        }),
        entidade: "medico",
        entidadeId: id,
      });
    }

    const dados = await carregarDados(admin);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;

    const medico = await db.user.findFirst({ where: { id, role: "MEDICO" } });
    if (!medico) {
      return Response.json({ erro: "Médico não encontrado." }, { status: 404 });
    }

    await db.user.delete({ where: { id } });
    await aplicarSideEffects(admin, undefined, {
      acao: "MEDICO_EXCLUIDO",
      categoria: "admin",
      severidade: "critical",
      detalhes: `Cadastro de ${medico.nome} removido da plataforma`,
      entidade: "medico",
      entidadeId: id,
    });

    const dados = await carregarDados(admin);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

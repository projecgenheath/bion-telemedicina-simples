import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects } from "@/lib/server/dados";
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
      await aplicarSideEffects(
        admin,
        [
          {
            tipo: "agenda",
            titulo: "Cadastro aprovado",
            texto: "Seu CRM foi validado e seu perfil está ativo para teleconsultas na BION.",
            usuarioId: medico.id,
          },
        ],
        {
          acao: "MEDICO_APROVADO",
          categoria: "admin",
          severidade: "critical",
          entidade: "medico",
          entidadeId: id,
          detalhes: `CRM de ${medico.nome} validado e ativado`,
        },
      );
    } else if (acao === "suspender") {
      await db.perfilMedico.update({ where: { userId: id }, data: { status: "suspenso" } });
      await aplicarSideEffects(
        admin,
        [
          {
            tipo: "agenda",
            titulo: "Cadastro suspenso",
            texto: "Seu perfil de médico foi suspenso. Entre em contato com o suporte.",
            usuarioId: medico.id,
          },
        ],
        {
          acao: "MEDICO_SUSPENSO",
          categoria: "admin",
          severidade: "critical",
          entidade: "medico",
          entidadeId: id,
          detalhes: `${medico.nome} suspenso da plataforma`,
        },
      );
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
      await aplicarSideEffects(admin, undefined, {
        acao: "MEDICO_ATUALIZADO",
        categoria: "admin",
        entidade: "medico",
        entidadeId: id,
        detalhes: `Médico ${medico.nome}: dados atualizados (${Object.keys(body).filter((k) => k !== "acao").join(", ")})`,
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

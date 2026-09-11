import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

type PacientePatch = {
  nome?: string;
  telefone?: string;
  cpf?: string;
  idade?: number;
  genero?: string;
  convenio?: string;
  status?: string;
  notificacoes?: NotifPayload[];
  audit?: AuditPayload;
};

/** Edição de paciente pela administração (nome propaga para consultas/documentos via FK). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;
    const body = (await req.json()) as PacientePatch;

    const paciente = await db.user.findFirst({ where: { id, role: "PACIENTE" } });
    if (!paciente) {
      return Response.json({ erro: "Paciente não encontrado." }, { status: 404 });
    }

    await db.$transaction([
      db.user.update({
        where: { id },
        data: {
          ...(body.nome !== undefined ? { nome: body.nome.trim() } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      }),
      db.perfilPaciente.upsert({
        where: { userId: id },
        update: {
          ...(body.telefone !== undefined ? { telefone: body.telefone } : {}),
          ...(body.cpf !== undefined ? { cpf: body.cpf } : {}),
          ...(body.idade !== undefined ? { idade: body.idade } : {}),
          ...(body.genero !== undefined ? { genero: body.genero } : {}),
          ...(body.convenio !== undefined ? { convenio: body.convenio } : {}),
        },
        create: {
          userId: id,
          telefone: body.telefone ?? "",
          cpf: body.cpf ?? "",
          idade: body.idade ?? 0,
          genero: body.genero ?? "",
          convenio: body.convenio ?? "Particular",
        },
      }),
    ]);

    await aplicarSideEffects(admin, body.notificacoes, {
      ...(body.audit ?? {
        acao: "PACIENTE_ATUALIZADO",
        categoria: "admin",
        detalhes: `Campos atualizados: ${Object.keys(body).filter((k) => k !== "notificacoes" && k !== "audit").join(", ")}`,
      }),
      entidade: "paciente",
      entidadeId: id,
    });

    const dados = await carregarDados(admin);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

/** Exclusão definitiva de paciente (cascata: consultas, documentos, avaliações). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await exigirPapel("ADMIN");
    const { id } = await params;

    const paciente = await db.user.findFirst({ where: { id, role: "PACIENTE" } });
    if (!paciente) {
      return Response.json({ erro: "Paciente não encontrado." }, { status: 404 });
    }

    await db.user.delete({ where: { id } });
    await aplicarSideEffects(admin, undefined, {
      acao: "PACIENTE_EXCLUIDO",
      categoria: "admin",
      severidade: "critical",
      detalhes: `Cadastro de ${paciente.nome} removido junto com consultas e documentos`,
      entidade: "paciente",
      entidadeId: id,
    });

    const dados = await carregarDados(admin);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

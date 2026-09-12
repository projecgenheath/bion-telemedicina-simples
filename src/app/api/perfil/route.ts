import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

type PerfilPacientePatch = {
  nome?: string;
  cpf?: string;
  telefone?: string;
  convenio?: string;
  idade?: number;
  genero?: string;
  alergias?: string[];
  medicamentos?: string[];
  tipoSanguineo?: string;
  peso?: string;
  altura?: string;
  audit?: AuditPayload;
};

/** Atualização do perfil do próprio paciente. */
export async function PATCH(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as PerfilPacientePatch;

    const perfil = await db.perfilPaciente.findUnique({ where: { userId: usuario.id } });
    if (!perfil) {
      return Response.json({ erro: "Perfil não encontrado." }, { status: 404 });
    }

    await db.$transaction([
      db.user.update({
        where: { id: usuario.id },
        data: body.nome ? { nome: body.nome.trim() } : {},
      }),
      db.perfilPaciente.update({
        where: { userId: usuario.id },
        data: {
          ...(body.cpf !== undefined ? { cpf: body.cpf } : {}),
          ...(body.telefone !== undefined ? { telefone: body.telefone } : {}),
          ...(body.convenio !== undefined ? { convenio: body.convenio } : {}),
          ...(body.idade !== undefined ? { idade: body.idade } : {}),
          ...(body.genero !== undefined ? { genero: body.genero } : {}),
          ...(body.alergias !== undefined ? { alergias: JSON.stringify(body.alergias) } : {}),
          ...(body.medicamentos !== undefined
            ? { medicamentos: JSON.stringify(body.medicamentos) }
            : {}),
          ...(body.tipoSanguineo !== undefined ? { tipoSanguineo: body.tipoSanguineo } : {}),
          ...(body.peso !== undefined ? { peso: body.peso } : {}),
          ...(body.altura !== undefined ? { altura: body.altura } : {}),
        },
      }),
    ]);

    await aplicarSideEffects(
      usuario,
      undefined,
      body.audit ?? {
        acao: "PERFIL_ATUALIZADO",
        categoria: "usuario",
        detalhes: `Dados atualizados: ${Object.keys(body).filter((k) => k !== "audit").join(", ")}`,
      },
    );

    const dados = await carregarDados({ ...usuario, nome: body.nome?.trim() || usuario.nome });
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, perfilPacienteWire } from "@/lib/server/dados";
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
  profissao?: string;
  estadoCivil?: string;
  comorbidades?: string[];
  foto?: string;
};

/** Atualização do perfil do próprio paciente. */
export async function PATCH(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as PerfilPacientePatch;

    const perfilAtual = await db.perfilPaciente.findUnique({ where: { userId: usuario.id } });
    if (!perfilAtual) {
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
          ...(body.profissao !== undefined ? { profissao: body.profissao } : {}),
          ...(body.estadoCivil !== undefined ? { estadoCivil: body.estadoCivil } : {}),
          ...(body.comorbidades !== undefined
            ? { comorbidades: JSON.stringify(body.comorbidades) }
            : {}),
          ...(body.foto !== undefined ? { foto: body.foto } : {}),
        },
      }),
    ]);

    // Contrato delta (auditoria FASE 2): devolve APENAS o perfil completo
    // atualizado + auditoria — o nome novo sincroniza a sessão no cliente.
    const efeitos = await aplicarSideEffects(usuario, undefined, {
      acao: "PERFIL_ATUALIZADO",
      categoria: "usuario",
      detalhes: `Dados atualizados: ${Object.keys(body).join(", ")}`,
    });

    const perfilFresco = await db.perfilPaciente.findUnique({
      where: { userId: usuario.id },
      include: { user: { select: { nome: true, email: true } } },
    });

    return ok({
      ...(perfilFresco ? { perfilPacienteCompleto: perfilPacienteWire(perfilFresco) } : {}),
      ...efeitos,
    });
  } catch (erro) {
    return falha(erro);
  }
}

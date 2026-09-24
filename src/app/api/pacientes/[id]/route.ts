import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects, pacienteWire } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { anonimizarPacienteCompleto } from "@/lib/server/lgpd";

type PacientePatch = {
  nome?: string;
  telefone?: string;
  cpf?: string;
  idade?: number;
  genero?: string;
  convenio?: string;
  status?: string;
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

    // Contrato delta (auditoria FASE 2): devolve APENAS o paciente atualizado
    // + auditoria — sem recarregar o estado inteiro do admin.
    const efeitosPatch = await aplicarSideEffects(admin, undefined, {
      acao: "PACIENTE_ATUALIZADO",
      categoria: "admin",
      entidade: "paciente",
      entidadeId: id,
      detalhes: `Paciente ${paciente.nome}: campos atualizados (${Object.keys(body).join(", ")})`,
    });

    const atualizado = await db.user.findFirst({
      where: { id },
      include: { perfilPaciente: true },
    });

    return ok({ ...(atualizado ? { paciente: pacienteWire(atualizado) } : {}), ...efeitosPatch });
  } catch (erro) {
    return falha(erro);
  }
}

/**
 * P1 (2026-09) — o DELETE de paciente NÃO destrói mais o cadastro em cascata
 * (prontuário não pode ser destruído — CFM). Passa a arquivar + anonimizar
 * todos os dados identificáveis (LGPD art. 12), preservando o registro
 * clínico despidos de identificadores.
 */
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

    const apelido = await anonimizarPacienteCompleto(id);
    // Contrato delta (auditoria FASE 2): o registro (agora anonimizado/inativo)
    // substitui o anterior na lista — mesmo efeito do estado fresco, sem
    // recarregar o app inteiro.
    const efeitos = await aplicarSideEffects(admin, undefined, {
      acao: "PACIENTE_ARQUIVADO_ANONIMIZADO",
      categoria: "admin",
      severidade: "critical",
      detalhes: `Cadastro de ${paciente.nome} arquivado e anonimizado como ${apelido}; prontuário preservado (LGPD art. 12 / CFM)`,
      entidade: "paciente",
      entidadeId: id,
    });

    const anonimizado = await db.user.findFirst({
      where: { id },
      include: { perfilPaciente: true },
    });

    return ok({ ...(anonimizado ? { paciente: pacienteWire(anonimizado) } : {}), ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * Operações LGPD da administração (PrivacidadeAdmin):
 * - anonimizar: substitui dados identificáveis do paciente (art. 12 LGPD)
 * - excluir: remove definitivamente consultas, documentos, avaliações e consentimentos
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await exigirPapel("ADMIN");
    const body = (await req.json()) as {
      acao: "anonimizar" | "excluir";
      pacienteId: string;
    };

    const paciente = await db.user.findFirst({
      where: { id: body.pacienteId, role: "PACIENTE" },
    });
    if (!paciente) {
      return Response.json({ erro: "Paciente não encontrado." }, { status: 404 });
    }

    if (body.acao === "anonimizar") {
      const apelido = `Paciente Anonimizado ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await db.$transaction([
        db.user.update({
          where: { id: paciente.id },
          data: { nome: apelido, email: `anon-${apelido.slice(-4).toLowerCase()}@anon.bion.app`, status: "inativo" },
        }),
        db.perfilPaciente.updateMany({
          where: { userId: paciente.id },
          data: { cpf: "", telefone: "", alergias: "[]", medicamentos: "[]" },
        }),
      ]);
      await (await import("@/lib/server/dados")).aplicarSideEffects(admin, undefined, {
        acao: "PACIENTE_ANONIMIZADO",
        categoria: "admin",
        severidade: "critical",
        detalhes: `Dados identificáveis substituídos por ${apelido} (LGPD art. 12)`,
        entidade: "paciente",
        entidadeId: paciente.id,
      });
    } else {
      await db.user.delete({ where: { id: paciente.id } });
      await (await import("@/lib/server/dados")).aplicarSideEffects(admin, undefined, {
        acao: "PACIENTE_DADOS_EXCLUIDOS",
        categoria: "admin",
        severidade: "critical",
        detalhes: `Exclusão definitiva de consultas, documentos, avaliações e consentimentos de ${paciente.nome}`,
        entidade: "paciente",
        entidadeId: paciente.id,
      });
    }

    const dados = await carregarDados(admin);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

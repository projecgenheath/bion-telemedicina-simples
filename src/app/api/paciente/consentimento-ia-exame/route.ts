import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { usuarioSemNome } from "@/lib/server/audit-sem-nome";
import {
  FINALIDADE_REVOGACAO_IA_EXAME,
  PREFIXO_FINALIDADE_IA_EXAME,
  VERSAO_CONSENTIMENTO_IA_EXAME,
  estadoConsentimentoIaExame,
} from "@/lib/consentimento-ia-exame";

/**
 * Consentimento da leitura de laudo pela BION IA (LGPD art. 8º, § 5º).
 * GET: estado atual (último registro do próprio paciente).
 * DELETE: revoga — grava Consentimento (aceito = false, versão na finalidade)
 * + AuditLog. O próximo envio de laudo volta a pedir o aceite (o aviso é
 * mostrado em todo envio e o servidor exige o campo de consentimento).
 * Paciente sempre pela sessão.
 */
async function ultimoRegistro(pacienteId: string) {
  return db.consentimento.findFirst({
    where: { pacienteId, finalidade: { startsWith: PREFIXO_FINALIDADE_IA_EXAME } },
    orderBy: { createdAt: "desc" },
    select: { aceito: true, createdAt: true },
  });
}

export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const u = await ultimoRegistro(usuario.id);
    return ok({ estado: estadoConsentimentoIaExame(u), em: u?.createdAt.toISOString() ?? null, versao: VERSAO_CONSENTIMENTO_IA_EXAME });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const registro = await db.consentimento.create({
      data: {
        pacienteId: usuario.id,
        quem: usuario.nome,
        perfil: "PACIENTE", // = usuario.role, igual a /api/consentimentos (a anonimização casa por "PACIENTE")
        finalidade: FINALIDADE_REVOGACAO_IA_EXAME,
        documentos: 0,
        aceito: false,
      },
    });
    await registrarAudit(usuarioSemNome(usuario), {
      acao: "CONSENTIMENTO_IA_EXAME_REVOGADO",
      categoria: "consentimento",
      severidade: "warning",
      entidade: "consentimento",
      entidadeId: registro.id,
      detalhes: `Revogação do envio de laudo ao Google (Gemini) — versão ${VERSAO_CONSENTIMENTO_IA_EXAME} em ${registro.createdAt.toISOString()}`,
    });
    return ok({ estado: "revogado", em: registro.createdAt.toISOString(), versao: VERSAO_CONSENTIMENTO_IA_EXAME });
  } catch (erro) {
    return falha(erro);
  }
}

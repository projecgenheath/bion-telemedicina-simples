import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { usuarioSemNome } from "@/lib/server/audit-sem-nome";
import { ultimoAceiteCopilotMedico } from "@/lib/server/aceite-copilot-medico";
import {
  FINALIDADE_ACEITE_COPILOT_MEDICO,
  FINALIDADE_REVOGACAO_COPILOT_MEDICO,
  VERSAO_ACEITE_COPILOT_MEDICO,
  aceiteCopilotMedicoVigente,
} from "@/lib/aceite-copilot-medico";

/** 503 quando a auditoria falha: o registro é desfeito (padrão do #141). */
const CODIGO_AUDITORIA_INDISPONIVEL = "auditoria_indisponivel";

/**
 * Aceite do BION Copilot do médico (LGPD).
 * GET → { vigente, em, versao } · POST { versao } → registra o aceite ·
 * POST { aceito: false } → revoga (novo registro aceito=false; o Copilot volta a travar).
 * Só MEDICO; o id vem da sessão. Consentimento + AuditLog (sem texto de conversa).
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    const u = await ultimoAceiteCopilotMedico(medico.id);
    return ok({ vigente: aceiteCopilotMedicoVigente(u), em: u?.createdAt.toISOString() ?? null, versao: VERSAO_ACEITE_COPILOT_MEDICO });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: Request) {
  try {
    const medico = await exigirPapel("MEDICO");
    const b = (await req.json().catch(() => null)) as { versao?: unknown; aceito?: unknown } | null;
    if (b?.aceito === false) {
      const rev = await db.consentimento.create({
        data: { pacienteId: medico.id, quem: medico.nome, perfil: "MEDICO", finalidade: FINALIDADE_REVOGACAO_COPILOT_MEDICO, documentos: 0, aceito: false },
      });
      const auditRev = await registrarAudit(usuarioSemNome(medico), {
        acao: "REVOGACAO_COPILOT_MEDICO",
        categoria: "consentimento",
        severidade: "warning",
        entidade: "consentimento",
        entidadeId: rev.id,
        detalhes: `Revogação do aceite do BION Copilot — versão ${VERSAO_ACEITE_COPILOT_MEDICO} em ${rev.createdAt.toISOString()}`,
      }).catch(() => null);
      if (!auditRev) {
        // como no #141: sem trilha de auditoria a revogação não vale; desfaz
        await db.consentimento.delete({ where: { id: rev.id } }).catch(() => undefined);
        return Response.json({ erro: "Não consegui registrar sua revogação agora. Tente novamente.", codigo: CODIGO_AUDITORIA_INDISPONIVEL }, { status: 503 });
      }
      return ok({ vigente: false, em: rev.createdAt.toISOString(), versao: VERSAO_ACEITE_COPILOT_MEDICO });
    }
    if (b?.versao !== VERSAO_ACEITE_COPILOT_MEDICO) {
      return Response.json({ erro: "Versão do aviso desatualizada. Recarregue a página.", versao: VERSAO_ACEITE_COPILOT_MEDICO }, { status: 409 });
    }
    const registro = await db.consentimento.create({
      data: {
        pacienteId: medico.id,
        quem: medico.nome,
        perfil: "MEDICO",
        finalidade: FINALIDADE_ACEITE_COPILOT_MEDICO,
        documentos: 0,
        aceito: true,
      },
    });
    const audit = await registrarAudit(usuarioSemNome(medico), {
      acao: "ACEITE_COPILOT_MEDICO",
      categoria: "consentimento",
      entidade: "consentimento",
      entidadeId: VERSAO_ACEITE_COPILOT_MEDICO,
      detalhes: `Aceite do BION Copilot (NVIDIA, EUA) — versão ${VERSAO_ACEITE_COPILOT_MEDICO} em ${registro.createdAt.toISOString()}`,
    }).catch(() => null);
    if (!audit) {
      await db.consentimento.delete({ where: { id: registro.id } }).catch(() => undefined);
      return Response.json({ erro: "Não consegui registrar seu aceite agora. Tente novamente.", codigo: CODIGO_AUDITORIA_INDISPONIVEL }, { status: 503 });
    }
    return ok({ vigente: true, em: registro.createdAt.toISOString(), versao: VERSAO_ACEITE_COPILOT_MEDICO });
  } catch (erro) {
    return falha(erro);
  }
}

import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { usuarioSemNome } from "@/lib/server/audit-sem-nome";
import { ultimoConsentimentoIa } from "@/lib/server/consentimento-ia";
import {
  FINALIDADE_CONSENTIMENTO_IA,
  FINALIDADE_REVOGACAO_IA,
  VERSAO_CONSENTIMENTO_IA,
  consentimentoIaVigente,
} from "@/lib/consentimento-ia";
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS_PACIENTE } from "@/lib/aceite-termos";

/**
 * Consentimento geral da BION IA (provedor NVIDIA).
 * GET: { vigente, versao } — POST { versao }: aceita a versão atual —
 * DELETE: revoga. Sempre Consentimento + AuditLog; paciente pela sessão.
 */
export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const u = await ultimoConsentimentoIa(usuario.id);
    return ok({ vigente: consentimentoIaVigente(u), em: u?.createdAt.toISOString() ?? null, versao: VERSAO_CONSENTIMENTO_IA });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: Request) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const b = (await req.json().catch(() => null)) as { versao?: unknown } | null;
    if (b?.versao !== VERSAO_CONSENTIMENTO_IA) {
      return Response.json({ erro: "Versão do aviso desatualizada. Recarregue a página.", versao: VERSAO_CONSENTIMENTO_IA }, { status: 409 });
    }
    const registro = await db.consentimento.create({
      data: {
        pacienteId: usuario.id,
        quem: usuario.nome,
        perfil: "PACIENTE",
        finalidade: FINALIDADE_CONSENTIMENTO_IA,
        documentos: 2,
        aceito: true,
      },
    });
    const audit = await registrarAudit(usuarioSemNome(usuario), {
      acao: "CONSENTIMENTO_IA",
      categoria: "consentimento",
      entidade: "consentimento",
      entidadeId: VERSAO_CONSENTIMENTO_IA,
      detalhes: `Aceite da BION IA (NVIDIA), ${VERSAO_PRIVACIDADE} e ${VERSAO_TERMOS_PACIENTE} — versão ${VERSAO_CONSENTIMENTO_IA} em ${registro.createdAt.toISOString()}`,
    });
    if (!audit) {
      // sem trilha de auditoria o aceite não vale: desfaz
      await db.consentimento.delete({ where: { id: registro.id } }).catch(() => undefined);
      return Response.json({ erro: "Não consegui registrar seu aceite agora. Tente novamente." }, { status: 503 });
    }
    return ok({ vigente: true, em: registro.createdAt.toISOString(), versao: VERSAO_CONSENTIMENTO_IA });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const registro = await db.consentimento.create({
      data: { pacienteId: usuario.id, quem: usuario.nome, perfil: "PACIENTE", finalidade: FINALIDADE_REVOGACAO_IA, documentos: 0, aceito: false },
    });
    await registrarAudit(usuarioSemNome(usuario), {
      acao: "CONSENTIMENTO_IA_REVOGADO",
      categoria: "consentimento",
      severidade: "warning",
      entidade: "consentimento",
      entidadeId: registro.id,
      detalhes: `Revogação da BION IA (NVIDIA) — versão ${VERSAO_CONSENTIMENTO_IA} em ${registro.createdAt.toISOString()}`,
    });
    return ok({ vigente: false, em: registro.createdAt.toISOString(), versao: VERSAO_CONSENTIMENTO_IA });
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { anonimizarPacienteCompleto } from "@/lib/server/lgpd";

/**
 * Operações LGPD da administração (PrivacidadeAdmin):
 * - anonimizar: substitui TODOS os dados identificáveis do paciente
 *   (identidade, perfil, anamnese, mensagens, documentos, tickets, avaliações
 *   e textos livres) — art. 12 LGPD.
 * - excluir: P1 (2026-09) — NÃO destrói mais nada. Prontuário não pode ser
 *   destruído (CFM); a operação virou sinônimo de anonimização completa +
 *   arquivamento da conta (inativa, sem sessões, sem dados identificáveis).
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

    // As duas ações compartilham o mesmo fluxo seguro: anonimização completa
    // sem destruição de prontuário.
    const apelido = await anonimizarPacienteCompleto(paciente.id);
    const { aplicarSideEffects } = await import("@/lib/server/dados");
    await aplicarSideEffects(admin, undefined, {
      acao: body.acao === "excluir" ? "PACIENTE_DADOS_ANONIMIZADOS_ARQUIVADOS" : "PACIENTE_ANONIMIZADO",
      categoria: "admin",
      severidade: "critical",
      detalhes:
        body.acao === "excluir"
          ? `Solicitação de exclusão convertida em anonimização LGPD completa + arquivamento (${apelido}); prontuário preservado`
          : `Dados identificáveis substituídos por ${apelido} — identidade, perfil, anamnese, mensagens, documentos, tickets e textos livres (LGPD art. 12)`,
      entidade: "paciente",
      entidadeId: paciente.id,
    });

    const dados = await carregarDados(admin);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

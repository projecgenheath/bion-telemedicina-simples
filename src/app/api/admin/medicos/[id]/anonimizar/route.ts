import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";
import { PendenciasLgpdError, anonimizarMedicoCompleto } from "@/lib/server/lgpd";
import { validarMotivoAnonimizacao } from "@/lib/anonimizar-medico-logica";

const MAX_POR_HORA = 10;
const JANELA_MS = 60 * 60_000;

/**
 * POST /api/admin/medicos/[id]/anonimizar — SOMENTE ADMIN.
 * Exclusão do médico por ANONIMIZAÇÃO (LGPD art. 12/16): nome, e-mail, CRM,
 * telefone, CNPJ e dados de recebimento saem do cadastro (cifrados no cofre);
 * login desativado; médico some da busca e da agenda. Prontuário (consultas,
 * evoluções, documentos) e financeiro (repasses, pagamentos) ficam ligados ao id.
 * Corpo: { motivo } (5–300). 409 com `motivos` se houver pendência.
 * Auditoria só com ids; números longos do motivo são removidos.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await exigirPapel("ADMIN");
    const v = await limitarAsync(`lgpd:anon-medico:${admin.id}`, MAX_POR_HORA, JANELA_MS);
    if (!v.permitido) return resposta429(v.restanteSeg, "Muitas anonimizações seguidas. Aguarde e tente novamente.");

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { motivo?: unknown } | null;
    const motivo = validarMotivoAnonimizacao(body?.motivo);
    if (!motivo.ok) return Response.json({ erro: motivo.erro }, { status: 400 });
    if (!id) return Response.json({ erro: "Informe o id do médico." }, { status: 400 });

    let r;
    try {
      r = await anonimizarMedicoCompleto(id, motivo.motivo);
    } catch (e) {
      if (e instanceof PendenciasLgpdError) {
        return Response.json({ erro: "Não é possível anonimizar este médico agora.", motivos: e.motivos }, { status: 409 });
      }
      throw e;
    }

    const efeitos = await aplicarSideEffects(admin, undefined, {
      acao: "MEDICO_ANONIMIZADO",
      categoria: "admin",
      severidade: "critical",
      entidade: "medico",
      entidadeId: id,
      detalhes:
        `Médico id ${id} anonimizado (LGPD art. 12): login Supabase ${r.loginSupabaseRemovido ? "removido" : "inexistente ou pendente"}; ` +
        `prontuário e repasses preservados` +
        (r.jaEstavaAnonimizado ? "; reexecução em conta já anonimizada" : "") +
        `. Motivo: ${r.motivoLimpo}`,
    });

    return ok({ medicoId: id, loginSupabaseRemovido: r.loginSupabaseRemovido, ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { cancelarPorEspera } from "@/lib/server/espera-medico";

export const dynamic = "force-dynamic";

/**
 * POST /api/telemedicina/[consultaId]/espera/cancelar — o médico não entrou
 * em 10 min: cancela com reembolso INTEGRAL. Só o paciente; só com a espera
 * expirada (409 antes). Idempotente: repetir devolve 200 com jaProcessada.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ consultaId: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    if (usuario.role !== "PACIENTE") return Response.json({ erro: "Acesso negado." }, { status: 403 });
    const r = await cancelarPorEspera({ consultaId, pacienteId: usuario.id });
    if (!r.ok) return Response.json({ erro: r.erro, ...(r.extra ?? {}) }, { status: r.status });
    return ok(r);
  } catch (erro) {
    return falha(erro);
  }
}

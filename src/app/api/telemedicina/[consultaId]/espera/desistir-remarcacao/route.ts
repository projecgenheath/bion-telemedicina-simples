import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { desistirRemarcacao } from "@/lib/server/espera-medico";

export const dynamic = "force-dynamic";

/**
 * POST /api/telemedicina/[consultaId]/espera/desistir-remarcacao — o paciente
 * desistiu de pagar a diferença: cancela a cobrança e a consulta nova e a
 * espera volta para expirada (pode cancelar ou remarcar de novo). Só o
 * paciente; só com a espera remarcando (409 antes; 409 pagamento_confirmado
 * se o PIX já chegou). Idempotente: repetir devolve 200 com jaProcessada.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ consultaId: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    if (usuario.role !== "PACIENTE") return Response.json({ erro: "Acesso negado.", codigo: "acesso_negado" }, { status: 403 });
    const r = await desistirRemarcacao({ consultaId, pacienteId: usuario.id });
    if (!r.ok) return Response.json({ erro: r.erro, codigo: r.codigo, ...(r.extra ?? {}) }, { status: r.status });
    return ok(r);
  } catch (erro) {
    return falha(erro);
  }
}

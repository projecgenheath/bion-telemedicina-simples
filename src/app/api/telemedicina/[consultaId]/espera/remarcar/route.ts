import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { lerPedidoRemarcar } from "@/lib/espera-medico-logica";
import { remarcarPorEspera } from "@/lib/server/espera-medico";

export const dynamic = "force-dynamic";

/**
 * POST /api/telemedicina/[consultaId]/espera/remarcar
 * Body: { medicoId, diferencaEsperadaCentavos } (o que o paciente viu na
 * livres-agora: > 0 paga, < 0 recebe). O servidor recalcula com o preço
 * atual na transação: diferente → 409 { erro: "preco_mudou",
 * diferencaAtualCentavos } sem cobrar nada; médico não está mais livre →
 * 409 { erro: "medico_indisponivel" }. Só o paciente; só espera expirada.
 */
export async function POST(req: Request, { params }: { params: Promise<{ consultaId: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    if (usuario.role !== "PACIENTE") return Response.json({ erro: "Acesso negado." }, { status: 403 });
    const pedido = lerPedidoRemarcar(await req.json().catch(() => null));
    if (!pedido) return Response.json({ erro: "Envie medicoId e diferencaEsperadaCentavos (inteiro)." }, { status: 400 });
    const r = await remarcarPorEspera({ consultaId, pacienteId: usuario.id, ...pedido });
    if (!r.ok) return Response.json({ erro: r.erro, ...(r.extra ?? {}) }, { status: r.status });
    return ok(r);
  } catch (erro) {
    return falha(erro);
  }
}

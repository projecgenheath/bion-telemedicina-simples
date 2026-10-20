import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { estadoEsperaDoPaciente } from "@/lib/server/espera-medico";

export const dynamic = "force-dynamic";

/**
 * GET /api/telemedicina/[consultaId]/espera — estado da espera do médico.
 * Só o PACIENTE da consulta. 200 { espera: EsperaWire | null }.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ consultaId: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    if (usuario.role !== "PACIENTE") return Response.json({ erro: "Acesso negado.", codigo: "acesso_negado" }, { status: 403 });
    const r = await estadoEsperaDoPaciente(consultaId, usuario.id);
    if (!r.ok) return Response.json({ erro: r.erro, codigo: r.codigo }, { status: r.status });
    return ok({ espera: r.espera });
  } catch (erro) {
    return falha(erro);
  }
}

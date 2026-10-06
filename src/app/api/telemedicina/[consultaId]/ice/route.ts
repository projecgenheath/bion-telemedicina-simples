import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { falha } from "@/lib/server/http";
import { gerarIceServers } from "@/lib/server/ice";
import { estadoJanelaSala } from "@/lib/janela-sala";

/**
 * GET /api/telemedicina/[consultaId]/ice
 *
 * ICE servers (STUN + TURN) da chamada. Só o médico e o paciente DESTA
 * consulta recebem (403 para qualquer outro, inclusive admin), e só com a
 * sala aberta (409 fora da janela de lib/janela-sala.ts). Com a Cloudflare
 * configurada, cada pedido gera credenciais TURN novas com validade de 4 h;
 * o cliente busca antes de criar a conexão e renova perto de expirar
 * (RTCPeerConnection.setConfiguration). Detalhes em lib/server/ice.ts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ consultaId: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    const consulta = await db.consulta.findUnique({
      where: { id: consultaId },
      select: { pacienteId: true, medicoId: true, dataInicio: true },
    });
    if (!consulta) return NextResponse.json({ erro: "Consulta não encontrada." }, { status: 404 });
    if (consulta.pacienteId !== usuario.id && consulta.medicoId !== usuario.id) {
      return NextResponse.json({ erro: "Acesso negado: você não participa desta consulta." }, { status: 403 });
    }
    if (estadoJanelaSala(consulta.dataInicio, Date.now()) !== "aberta") {
      return NextResponse.json({ erro: "A sala desta consulta não está aberta agora." }, { status: 409 });
    }
    const r = await gerarIceServers();
    return NextResponse.json(
      { iceServers: r.iceServers, expiraEm: new Date(r.expiraEm).toISOString(), fonte: r.fonte },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (erro) {
    return falha(erro);
  }
}

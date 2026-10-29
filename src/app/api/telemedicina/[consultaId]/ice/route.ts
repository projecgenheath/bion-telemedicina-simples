import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { falha } from "@/lib/server/http";
import { gerarIceServers } from "@/lib/server/ice";
import { estadoJanelaSala } from "@/lib/janela-sala";
import { limitarAsync, resposta429 } from "@/lib/server/rate-limit";

/**
 * GET /api/telemedicina/[consultaId]/ice
 *
 * ICE servers (STUN + TURN) da chamada. Só o médico e o paciente DESTA
 * consulta recebem (403 para qualquer outro, inclusive admin), e só com a
 * sala aberta (409 fora da janela de lib/janela-sala.ts). Valem também as
 * barreiras da sala (M4): consulta em_espera NÃO paga → 402 (o mesmo corpo
 * da rota da sala) e status fora de confirmada/em_espera → 409 — sem
 * credencial TURN de 4 h para consulta que não pode nem abrir a sala.
 * Com a Cloudflare configurada, cada pedido gera credenciais TURN novas
 * com validade de 4 h; o cliente busca antes de criar a conexão e renova
 * perto de expirar (RTCPeerConnection.setConfiguration). Detalhes em
 * lib/server/ice.ts.
 *
 * B-25: limite de frequência por usuário+consulta (10/min) — credenciais de
 * TURN custam caro para gerar; o endpoint não pode ser martelado.
 */
const ICE_MAX_POR_MIN = 10;

export async function GET(_req: Request, { params }: { params: Promise<{ consultaId: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    const consulta = await db.consulta.findUnique({
      where: { id: consultaId },
      select: { pacienteId: true, medicoId: true, dataInicio: true, status: true, pago: true },
    });
    if (!consulta) return NextResponse.json({ erro: "Consulta não encontrada." }, { status: 404 });
    if (consulta.pacienteId !== usuario.id && consulta.medicoId !== usuario.id) {
      return NextResponse.json({ erro: "Acesso negado: você não participa desta consulta." }, { status: 403 });
    }
    if (estadoJanelaSala(consulta.dataInicio, Date.now()) !== "aberta") {
      return NextResponse.json({ erro: "A sala desta consulta não está aberta agora." }, { status: 409 });
    }
    // M4 — as mesmas barreiras da sala (sala/route.ts), nos mesmos códigos:
    // pagamento pendente (em_espera não paga) → 402 com motivo/acao; status
    // fora de confirmada/em_espera → 409 "Sala fechada".
    if (consulta.status === "em_espera" && !consulta.pago) {
      return NextResponse.json(
        {
          erro: "Pagamento pendente: esta consulta ainda não foi paga, por isso a sala não pode ser aberta. Pague para entrar na sala.",
          motivo: "pagamento_pendente" as const,
          acao: "pagar" as const,
        },
        { status: 402, headers: { "Cache-Control": "no-store, private" } },
      );
    }
    if (!["confirmada", "em_espera"].includes(consulta.status)) {
      return NextResponse.json({ erro: `Sala fechada: consulta está "${consulta.status}".` }, { status: 409 });
    }
    // B-25: 429 com Retry-After — o cliente revalida no próximo ciclo.
    const limite = await limitarAsync(`ice:${usuario.id}:${consultaId}`, ICE_MAX_POR_MIN, 60_000);
    if (!limite.permitido) return resposta429(limite.restanteSeg);
    const r = await gerarIceServers();
    return NextResponse.json(
      { iceServers: r.iceServers, expiraEm: new Date(r.expiraEm).toISOString(), fonte: r.fonte },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (erro) {
    return falha(erro);
  }
}

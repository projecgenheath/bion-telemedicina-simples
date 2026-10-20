import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { topicoNotificacoesUsuario } from "@/lib/server/usuario-canal";
import { broadcastCanal } from "@/lib/supabase/broadcast";
import { estadoJanelaSala } from "@/lib/janela-sala";
import { decidirResposta, lerPedidoResposta } from "@/lib/chamada-recebida-logica";
import { bloqueioConsultaEncerrada } from "@/lib/server/chamada-resposta";
import { abrirEspera, fecharEsperaMedicoEntrou, type DesfechoEspera } from "@/lib/server/espera-medico";

/**
 * POST /api/telemedicina/[consultaId]/chamada — atender ou recusar o toque (tele v2, fase 2).
 *
 * Body: { acao: "atender" | "recusar", tentativa: 1..10 }
 *  - 401 sem sessão; 404 consulta inexistente; 403 se não for o paciente nem o
 *    médico DESTA consulta (admin também 403); 409 { erro, motivo:
 *    "consulta_encerrada" } se a consulta está cancelada/concluida (nada é
 *    gravado); 409 fora da janela da sala (lib/janela-sala.ts); 400 corpo inválido.
 *    Respostas com `motivo` saem direto com NextResponse.json (falha() só leva `erro`).
 *  - Atualiza a linha ChamadaConsulta (consultaId, eu, tentativa) com
 *    respondidaEm = agora: atender vale de "tocando" OU "expirada" (o toque
 *    pode ter acabado de expirar; dentro da janela da consulta, atende);
 *    recusar só de "tocando". Idempotente: já atendida (ou recusada/expirada
 *    no recusar) devolve 200 com o estado atual.
 *    Sem linha (antes do job do Admin existir): 200 sem criar nada.
 *  - Depois da resposta (after): broadcast `chamada_atendida`/`chamada_recusada`
 *    { consultaId, tentativa, por, em } no canal PRIVADO de notificações do
 *    PRÓPRIO usuário, para parar o toque nos outros aparelhos dele.
 *  - Nada de dado de saúde no log nem no payload.
 *
 *  - Espera do médico (EsperaMedico): o PACIENTE atender abre a espera
 *    (abrirEspera) na MESMA transação do update; o MÉDICO atender fecha como
 *    medico_entrou (fecharEsperaMedicoEntrou) na mesma transação. Se o
 *    paciente já escolheu cancelar/remarcar (ou está pagando a diferença),
 *    o médico recebe 409 { erro: "espera_encerrada", motivo:
 *    "espera_encerrada", desfecho } e a linha dele NÃO é atualizada.
 *
 * A trava "evolucao_pendente" do médico (409) entra aqui depois, no PR do
 * Médicos (verificarEvolucaoPendente em lib/server/trava-evolucao.ts).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ consultaId: string }> }) {
  try {
    const usuario = await exigirSessao();
    const { consultaId } = await params;
    const pedido = lerPedidoResposta(await req.json().catch(() => null));
    if (!pedido) throw comStatus(400, "Pedido inválido: envie acao (atender ou recusar) e tentativa.");

    const consulta = await db.consulta.findUnique({
      where: { id: consultaId },
      select: { id: true, pacienteId: true, medicoId: true, dataInicio: true, status: true },
    });
    if (!consulta) throw comStatus(404, "Consulta não encontrada.");
    const papel =
      usuario.role === "PACIENTE" && consulta.pacienteId === usuario.id
        ? "paciente"
        : usuario.role === "MEDICO" && consulta.medicoId === usuario.id
          ? "medico"
          : null;
    if (!papel) throw comStatus(403, "Acesso negado: você não participa desta consulta.");
    const encerrada = bloqueioConsultaEncerrada(consulta.status);
    if (encerrada) return encerrada;
    if (estadoJanelaSala(consulta.dataInicio, Date.now()) !== "aberta") {
      throw comStatus(409, "A sala desta consulta não está aberta agora.");
    }

    const onde = { consultaId, paraUsuarioId: usuario.id, tentativa: pedido.tentativa };
    const linha = await db.chamadaConsulta.findUnique({
      where: { consultaId_paraUsuarioId_tentativa: onde },
      select: { status: true, respondidaEm: true },
    });
    const decisao = decidirResposta(pedido.acao, linha);
    let status: string = decisao.status;
    let respondidaEm = linha?.respondidaEm ?? null;
    let avisar = decisao.avisar;

    if (decisao.atualizarPara) {
      const agora = new Date();
      // Guarda contra corrida (job que expira, outro aparelho): só sai dos status
      // permitidos (atender: tocando|expirada; recusar: tocando).
      const atender = decisao.atualizarPara === "atendida";
      // Médico: atualiza a linha dele primeiro e só fecha a espera se count === 1.
      // Se a espera já estava encerrada, desfaz a atualização (rollback) e devolve 409.
      class EsperaEncerrada extends Error {
        constructor(public desfecho: DesfechoEspera) { super("espera_encerrada"); }
      }
      let r: { count: number; encerrada: DesfechoEspera | null };
      try {
        r = await db.$transaction(async (tx) => {
          const u = await tx.chamadaConsulta.updateMany({
            where: { ...onde, status: { in: decisao.de } },
            data: { status: decisao.atualizarPara!, respondidaEm: agora },
          });
          if (u.count === 1 && atender && papel === "medico") {
            const fechou = await fecharEsperaMedicoEntrou(consultaId, agora, tx);
            if (fechou.resultado === "espera_encerrada") throw new EsperaEncerrada(fechou.desfecho);
          }
          if (u.count === 1 && atender && papel === "paciente") await abrirEspera(consultaId, agora, tx);
          return { count: u.count, encerrada: null as DesfechoEspera | null };
        });
      } catch (e) {
        if (e instanceof EsperaEncerrada) r = { count: 0, encerrada: e.desfecho };
        else throw e;
      }
      if (r.encerrada) {
        return NextResponse.json({ erro: "espera_encerrada", motivo: "espera_encerrada", desfecho: r.encerrada }, { status: 409 });
      }
      if (r.count === 1) {
        respondidaEm = agora;
      } else {
        const atual = await db.chamadaConsulta.findUnique({
          where: { consultaId_paraUsuarioId_tentativa: onde },
          select: { status: true, respondidaEm: true },
        });
        status = atual?.status ?? "sem_registro";
        respondidaEm = atual?.respondidaEm ?? null;
        avisar = false;
      }
    }

    if (avisar) {
      const evento = pedido.acao === "atender" ? "chamada_atendida" : "chamada_recusada";
      const payload = { consultaId, tentativa: pedido.tentativa, por: papel, em: (respondidaEm ?? new Date()).toISOString() };
      const topico = topicoNotificacoesUsuario(usuario.id);
      after(() => broadcastCanal(topico, evento, payload, { privado: true }));
    }

    return ok({
      consultaId,
      tentativa: pedido.tentativa,
      status,
      respondidaEm: respondidaEm ? respondidaEm.toISOString() : null,
    });
  } catch (erro) {
    return falha(erro);
  }
}

function comStatus(status: number, mensagem: string): Error & { status: number } {
  return Object.assign(new Error(mensagem), { status });
}

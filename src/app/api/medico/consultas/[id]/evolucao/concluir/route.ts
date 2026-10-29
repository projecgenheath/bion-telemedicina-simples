import { NextRequest, after } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { broadcastCanal } from "@/lib/supabase/broadcast";
import { topicoSala } from "@/lib/server/sala-canal";
import { erroHttp, evolucaoWire } from "@/lib/server/evolucao";

/**
 * Conduta preenchida? A conduta é gravada como JSON (a UI salva
 * { texto: "..." }); vazia, sem texto ou com qualquer outro formato sem
 * conteúdo não autoriza concluir — a exigência existia só na UI.
 */
function condutaPreenchida(condutaJson: string | null | undefined): boolean {
  if (!condutaJson) return false;
  let v: unknown;
  try {
    v = JSON.parse(condutaJson);
  } catch {
    return false;
  }
  if (typeof v === "string") return v.trim().length > 0;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.texto === "string") return o.texto.trim().length > 0;
    return Object.values(o).some((x) => typeof x === "string" && x.trim().length > 0);
  }
  return false;
}

/**
 * POST /api/medico/consultas/[id]/evolucao/concluir — só o MÉDICO dono.
 * Rascunho → concluida (concluidaEm = agora), libera a trava e, na mesma
 * transação, cancela os PedidoMedicao 'pendente' da consulta
 * (updateMany WHERE status='pendente' → 'cancelado') E conclui a consulta
 * correspondente — um só ato, atômico: nunca fica a evolução concluída e
 * a consulta pendente (ou vice-versa) por falha parcial, porque os dois
 * updates estão na mesma transação e um erro desfaz os dois.
 * A consulta só é concluída se ainda estiver em estado "ia acontecer"
 * (confirmada | em_espera | pendente_anamnese), for do mesmo médico e
 * não tiver desfecho vigente (falta/falha): consulta já encerrada
 * (concluída, cancelada, aguardando_reagendamento ou falta_paciente)
 * NÃO é ressuscitada — nesse caso só a evolução é concluída e a
 * resposta informa consultaConcluidaAgora: false.
 * 404 sem evolução; 409 { erro: "evolucao_concluida" } se já concluída.
 * 400 se a conduta estiver vazia (exigência também no servidor, não só na UI).
 * → { evolucao, pedidosMedicaoCancelados: string[], consulta: { id, status } | null, consultaConcluidaAgora: boolean }
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await params;
    const ev = await db.evolucao.findFirst({ where: { consultaId: id, medicoId: medico.id }, select: { id: true, status: true, conduta: true } });
    if (!ev) return Response.json({ erro: "Evolução não encontrada." }, { status: 404 });
    if (ev.status === "concluida") return Response.json({ erro: "evolucao_concluida" }, { status: 409 });
    // Conduta obrigatória também no servidor (antes, só a UI exigia):
    // evolução vazia não pode ser carimbada como concluída por API direta.
    if (!condutaPreenchida(ev.conduta)) {
      return Response.json({ erro: "Preencha a conduta antes de concluir a evolução." }, { status: 400 });
    }

    const agora = new Date();
    const { atualizada, cancelados, consultaConcluidaAgora, consultaStatus } = await db.$transaction(async (tx) => {
      const r = await tx.evolucao.updateMany({
        where: { id: ev.id, medicoId: medico.id, status: "rascunho" },
        data: { status: "concluida", concluidaEm: agora },
      });
      if (r.count === 0) throw erroHttp(409, "evolucao_concluida");
      const pend = await tx.pedidoMedicao.findMany({ where: { consultaId: id, status: "pendente" }, select: { id: true } });
      if (pend.length) {
        await tx.pedidoMedicao.updateMany({ where: { id: { in: pend.map((p) => p.id) }, status: "pendente" }, data: { status: "cancelado" } });
      }
      // Unificação do "concluir" (mesma transação da evolução): a consulta
      // correspondente também vai para "concluida", com trava otimista
      // (status lido + medicoId) e sem ressuscitar consulta encerrada nem
      // consulta com desfecho vigente (ex.: falta antiga ainda com status
      // "confirmada", de antes do status terminal falta_paciente).
      let consultaConcluidaAgora = false;
      const consulta = await tx.consulta.findUnique({ where: { id }, select: { id: true, medicoId: true, status: true, dataInicio: true } });
      let consultaStatus: string | null = consulta?.status ?? null;
      if (
        consulta &&
        consulta.medicoId === medico.id &&
        ["confirmada", "em_espera", "pendente_anamnese"].includes(consulta.status)
      ) {
        const desfecho = await tx.eventoConsulta.findFirst({
          where: { consultaId: id, tipo: { in: ["falta_paciente", "falha_tecnica"] }, corrigidoEm: null, dataAnterior: consulta.dataInicio },
          select: { id: true },
        });
        if (!desfecho) {
          const upd = await tx.consulta.updateMany({
            where: { id, medicoId: medico.id, status: consulta.status },
            data: { status: "concluida" },
          });
          if (upd.count > 0) {
            consultaConcluidaAgora = true;
            consultaStatus = "concluida";
          }
        }
      }
      const atualizada = await tx.evolucao.findUniqueOrThrow({ where: { id: ev.id } });
      // Re-checagem dentro da transação: um autosave concorrente não pode
      // esvaziar a conduta entre a pré-checagem e a conclusão (o throw
      // desfaz a transação inteira, sem concluir metade).
      if (!condutaPreenchida(atualizada.conduta)) throw erroHttp(400, "Preencha a conduta antes de concluir a evolução.");
      return { atualizada, cancelados: pend.map((p) => p.id), consultaConcluidaAgora, consultaStatus };
    });
    for (const pedidoId of cancelados) {
      after(() => broadcastCanal(topicoSala(id), "pedido_medicao_cancelado", { pedidoId }, { privado: true }));
    }
    await registrarAudit(medico, {
      acao: "EVOLUCAO_CONCLUIDA",
      categoria: "prontuario",
      entidade: "evolucao",
      entidadeId: ev.id,
      detalhes: `consultaId=${id}${consultaConcluidaAgora ? " consultaConcluidaAgora=true" : ` consultaStatus=${consultaStatus}`}${cancelados.length ? ` pedidosMedicaoCancelados=${cancelados.join(",")}` : ""}`,
    });
    return ok({
      evolucao: evolucaoWire(atualizada),
      pedidosMedicaoCancelados: cancelados,
      consulta: consultaStatus === null ? null : { id, status: consultaStatus },
      consultaConcluidaAgora,
    });
  } catch (erro) {
    return falha(erro);
  }
}

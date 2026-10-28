import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { aplicarSideEffects } from "@/lib/server/dados";
import { erroHttp } from "@/lib/server/evolucao";
import { reembolsarPedidoRenovacao } from "@/lib/server/renovacao-reembolso";
import { conferirMedicoAtivoNaTransacao } from "@/lib/server/bloqueio-agenda";

/**
 * POST /api/medico/renovacoes/[id]/responder — resposta do MÉDICO do pedido.
 *
 * Corpo (uma das três ações):
 *  { acao: "renovar", mensagemMedico?, documento: { titulo?, conteudo, medicamento?, posologia?, duracao?, observacoes?, cid? } }
 *     → cria Documento receita novo; status "renovada"; documentoNovoId.
 *       Receita de CONTROLADO (Documento.controlado = true): 409
 *       { erro: "controlado_exige_chamada" } — só por chamada.
 *  { acao: "chamada", dataInicio: ISO, mensagemMedico? }
 *     → cria Consulta tipoAtendimento "renovacao" (consultaOrigemId do pedido);
 *       status "chamada_marcada"; consultaId.
 *  { acao: "recusar", mensagemMedico }   (mensagem obrigatória)
 *     → status "recusada".
 *
 * Sempre grava respondidoEm. Atualização com updateMany WHERE id, medicoId e
 * status = 'pendente' na mesma transação: 409 { erro: "pedido_nao_pendente" }
 * quando count = 0 (já respondido, cancelado pelo paciente ou de outro médico).
 * Notificação ao paciente e auditoria (só ids/ação) pelo servidor.
 */

type Corpo = {
  acao?: string;
  mensagemMedico?: string;
  dataInicio?: string;
  documento?: {
    titulo?: string; conteudo?: string; medicamento?: string; posologia?: string;
    duracao?: string; observacoes?: string; cid?: string;
  };
};

const corta = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const DURACAO_CHAMADA_MS = 30 * 60_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const medico = await exigirPapel("MEDICO");
    const { id } = await params;
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Corpo;
    const mensagemMedico = corta(body.mensagemMedico, 1000);

    const pedido = await db.pedidoRenovacao.findFirst({
      where: { id, medicoId: medico.id },
      select: {
        id: true, status: true, pacienteId: true, consultaOrigemId: true,
        documento: { select: { id: true, controlado: true, titulo: true, medicamento: true, posologia: true, duracao: true, cid: true } },
        consultaOrigem: { select: { especialidade: true } },
      },
    });
    if (!pedido) return Response.json({ erro: "Pedido não encontrado." }, { status: 404 });
    if (pedido.status !== "pendente") return Response.json({ erro: "pedido_nao_pendente", status: pedido.status }, { status: 409 });

    const agora = new Date();
    const naoPendente = () => erroHttp(409, "pedido_nao_pendente");

    if (body.acao === "renovar") {
      if (pedido.documento?.controlado) {
        return Response.json(
          { erro: "controlado_exige_chamada", mensagem: "Receita de controlado: renove só numa chamada." },
          { status: 409 },
        );
      }
      const d = body.documento ?? {};
      const conteudo = corta(d.conteudo, 6000);
      if (!conteudo) return Response.json({ erro: "Informe o conteúdo da receita nova." }, { status: 400 });
      const doc = await db.$transaction(async (tx) => {
        const novo = await tx.documento.create({
          data: {
            tipo: "receita",
            titulo: corta(d.titulo, 160) ?? `Renovação: ${pedido.documento?.titulo ?? "receita"}`.slice(0, 160),
            conteudo,
            medicoId: medico.id,
            pacienteId: pedido.pacienteId,
            medicamento: corta(d.medicamento, 200) ?? pedido.documento?.medicamento ?? null,
            posologia: corta(d.posologia, 300) ?? pedido.documento?.posologia ?? null,
            duracao: corta(d.duracao, 100) ?? pedido.documento?.duracao ?? null,
            observacoes: corta(d.observacoes, 1000),
            cid: corta(d.cid, 20) ?? pedido.documento?.cid ?? null,
            controlado: false,
            consultaId: pedido.consultaOrigemId,
          },
          select: { id: true },
        });
        const r = await tx.pedidoRenovacao.updateMany({
          where: { id, medicoId: medico.id, status: "pendente" },
          data: { status: "renovada", documentoNovoId: novo.id, mensagemMedico, respondidoEm: agora },
        });
        if (r.count === 0) throw naoPendente();
        return novo;
      });
      const efeitos = await aplicarSideEffects(
        medico,
        [{ tipo: "receita", titulo: "Receita renovada", texto: `Sua receita foi renovada por ${medico.nome}. Documento eletrônico sem assinatura digital ICP-Brasil.`, usuarioId: pedido.pacienteId }],
        { acao: "RENOVACAO_RESPONDIDA", categoria: "documento", entidade: "pedidoRenovacao", entidadeId: id, detalhes: `status=renovada documentoNovoId=${doc.id}` },
      );
      return ok({ pedido: { id, status: "renovada", documentoNovoId: doc.id, consultaId: null, respondidoEm: agora.toISOString() }, ...efeitos });
    }

    if (body.acao === "chamada") {
      const inicio = body.dataInicio ? new Date(body.dataInicio) : null;
      if (!inicio || Number.isNaN(inicio.getTime())) return Response.json({ erro: "Informe dataInicio (ISO)." }, { status: 400 });
      if (inicio.getTime() < Date.now() - 60_000) return Response.json({ erro: "O horário da chamada já passou." }, { status: 400 });
      const conflito = await db.consulta.findFirst({
        where: {
          medicoId: medico.id,
          status: { notIn: ["cancelada", "aguardando_reagendamento"] },
          dataInicio: { gt: new Date(inicio.getTime() - DURACAO_CHAMADA_MS), lt: new Date(inicio.getTime() + DURACAO_CHAMADA_MS) },
        },
        select: { id: true },
      });
      if (conflito) return Response.json({ erro: "horario_ocupado" }, { status: 409 });
      const consulta = await db.$transaction(async (tx) => {
        // Médico suspenso/anonimizado/inativo não marca chamada (FOR SHARE: a
        // suspensão no meio do caminho espera esta transação ou a derruba).
        const erroMedico = await conferirMedicoAtivoNaTransacao(tx, medico.id);
        if (erroMedico) throw erroHttp(409, erroMedico);
        const c = await tx.consulta.create({
          data: {
            pacienteId: pedido.pacienteId,
            medicoId: medico.id,
            especialidade: pedido.consultaOrigem?.especialidade ?? "Renovação de receita",
            dataInicio: inicio,
            status: "confirmada",
            motivoConsulta: "Renovação de receita",
            tipoAtendimento: "renovacao",
            consultaOrigemId: pedido.consultaOrigemId,
            valor: 0, // preço da chamada curta: pendente de decisão do Alisson
          },
          select: { id: true },
        });
        const r = await tx.pedidoRenovacao.updateMany({
          where: { id, medicoId: medico.id, status: "pendente" },
          data: { status: "chamada_marcada", consultaId: c.id, mensagemMedico, respondidoEm: agora },
        });
        if (r.count === 0) throw naoPendente();
        return c;
      });
      const efeitos = await aplicarSideEffects(
        medico,
        [{ tipo: "agenda", titulo: "Chamada curta marcada", texto: `${medico.nome} marcou uma chamada curta para renovar sua receita.`, usuarioId: pedido.pacienteId }],
        { acao: "RENOVACAO_RESPONDIDA", categoria: "consulta", entidade: "pedidoRenovacao", entidadeId: id, detalhes: `status=chamada_marcada consultaId=${consulta.id}` },
      );
      return ok({ pedido: { id, status: "chamada_marcada", documentoNovoId: null, consultaId: consulta.id, respondidoEm: agora.toISOString() }, ...efeitos });
    }

    if (body.acao === "recusar") {
      if (!mensagemMedico) return Response.json({ erro: "Escreva a mensagem para o paciente." }, { status: 400 });
      await db.$transaction(async (tx) => {
        const r = await tx.pedidoRenovacao.updateMany({
          where: { id, medicoId: medico.id, status: "pendente" },
          data: { status: "recusada", mensagemMedico, respondidoEm: agora },
        });
        if (r.count === 0) throw naoPendente();
        // Ponto único do reembolso na recusa (pedido pago, pagamentoId do #66).
        // A função é do #66; aqui só a chamamos, na mesma transação.
        await reembolsarPedidoRenovacao(id, tx);
      });
      const efeitos = await aplicarSideEffects(
        medico,
        [{ tipo: "receita", titulo: "Pedido de renovação respondido", texto: `${medico.nome} respondeu seu pedido de renovação.`, usuarioId: pedido.pacienteId }],
        { acao: "RENOVACAO_RESPONDIDA", categoria: "documento", entidade: "pedidoRenovacao", entidadeId: id, detalhes: "status=recusada" },
      );
      return ok({ pedido: { id, status: "recusada", documentoNovoId: null, consultaId: null, respondidoEm: agora.toISOString() }, ...efeitos });
    }

    return Response.json({ erro: "acao inválida (renovar, chamada ou recusar)." }, { status: 400 });
  } catch (erro) {
    if ((erro as Error)?.message === "pedido_nao_pendente") {
      return Response.json({ erro: "pedido_nao_pendente" }, { status: 409 });
    }
    return falha(erro);
  }
}

import { exigirAceiteTermosPaciente } from "@/lib/server/aceite-termos";
import { confirmarPagamento, modoGateway } from "@/lib/server/pagamentos";
import { confirmarPagamentoRenovacao, criarCobrancaRenovacao } from "@/lib/server/renovacao-pagamento";
import { STATUS_RENOVACAO_ABERTOS } from "@/lib/atendimento-tipo";
import { NextRequest } from "next/server";
import { decisaoCobranca, respostaIndisponivel, stripeAtivo } from "@/lib/stripe-checkout-logica";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  ehViolacaoUnica,
  lerCorpoPedidoRenovacao,
  lerPedidoRenovacao,
  podeRenovarReceita,
  PRAZO_RENOVACAO_DIAS,
} from "@/lib/atendimento-tipo";

/**
 * Pedido de renovação de receita — lado do PACIENTE (Teleconsulta v2).
 * Tabela "PedidoRenovacao" (migração 20261019b do Médicos), via Prisma.
 *
 *  PATCH /api/renovacoes/[id] { acao: "cancelar" } → paciente cancela o próprio pedido pendente.
 *  GET  → pedidos do próprio paciente.
 *  POST → { documentoId, observacaoPaciente? } cria um pedido "pendente".
 *         Recusa: receita de outra pessoa, não-receita, medicamento
 *         controlado (Documento.controlado OU lista da Portaria 344),
 *         receita velha demais e pedido pendente duplicado para a mesma
 *         prescrição (índice único parcial no banco).
 */
export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const linhas = await db.pedidoRenovacao.findMany({
      where: { pacienteId: usuario.id },
      orderBy: { criadoEm: "desc" },
      take: 100,
    });
    const pedidos = linhas.map(lerPedidoRenovacao).filter((p) => p !== null);
    // `disponivel` fica na resposta por compatibilidade com a tela.
    return ok({ disponivel: true, pedidos });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    // Termos + privacidade vigentes: sem aceite, nada novo é agendado (403).
    const semAceite = await exigirAceiteTermosPaciente(usuario);
    if (semAceite) return semAceite;
    const corpo = lerCorpoPedidoRenovacao(await req.json().catch(() => null));
    if (typeof corpo === "string") return Response.json({ erro: corpo }, { status: 400 });

    const receita = await db.documento.findFirst({
      where: { id: corpo.documentoId, pacienteId: usuario.id },
      include: { medico: { select: { id: true, nome: true } } },
    });
    if (!receita || receita.tipo !== "receita") {
      return Response.json({ erro: "Receita não encontrada." }, { status: 404 });
    }
    // Controlado: nunca (regra do Alisson). A mesma checagem da tela.
    if (!podeRenovarReceita(receita)) {
      return Response.json(
        { erro: "Esta receita não pode ser renovada pelo app (medicamento controlado ou sem nome do medicamento). Agende uma consulta." },
        { status: 400 },
      );
    }
    if (Date.now() - receita.createdAt.getTime() > PRAZO_RENOVACAO_DIAS * 86_400_000) {
      return Response.json({ erro: "Receita com mais de um ano. Agende uma consulta." }, { status: 400 });
    }

    // Origem: Documento.consultaId quando o médico gravou (e a consulta é
    // deste paciente). Senão (docs antigos), a última consulta concluída com
    // esse médico até 1 dia depois da emissão da receita.
    let origemId: string | null = null;
    if (receita.consultaId) {
      const c = await db.consulta.findFirst({
        where: { id: receita.consultaId, pacienteId: usuario.id },
        select: { id: true },
      });
      origemId = c?.id ?? null;
    }
    if (!origemId) {
      const origem = await db.consulta.findFirst({
        where: {
          pacienteId: usuario.id,
          medicoId: receita.medicoId,
          status: "concluida",
          dataInicio: { lte: new Date(receita.createdAt.getTime() + 86_400_000) },
        },
        orderBy: { dataInicio: "desc" },
        select: { id: true },
      });
      origemId = origem?.id ?? null;
    }

    const duplicado = await db.pedidoRenovacao.findFirst({
      where: { pacienteId: usuario.id, documentoId: receita.id, status: { in: [...STATUS_RENOVACAO_ABERTOS] } },
      select: { id: true },
    });
    if (duplicado) {
      return Response.json({ erro: "Você já pediu a renovação desta receita. Aguarde o médico." }, { status: 409 });
    }
    // Só cartão (checkout Stripe). Flag desligada com gateway real: 503, sem
    // criar o pedido nem a cobrança. Nunca Pix.
    const decisao = decisaoCobranca(stripeAtivo(), modoGateway());
    if (decisao === "indisponivel") {
      const r = respostaIndisponivel();
      return Response.json(r.corpo, { status: r.status });
    }
    let criado;
    let pagamentoId: string;
    try {
      // Cobra o valor normal da consulta do médico já no pedido (aguardando_pagamento);
      // o webhook (confirmarPagamentoRenovacao) leva para "pendente".
      const r = await db.$transaction((tx) =>
        criarCobrancaRenovacao(tx, {
          id: randomUUID(),
          pacienteId: usuario.id,
          medicoId: receita.medicoId,
          consultaOrigemId: origemId,
          documentoId: receita.id,
          observacaoPaciente: corpo.observacaoPaciente ?? null,
        }),
      );
      criado = r.pedido;
      pagamentoId = r.pagamento.id;
    } catch (e) {
      // Corrida: o índice único parcial (pacienteId, documentoId) WHERE
      // status='pendente' segura o segundo pedido.
      if (ehViolacaoUnica(e)) {
        return Response.json({ erro: "Você já pediu a renovação desta receita. Aguarde o médico." }, { status: 409 });
      }
      throw e;
    }
    // Demonstração: o gateway simulado confirma no servidor, como no agendar.
    if (decisao === "simulado") {
      const pg = await confirmarPagamento(pagamentoId, "simulado");
      if (pg?.status === "confirmado") {
        await db.$transaction((tx) => confirmarPagamentoRenovacao(pagamentoId, tx));
        criado = (await db.pedidoRenovacao.findUnique({ where: { id: criado.id } })) ?? criado;
      }
    }
    const pedido = lerPedidoRenovacao(criado);
    if (!pedido) {
      return Response.json({ erro: "Você já pediu a renovação desta receita. Aguarde o médico." }, { status: 409 });
    }

    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "receita",
          titulo: "Pedido de renovação de receita",
          texto: `${usuario.nome} pediu a renovação de ${receita.medicamento}. Você decide se renova por mensagem ou marca uma chamada curta.`,
          usuarioId: receita.medicoId,
        },
      ],
      {
        acao: "RENOVACAO_SOLICITADA",
        categoria: "consulta",
        entidade: "pedido_renovacao",
        entidadeId: pedido.id,
        detalhes: `pedidoId=${pedido.id} documentoId=${receita.id} pacienteId=${receita.pacienteId}`,
      },
    );
    return ok({ disponivel: true, pedido, cobranca: { pagamentoId, valorCentavos: criado.valorCentavos ?? 0, status: criado.status === "aguardando_pagamento" ? "pendente" : "confirmado", metodo: "cartao", pagarComCartao: decisao === "stripe" && criado.status === "aguardando_pagamento" }, ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

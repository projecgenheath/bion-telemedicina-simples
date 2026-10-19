import { NextRequest } from "next/server";
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
 *
 * A tabela "PedidoRenovacao" é criada pela migração do Médicos. Até ela
 * existir, as duas rotas respondem { disponivel: false } (sem erro), e a tela
 * esconde o botão. SQL cru de propósito: o modelo Prisma entra com o PR dele.
 *
 *  PATCH /api/renovacoes/[id] { acao: "cancelar" } → paciente cancela o próprio pedido pendente.
 *  GET  → pedidos do próprio paciente.
 *  POST → { documentoId, observacaoPaciente? } cria um pedido "pendente".
 *         Recusa: receita de outra pessoa, não-receita, medicamento
 *         controlado (sempre), receita velha demais e pedido pendente
 *         duplicado para a mesma prescrição.
 */
async function tabelaExiste(): Promise<boolean> {
  try {
    const r = await db.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public."PedidoRenovacao"')::text AS t`;
    return Boolean(r[0]?.t);
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    if (!(await tabelaExiste())) return ok({ disponivel: false, pedidos: [] });
    const linhas = await db.$queryRaw<unknown[]>`
      SELECT * FROM public."PedidoRenovacao"
      WHERE "pacienteId" = ${usuario.id}
      ORDER BY "criadoEm" DESC
      LIMIT 100`;
    const pedidos = linhas.map(lerPedidoRenovacao).filter((p) => p !== null);
    return ok({ disponivel: true, pedidos });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const corpo = lerCorpoPedidoRenovacao(await req.json().catch(() => null));
    if (typeof corpo === "string") return Response.json({ erro: corpo }, { status: 400 });
    if (!(await tabelaExiste())) {
      return Response.json({ disponivel: false, erro: "A renovação de receita ainda não está disponível." }, { status: 503 });
    }

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

    // Documento não guarda a consulta: a origem é a última consulta concluída
    // com esse médico até 1 dia depois da emissão da receita.
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

    const id = randomUUID();
    // Duplicado pendente: checagem e inserção no MESMO comando (sem corrida).
    let inseridos: unknown[];
    try {
      inseridos = await db.$queryRaw<unknown[]>`
      INSERT INTO public."PedidoRenovacao"
        ("id", "pacienteId", "medicoId", "consultaOrigemId", "documentoId", "status", "observacaoPaciente", "criadoEm")
      SELECT ${id}, ${usuario.id}, ${receita.medicoId}, ${origem?.id ?? null}, ${receita.id}, 'pendente', ${corpo.observacaoPaciente}, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public."PedidoRenovacao"
        WHERE "pacienteId" = ${usuario.id} AND "documentoId" = ${receita.id} AND "status" = 'pendente'
      )
      RETURNING *`;
    } catch (e) {
      // Índice único parcial (pacienteId, documentoId) WHERE status='pendente'.
      if (ehViolacaoUnica(e)) {
        return Response.json({ erro: "Você já pediu a renovação desta receita. Aguarde o médico." }, { status: 409 });
      }
      throw e;
    }
    const pedido = lerPedidoRenovacao(inseridos[0]);
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
    return ok({ disponivel: true, pedido, ...efeitos });
  } catch (erro) {
    return falha(erro);
  }
}

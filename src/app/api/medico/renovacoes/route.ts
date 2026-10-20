import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";

/**
 * GET /api/medico/renovacoes?status=pendente|todos — SOMENTE LEITURA.
 * Pedidos de renovação de receita feitos ao médico da sessão (só os dele).
 * Padrão: pendentes, mais antigos primeiro (máx. 100).
 */
const STATUS = new Set(["pendente", "renovada", "chamada_marcada", "recusada", "cancelado"]);

export async function GET(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const filtro = req.nextUrl.searchParams.get("status") || "pendente";
    if (filtro !== "todos" && !STATUS.has(filtro)) {
      return Response.json({ erro: "status inválido." }, { status: 400 });
    }
    const pedidos = await db.pedidoRenovacao.findMany({
      where: { medicoId: medico.id, ...(filtro === "todos" ? {} : { status: filtro }) },
      orderBy: { criadoEm: filtro === "pendente" ? "asc" : "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        criadoEm: true,
        respondidoEm: true,
        observacaoPaciente: true,
        mensagemMedico: true,
        consultaOrigemId: true,
        consultaId: true,
        documentoNovoId: true,
        paciente: { select: { id: true, nome: true } },
        documento: {
          select: {
            id: true, tipo: true, titulo: true, conteudo: true, medicamento: true, posologia: true,
            duracao: true, observacoes: true, cid: true, controlado: true, createdAt: true,
          },
        },
      },
    });
    return ok({
      pedidos: pedidos.map((p) => ({
        id: p.id,
        status: p.status,
        criadoEm: p.criadoEm.toISOString(),
        respondidoEm: p.respondidoEm?.toISOString() ?? null,
        observacaoPaciente: p.observacaoPaciente,
        mensagemMedico: p.mensagemMedico,
        consultaOrigemId: p.consultaOrigemId,
        consultaId: p.consultaId,
        documentoNovoId: p.documentoNovoId,
        paciente: p.paciente,
        documento: p.documento ? { ...p.documento, createdAt: p.documento.createdAt.toISOString() } : null,
        // Controlado: só por chamada (o botão "Renovar" fica desligado).
        exigeChamada: p.documento?.controlado === true,
      })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

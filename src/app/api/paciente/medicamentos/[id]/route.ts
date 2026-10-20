import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { serializarMedicamento } from "../serializar";
import { detalhesAuditoria } from "@/lib/saude-paciente";

/**
 * PATCH  { ativo: boolean } — "parei de tomar" / "voltei a tomar" (qualquer origem).
 * DELETE — só os que o próprio paciente adicionou; os da receita só são desativados
 *          (o histórico do médico não some). Lembretes ligados ficam, sem o vínculo (SET NULL).
 */
async function doDono(id: string, pacienteId: string) {
  const m = await db.medicamentoEmUso.findUnique({ where: { id } });
  return m && m.pacienteId === pacienteId ? m : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const body = ((await req.json().catch(() => ({}))) ?? {}) as { ativo?: unknown };
    if (typeof body.ativo !== "boolean") return Response.json({ erro: "Informe ativo (true/false)." }, { status: 400 });
    if (!(await doDono(id, usuario.id))) return Response.json({ erro: "Medicamento não encontrado." }, { status: 404 });
    const m = await db.medicamentoEmUso.update({
      where: { id },
      data: { ativo: body.ativo, fim: body.ativo ? null : new Date() },
      include: { lembretes: { select: { id: true } } },
    });
    await aplicarSideEffects(usuario, undefined, {
      acao: body.ativo ? "MEDICAMENTO_REATIVADO" : "MEDICAMENTO_SUSPENSO",
      categoria: "prontuario",
      entidade: "medicamentoEmUso",
      entidadeId: id,
      detalhes: detalhesAuditoria({ pacienteId: usuario.id, medicamentoEmUsoId: id }),
    });
    return ok({ medicamento: serializarMedicamento(m) });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const m = await doDono(id, usuario.id);
    if (!m) return Response.json({ erro: "Medicamento não encontrado." }, { status: 404 });
    if (m.origem !== "paciente") {
      return Response.json({ erro: "Medicamentos da receita não podem ser apagados; marque como \"parei de tomar\"." }, { status: 409 });
    }
    await db.medicamentoEmUso.delete({ where: { id } });
    await aplicarSideEffects(usuario, undefined, {
      acao: "MEDICAMENTO_REMOVIDO",
      categoria: "prontuario",
      entidade: "medicamentoEmUso",
      entidadeId: id,
      detalhes: detalhesAuditoria({ pacienteId: usuario.id, medicamentoEmUsoId: id }),
    });
    return ok({ removido: id });
  } catch (erro) {
    return falha(erro);
  }
}

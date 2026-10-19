import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { detalhesAuditoria, validarMedicamento } from "@/lib/saude-paciente";
import { serializarMedicamento } from "./serializar";

/**
 * GET  /api/paciente/medicamentos — medicamentos em uso do próprio paciente
 *      (ativos primeiro; receita + os que ele adicionou).
 * POST /api/paciente/medicamentos — paciente adiciona { nome, dose?, via?, frequencia?, usoContinuo? }
 *      (origem "paciente"; nunca controlado).
 */
export async function GET() {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const lista = await db.medicamentoEmUso.findMany({
      where: { pacienteId: usuario.id },
      orderBy: [{ ativo: "desc" }, { inicio: "desc" }],
      take: 100,
      include: { lembretes: { select: { id: true } } },
    });
    return ok({ medicamentos: lista.map(serializarMedicamento) });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const v = validarMedicamento(((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>);
    if (!v.ok) return Response.json({ erro: v.erro }, { status: 400 });
    const m = await db.medicamentoEmUso.create({
      data: { ...v.dados, pacienteId: usuario.id, origem: "paciente", controlado: false },
    });
    await aplicarSideEffects(usuario, undefined, {
      acao: "MEDICAMENTO_ADICIONADO",
      categoria: "prontuario",
      entidade: "medicamentoEmUso",
      entidadeId: m.id,
      detalhes: detalhesAuditoria({ pacienteId: usuario.id, medicamentoEmUsoId: m.id }),
    });
    return ok({ medicamento: serializarMedicamento(m) });
  } catch (erro) {
    return falha(erro);
  }
}

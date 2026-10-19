import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { detalhesAuditoria, FREQUENCIAS_LEMBRETE, HORA, resumoMedicamento } from "@/lib/saude-paciente";

/**
 * POST /api/paciente/medicamentos/:id/lembrete { horario: "HH:MM", frequencia? }
 * Cria um Lembrete de Medicação ligado ao medicamento (medicamentoEmUsoId) e à
 * receita de origem (documentoId), no mesmo contrato delta de POST /api/lembretes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const body = ((await req.json().catch(() => ({}))) ?? {}) as { horario?: unknown; frequencia?: unknown };
    const horario = typeof body.horario === "string" ? body.horario : "";
    if (!HORA.test(horario)) return Response.json({ erro: "Informe o horário no formato HH:MM." }, { status: 400 });
    const frequencia = FREQUENCIAS_LEMBRETE.includes(body.frequencia as (typeof FREQUENCIAS_LEMBRETE)[number])
      ? (body.frequencia as string)
      : "Todos os dias";

    const med = await db.medicamentoEmUso.findUnique({ where: { id } });
    if (!med || med.pacienteId !== usuario.id) return Response.json({ erro: "Medicamento não encontrado." }, { status: 404 });
    if (!med.ativo) return Response.json({ erro: "Este medicamento está marcado como suspenso." }, { status: 409 });

    const resumo = resumoMedicamento(med);
    const lembrete = await db.lembrete.create({
      data: {
        usuarioId: usuario.id,
        titulo: resumo ? `${med.nome} (${resumo})`.slice(0, 160) : med.nome,
        horario,
        tipo: "Medicação",
        frequencia,
        medicamento: med.nome,
        origem: med.origem === "receita" ? "receita" : "paciente",
        medicamentoEmUsoId: med.id,
        documentoId: med.documentoId,
      },
    });

    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "lembrete",
          titulo: "Lembrete criado",
          texto: `${lembrete.titulo} programado para ${lembrete.horario} (${lembrete.frequencia}).`,
          usuarioId: usuario.id,
        },
      ],
      {
        acao: "LEMBRETE_CRIADO",
        categoria: "sistema",
        entidade: "lembrete",
        entidadeId: lembrete.id,
        detalhes: detalhesAuditoria({ pacienteId: usuario.id, lembreteId: lembrete.id, medicamentoEmUsoId: med.id, documentoId: med.documentoId }),
      },
    );

    return ok({
      lembrete: {
        id: lembrete.id,
        titulo: lembrete.titulo,
        horario: lembrete.horario,
        tipo: lembrete.tipo,
        frequencia: lembrete.frequencia,
        feito: lembrete.feito,
        medicamento: lembrete.medicamento,
      },
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}

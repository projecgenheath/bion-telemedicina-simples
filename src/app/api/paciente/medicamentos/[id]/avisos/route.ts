import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  descricaoAvisos,
  detalhesAuditoria,
  lerPosologia,
  resumoMedicamento,
  validarAvisos,
  type Posologia,
} from "@/lib/saude-paciente";
import { serializarMedicamento } from "../../serializar";
import { serializarLembrete, type LembreteWire } from "../../lembrete-wire";

/**
 * POST /api/paciente/medicamentos/:id/avisos { horarios, vezesAoDia?, diaSemana? }
 * Substitui o conjunto de avisos do medicamento: apaga os Lembretes de
 * Medicação ligados a ele (medicamentoEmUsoId) e cria os novos na mesma
 * transação, atualizando a posologia (horarios/frequencia/vezesAoDia/diaSemana).
 * `horarios: []` desliga todos os avisos. Devolve { medicamento, lembretes,
 * removidos } — `removidos` são os ids apagados, p/ o cliente sair do estado
 * antigo sem recarregar. A rota unitária [id]/lembrete continua existindo.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const { id } = await params;
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const a = validarAvisos(body, { permitirVazio: true });
    if (!a.ok) return Response.json({ erro: a.erro }, { status: 400 });
    const avisos = a.avisos;
    if (!avisos) return Response.json({ erro: "Informe os horários dos avisos." }, { status: 400 });

    const med = await db.medicamentoEmUso.findUnique({ where: { id } });
    if (!med || med.pacienteId !== usuario.id) return Response.json({ erro: "Medicamento não encontrado." }, { status: 404 });
    if (!med.ativo) return Response.json({ erro: "Este medicamento está marcado como suspenso." }, { status: 409 });

    // A posologia nova preserva instrucoes/duracaoDias; os campos de aviso
    // (frequencia/horarios/vezesAoDia/diaSemana) passam a ser os do conjunto
    // salvo — com o conjunto vazio, eles saem (o editor é a fonte da verdade).
    const anterior = lerPosologia(med.posologia);
    const posologia: Posologia = {};
    if (anterior.instrucoes) posologia.instrucoes = anterior.instrucoes;
    if (anterior.duracaoDias) posologia.duracaoDias = anterior.duracaoDias;
    if (avisos.horarios.length) Object.assign(posologia, avisos.posologia);
    const posologiaJson = JSON.stringify(posologia);

    const { atual, criados, removidos } = await db.$transaction(async (tx) => {
      const antigos = await tx.lembrete.findMany({
        where: { medicamentoEmUsoId: id, tipo: "Medicação" },
        select: { id: true },
      });
      await tx.lembrete.deleteMany({ where: { medicamentoEmUsoId: id, tipo: "Medicação" } });
      const resumo = resumoMedicamento({ dose: med.dose, via: med.via, posologia: posologiaJson });
      const titulo = resumo ? `${med.nome} (${resumo})`.slice(0, 160) : med.nome;
      const novos: LembreteWire[] = [];
      for (const horario of avisos.horarios) {
        novos.push(
          await tx.lembrete.create({
            data: {
              usuarioId: usuario.id,
              titulo,
              horario,
              tipo: "Medicação",
              frequencia: avisos.frequenciaLembrete,
              medicamento: med.nome,
              origem: med.origem === "receita" ? "receita" : "paciente",
              medicamentoEmUsoId: med.id,
              documentoId: med.documentoId,
            },
          }),
        );
      }
      const atualizado = await tx.medicamentoEmUso.update({ where: { id }, data: { posologia: posologiaJson } });
      return { atual: atualizado, criados: novos, removidos: antigos.map((l) => l.id) };
    });

    const efeitos = await aplicarSideEffects(
      usuario,
      [
        {
          tipo: "lembrete",
          titulo: "Avisos atualizados",
          texto: criados.length ? `${med.nome}: ${descricaoAvisos(posologia)}.` : `${med.nome}: avisos desligados.`,
          usuarioId: usuario.id,
        },
      ],
      {
        acao: "AVISOS_MEDICAMENTO_ATUALIZADOS",
        categoria: "sistema",
        entidade: "medicamentoEmUso",
        entidadeId: id,
        detalhes: detalhesAuditoria({
          pacienteId: usuario.id,
          medicamentoEmUsoId: id,
          ...(criados.length ? { lembretes: criados.map((l) => l.id) } : {}),
        }),
      },
    );

    return ok({
      medicamento: serializarMedicamento({ ...atual, lembretes: criados.map((l) => ({ id: l.id })) }),
      lembretes: criados.map(serializarLembrete),
      removidos,
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}

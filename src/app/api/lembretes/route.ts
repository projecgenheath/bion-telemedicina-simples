import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { carregarDados, aplicarSideEffects, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Criação de lembretes de saúde (apenas pacientes). */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as {
      titulo: string;
      horario: string;
      tipo: string;
      frequencia: string;
      medicamento?: string;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    if (!body.titulo?.trim()) {
      return Response.json({ erro: "Informe o título do lembrete." }, { status: 400 });
    }

    const lembrete = await db.lembrete.create({
      data: {
        usuarioId: usuario.id,
        titulo: body.titulo.trim(),
        horario: body.horario || "08:00",
        tipo: body.tipo || "Medicação",
        frequencia: body.frequencia || "Todos os dias",
        medicamento: body.medicamento || null,
      },
    });

    await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "LEMBRETE_CRIADO",
        categoria: "sistema",
        detalhes: `Lembrete "${body.titulo}" — ${body.horario} (${body.frequencia})`,
      }),
      entidade: "lembrete",
      entidadeId: lembrete.id,
    });

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import {
  carregarDados,
  aplicarSideEffects,
  parseDataHora,
  parseValor,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Agendamento de nova consulta (apenas pacientes). */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirPapel("PACIENTE");
    const body = (await req.json()) as {
      medicoId: string;
      data: string;
      hora: string;
      motivoConsulta?: string;
      valor?: string | number;
      pago?: boolean;
      /** "pendente_anamnese": agendamento via BION IA — pago, aguardando anamnese. */
      status?: string;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    const medico = await db.user.findFirst({
      where: { id: body.medicoId, role: "MEDICO" },
      include: { perfilMedico: true },
    });
    if (!medico) {
      return Response.json({ erro: "Médico não encontrado." }, { status: 400 });
    }

    // O paciente NÃO pode auto-confirmar: só aceitamos pendente_anamnese aqui.
    // A confirmação real acontece só depois da anamnese concluída (rota /api/anamnese).
    const status = body.status === "pendente_anamnese" ? "pendente_anamnese" : "confirmada";

    const consulta = await db.consulta.create({
      data: {
        pacienteId: usuario.id,
        medicoId: medico.id,
        especialidade: medico.perfilMedico?.especialidade ?? "Clínica Geral",
        dataInicio: parseDataHora(body.data, body.hora),
        status,
        valor: parseValor(body.valor),
        pago: body.pago ?? true,
        motivoConsulta: body.motivoConsulta?.trim() || "Consulta de rotina",
      },
    });

    // Agendamento pela BION IA: cria a anamnese pendente que confirma a consulta
    if (status === "pendente_anamnese") {
      await db.anamnese.create({
        data: { consultaId: consulta.id, usuarioId: usuario.id },
      });
    }

    await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "CONSULTA_AGENDADA",
        categoria: "consulta",
        detalhes: `Agendamento com ${medico.nome} — ${consulta.especialidade} em ${body.data} às ${body.hora}`,
      }),
      entidade: "consulta",
      entidadeId: consulta.id,
    });

    const dados = await carregarDados(usuario);
    return ok({ ...dados, consultaCriada: consulta.id });
  } catch (erro) {
    return falha(erro);
  }
}

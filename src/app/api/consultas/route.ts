import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import {
  aplicarSideEffects,
  parseDataHora,
  parseValor,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Agendamento de nova consulta (apenas pacientes).
 *  Contrato delta: devolve APENAS a consulta criada (mais a anamnese gerada
 *  quando o agendamento é pela BION IA e os efeitos colaterais criados). */
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

    const dataInicio = parseDataHora(body.data, body.hora);
    const consulta = await db.consulta.create({
      data: {
        pacienteId: usuario.id,
        medicoId: medico.id,
        especialidade: medico.perfilMedico?.especialidade ?? "Clínica Geral",
        dataInicio,
        status,
        valor: parseValor(body.valor),
        pago: body.pago ?? true,
        motivoConsulta: body.motivoConsulta?.trim() || "Consulta de rotina",
      },
    });

    // Agendamento pela BION IA: cria a anamnese pendente que confirma a consulta
    let anamnese: {
      id: string;
      consultaId: string;
      medico: string;
      especialidade: string;
      etapa: string;
      status: string;
      coleta: Record<string, Record<string, unknown>>;
      documentos: { nome: string; tipo: string; exameImportado: boolean; resumo?: string }[];
      updatedAt: string;
    } | null = null;
    if (status === "pendente_anamnese") {
      const a = await db.anamnese.create({
        data: { consultaId: consulta.id, usuarioId: usuario.id },
      });
      anamnese = {
        id: a.id,
        consultaId: a.consultaId,
        medico: medico.nome,
        especialidade: consulta.especialidade,
        etapa: a.etapa,
        status: a.status,
        coleta: JSON.parse(a.coleta || "{}") as Record<string, Record<string, unknown>>,
        documentos: JSON.parse(a.documentos || "[]") as {
          nome: string;
          tipo: string;
          exameImportado: boolean;
          resumo?: string;
        }[],
        updatedAt: a.updatedAt.toISOString(),
      };
    }

    const efeitos = await aplicarSideEffects(usuario, body.notificacoes, {
      ...(body.audit ?? {
        acao: "CONSULTA_AGENDADA",
        categoria: "consulta",
        detalhes: `Agendamento com ${medico.nome} — ${consulta.especialidade} em ${body.data} às ${body.hora}`,
      }),
      entidade: "consulta",
      entidadeId: consulta.id,
    });

    return ok({
      consulta: {
        id: consulta.id,
        medicoId: consulta.medicoId,
        medico: medico.nome,
        pacienteId: consulta.pacienteId,
        paciente: usuario.nome,
        especialidade: consulta.especialidade,
        dataInicio: dataInicio.toISOString(),
        status: consulta.status,
        motivoConsulta: consulta.motivoConsulta ?? undefined,
        motivoCancelamento: consulta.motivoCancelamento ?? undefined,
        valor: consulta.valor,
        pago: consulta.pago,
      },
      ...(anamnese ? { anamnese } : {}),
      consultaCriada: consulta.id,
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}

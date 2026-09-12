import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import {
  carregarDados,
  aplicarSideEffects,
  parseDataHora,
  parseValor,
  medicoIdPorNome,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

type Acao = "cancelar" | "concluir" | "remarcar" | "atualizar";

/**
 * Ações sobre uma consulta:
 * - cancelar (paciente dono, médico dono ou admin)
 * - concluir (médico dono ou admin)
 * - remarcar (paciente dono ou admin)
 * - atualizar (admin): data/hora/médico/especialidade/status/pagamento
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const usuario = await exigirSessao();
    const { id } = await params;
    const body = (await req.json()) as {
      acao: Acao;
      motivo?: string;
      resumo?: string;
      data?: string;
      hora?: string;
      medico?: string;
      especialidade?: string;
      status?: string;
      pago?: boolean;
      valor?: string | number;
      notificacoes?: NotifPayload[];
      audit?: AuditPayload;
    };

    const consulta = await db.consulta.findUnique({ where: { id } });
    if (!consulta) {
      return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
    }

    const ehDonoPaciente = consulta.pacienteId === usuario.id;
    const ehDonoMedico = consulta.medicoId === usuario.id;
    const ehAdmin = usuario.role === "ADMIN";

    if (!ehDonoPaciente && !ehDonoMedico && !ehAdmin) {
      return Response.json({ erro: "Acesso negado." }, { status: 403 });
    }

    const data: Parameters<typeof db.consulta.update>[0]["data"] = {};

    switch (body.acao) {
      case "cancelar": {
        data.status = "cancelada";
        data.motivoCancelamento = body.motivo?.trim() || "Não informado";
        break;
      }
      case "concluir": {
        if (!ehDonoMedico && !ehAdmin) {
          return Response.json({ erro: "Apenas o médico pode concluir a consulta." }, { status: 403 });
        }
        data.status = "concluida";
        if (body.resumo !== undefined) data.resumoMedico = body.resumo;
        break;
      }
      case "remarcar": {
        if (!body.data || !body.hora) {
          return Response.json({ erro: "Informe a nova data e horário." }, { status: 400 });
        }
        data.dataInicio = parseDataHora(body.data, body.hora);
        data.status = "confirmada";
        data.remarcada = true;
        break;
      }
      case "atualizar": {
        if (!ehAdmin) {
          return Response.json({ erro: "Apenas administradores podem editar consultas." }, { status: 403 });
        }
        if (body.data && body.hora) data.dataInicio = parseDataHora(body.data, body.hora);
        else if (body.data && body.hora === undefined && body.status === undefined) {
          // data sem hora: mantém hora atual
        }
        if (body.medico) {
          const novoMedicoId = await medicoIdPorNome(body.medico);
          if (!novoMedicoId) {
            return Response.json({ erro: "Médico não encontrado." }, { status: 400 });
          }
          data.medicoId = novoMedicoId;
        }
        if (body.especialidade) data.especialidade = body.especialidade;
        if (body.status) data.status = body.status;
        if (body.pago !== undefined) data.pago = body.pago;
        if (body.valor !== undefined) data.valor = parseValor(body.valor);
        break;
      }
      default:
        return Response.json({ erro: "Ação inválida." }, { status: 400 });
    }

    await db.consulta.update({ where: { id }, data });
    await aplicarSideEffects(usuario, body.notificacoes, body.audit);

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

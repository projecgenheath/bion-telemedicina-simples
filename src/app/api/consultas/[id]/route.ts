import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { aplicarSideEffects, parseDataHora, parseValor, type NotifPayload, type AuditPayload } from "@/lib/server/dados";
import { criarCobranca, confirmarPagamento, falharPagamento } from "@/lib/server/pagamentos";
import { ok, falha } from "@/lib/server/http";

type Acao = "cancelar" | "concluir" | "remarcar" | "atualizar";

const STATUS_VALIDOS = ["pendente_anamnese", "confirmada", "em_espera", "concluida", "cancelada"];

/** Consulta em formato wire (mesma forma do carregarDados). */
async function consultaWire(id: string) {
  const c = await db.consulta.findUnique({
    where: { id },
    include: {
      medico: { select: { nome: true } },
      paciente: { select: { nome: true } },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    medicoId: c.medicoId,
    medico: c.medico.nome,
    pacienteId: c.pacienteId,
    paciente: c.paciente.nome,
    especialidade: c.especialidade,
    dataInicio: c.dataInicio.toISOString(),
    status: c.status,
    motivoConsulta: c.motivoConsulta ?? undefined,
    motivoCancelamento: c.motivoCancelamento ?? undefined,
    resumoMedico: c.resumoMedico ?? undefined,
    valor: c.valor,
    pago: c.pago,
    remarcada: c.remarcada || undefined,
  };
}

/**
 * Ações sobre uma consulta — regras e eventos determinados PELO SERVIDOR:
 * - cancelar (paciente dono, médico dono ou admin)
 * - concluir (médico dono ou admin)
 * - remarcar (paciente dono ou admin) — consulta pendente_anamnese CONTINUA
 *   pendente (a anamnese continua necessária); nunca auto-confirma.
 * - atualizar (admin): medicoId (nunca nome), status com whitelist,
 *   pagamento segue trilha do módulo de pagamentos.
 *
 * Contrato delta: devolve APENAS a consulta atualizada + efeitos gerados.
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
      medicoId?: string;
      especialidade?: string;
      status?: string;
      pago?: boolean;
      valor?: string | number;
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
    const eventos: NotifPayload[] = [];
    const audit: AuditPayload = { acao: "", categoria: "consulta", entidade: "consulta", entidadeId: id };
    const quando = consulta.dataInicio.toLocaleDateString("pt-BR") +
      " às " + consulta.dataInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    switch (body.acao) {
      case "cancelar": {
        data.status = "cancelada";
        data.motivoCancelamento = body.motivo?.trim() || "Não informado";
        const motivo = data.motivoCancelamento as string;
        const demais = [consulta.pacienteId, consulta.medicoId].filter((u) => u !== usuario.id);
        for (const destino of demais) {
          eventos.push({
            tipo: "agenda",
            titulo: "Consulta cancelada",
            texto: `${consulta.especialidade} de ${quando} foi cancelada. Motivo: ${motivo}`,
            usuarioId: destino,
          });
        }
        audit.acao = "CONSULTA_CANCELADA";
        audit.severidade = "warning";
        audit.detalhes = `Consulta ${consulta.especialidade} (${quando}) cancelada — Motivo: ${motivo}`;
        break;
      }
      case "concluir": {
        if (!ehDonoMedico && !ehAdmin) {
          return Response.json({ erro: "Apenas o médico pode concluir a consulta." }, { status: 403 });
        }
        data.status = "concluida";
        if (body.resumo !== undefined) data.resumoMedico = body.resumo;
        eventos.push({
          tipo: "agenda",
          titulo: "Consulta concluída",
          texto: `Atendimento de ${consulta.especialidade} (${quando}) finalizado. Acesse o resumo e documentos emitidos.`,
          usuarioId: consulta.pacienteId,
        });
        audit.acao = "CONSULTA_CONCLUIDA";
        audit.detalhes = `Consulta ${consulta.especialidade} (${quando}) concluída${body.resumo ? ` — Resumo: ${body.resumo.slice(0, 100)}` : ""}`;
        break;
      }
      case "remarcar": {
        if (!ehDonoPaciente && !ehAdmin) {
          return Response.json({ erro: "Apenas o paciente ou admin podem remarcar." }, { status: 403 });
        }
        if (!body.data || !body.hora) {
          return Response.json({ erro: "Informe a nova data e horário." }, { status: 400 });
        }
        data.dataInicio = parseDataHora(body.data, body.hora);
        // Regra de status no SERVIDOR: pendente_anamnese continua pendente
        // (a anamnese segue necessária); nunca auto-confirma.
        data.status = consulta.status === "pendente_anamnese" ? "pendente_anamnese" : "confirmada";
        data.remarcada = true;
        const novoQuando = data.dataInicio.toLocaleDateString("pt-BR") +
          " às " + data.dataInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        for (const destino of [consulta.pacienteId, consulta.medicoId]) {
          if (destino === usuario.id && !ehAdmin) continue;
          eventos.push({
            tipo: "agenda",
            titulo: "Consulta remarcada",
            texto: `${consulta.especialidade} remarcada para ${novoQuando}. A agenda foi atualizada.`,
            usuarioId: destino,
          });
        }
        audit.acao = "CONSULTA_REMARCADA";
        audit.severidade = "warning";
        audit.detalhes = `Consulta ${consulta.especialidade} remarcada para ${novoQuando} (status mantido: ${data.status})`;
        break;
      }
      case "atualizar": {
        if (!ehAdmin) {
          return Response.json({ erro: "Apenas administradores podem editar consultas." }, { status: 403 });
        }
        if (body.data && body.hora) data.dataInicio = parseDataHora(body.data, body.hora);
        if (body.medicoId) {
          const novoMedico = await db.user.findFirst({
            where: { id: body.medicoId, role: "MEDICO" },
          });
          if (!novoMedico) {
            return Response.json({ erro: "Médico não encontrado." }, { status: 400 });
          }
          data.medicoId = novoMedico.id;
        }
        if (body.especialidade) data.especialidade = body.especialidade;
        if (body.status) {
          if (!STATUS_VALIDOS.includes(body.status)) {
            return Response.json({ erro: "Status inválido." }, { status: 400 });
          }
          data.status = body.status;
        }
        if (body.valor !== undefined) data.valor = parseValor(body.valor);
        if (body.pago !== undefined) {
          if (body.pago) {
            // Trilha de pagamento: admin confirma pela mesma rota do gateway.
            const cobranca = await criarCobranca(consulta.id, consulta.valor, "pix");
            const p = await confirmarPagamento(cobranca.id, "simulado");
            if (p) data.pago = true;
          } else {
            const cobranca = await db.pagamento.findUnique({ where: { consultaId: consulta.id } });
            if (cobranca) await falharPagamento(cobranca.id, "simulado");
            data.pago = false;
          }
          audit.acao = "PAGAMENTO_ATUALIZADO_ADMIN";
          audit.categoria = "pagamento";
          audit.detalhes = `Pagamento da consulta ${consulta.id} definido como ${body.pago ? "pago" : "não pago"} pelo admin`;
        } else {
          audit.acao = "CONSULTA_ATUALIZADA";
          audit.detalhes = `Consulta ${consulta.id} atualizada pelo admin (campos: ${Object.keys(body).filter((k) => k !== "acao").join(", ")})`;
        }
        break;
      }
      default:
        return Response.json({ erro: "Ação inválida." }, { status: 400 });
    }

    await db.consulta.update({ where: { id }, data });
    const efeitos = await aplicarSideEffects(usuario, eventos, audit);
    const atualizada = await consultaWire(id);

    return ok({
      consulta: atualizada,
      ...(efeitos.notificacoes.length ? { notificacoes: efeitos.notificacoes } : {}),
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}

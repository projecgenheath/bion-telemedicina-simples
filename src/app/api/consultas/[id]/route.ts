import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import {
  aplicarSideEffects,
  consultaWire as consultaWireComum,
  includeFaltaWire,
  includePagamentoReembolsoWire,
  includeReservaVigente,
  parseDataHora,
  parseValor,
  type NotifPayload,
  type AuditPayload,
} from "@/lib/server/dados";
import { quandoClinica } from "@/lib/server/fuso";
import { diaBloqueado, ERRO_DIA_BLOQUEADO } from "@/lib/server/bloqueio-agenda";
import { criarCobranca, confirmarPagamento, falharPagamento } from "@/lib/server/pagamentos";
import { ok, falha } from "@/lib/server/http";
import {
  calcularMulta,
  cancelarReservasDoDia,
  cancelarReservasPendentes,
  criarReembolsoSeDevido,
  horarioReservado,
  reaisParaCentavos,
  registrarEvento,
  STATUS_LIBERAM_HORARIO,
  type MotivoEvento,
  type PorEvento,
  type TipoEvento,
  validarNovoHorario,
} from "@/lib/server/financeiro";

type Acao = "cancelar" | "concluir" | "remarcar" | "atualizar";

const STATUS_VALIDOS = [
  "pendente_anamnese",
  "confirmada",
  "em_espera",
  "aguardando_reagendamento",
  "concluida",
  "cancelada",
];

type EventoPendente = {
  tipo: TipoEvento;
  por: PorEvento;
  motivo: MotivoEvento;
  dataAnterior: Date;
  dataNova?: Date | null;
  multaCentavos?: number | null;
};
type ReembolsoPendente = { valorCentavos: number; multaCentavos: number; motivo: MotivoEvento };

/** Consulta em formato wire (mesma forma do carregarDados). */
async function consultaWire(id: string) {
  const c = await db.consulta.findUnique({
    where: { id },
    include: {
      medico: { select: { nome: true } },
      paciente: { select: { nome: true } },
      remarcacoes: includeReservaVigente(),
      eventos: includeFaltaWire,
      pagamento: includePagamentoReembolsoWire,
    },
  });
  return c ? consultaWireComum(c) : null;
}

/**
 * Ações sobre uma consulta — regras e eventos determinados PELO SERVIDOR:
 * - cancelar (paciente dono, médico dono ou admin). Fase financeira:
 *   · paciente: status "cancelada"; multa de 50% se faltar ≤24 h da data
 *     original (regra em financeiro.ts); se pagou, reembolso automático do
 *     valor menos a multa. Vindo de "aguardando_reagendamento": sem multa.
 *   · médico: consulta paga vai para "aguardando_reagendamento" (o paciente
 *     escolhe remarcar ou reembolso integral); não paga vai para "cancelada".
 *   · admin: "cancelada", sem multa, reembolso integral se pagou.
 * - concluir (médico dono ou admin)
 * - remarcar (paciente dono ou admin) — mantém o status: quem confirma a
 *   consulta é o pagamento; remarcar nunca confirma nem desconfirma.
 *   Exceção: vinda de "aguardando_reagendamento" (médico cancelou o dia ou
 *   falha técnica), volta para "confirmada" se estiver paga, sem multa.
 *   Paciente remarcando a ≤24 h da data original: multa registrada no evento.
 * Toda mudança de data/cancelamento grava um EventoConsulta na MESMA
 * transação da Consulta.
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
      /** Médico: true quando o cancelamento faz parte de "cancelar agenda do dia". */
      cancelarDia?: boolean;
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
    const quando = quandoClinica(consulta.dataInicio);
    const por: PorEvento = ehAdmin ? "admin" : ehDonoMedico ? "medico" : "paciente";
    let evento: EventoPendente | null = null;
    let reembolso: ReembolsoPendente | null = null;
    const eventosAnteriores = () =>
      db.eventoConsulta.findMany({ where: { consultaId: id }, select: { por: true, em: true, dataAnterior: true, motivo: true } });

    switch (body.acao) {
      case "cancelar": {
        if (consulta.status === "cancelada" || consulta.status === "concluida") {
          return Response.json({ erro: "Esta consulta já foi encerrada." }, { status: 409 });
        }
        const valorCentavos = reaisParaCentavos(consulta.valor);
        if (por === "medico") {
          data.status = consulta.pago ? "aguardando_reagendamento" : "cancelada";
          evento = { tipo: "cancelada", por, motivo: "agenda_cancelada", dataAnterior: consulta.dataInicio, multaCentavos: 0 };
        } else if (por === "admin") {
          data.status = "cancelada";
          evento = { tipo: "cancelada", por, motivo: "admin", dataAnterior: consulta.dataInicio, multaCentavos: 0 };
          if (consulta.pago) reembolso = { valorCentavos, multaCentavos: 0, motivo: "admin" };
        } else {
          const previa = calcularMulta({ consulta, eventos: await eventosAnteriores(), por });
          data.status = "cancelada";
          evento = {
            tipo: "cancelada",
            por,
            motivo: "pedido_paciente",
            dataAnterior: consulta.dataInicio,
            multaCentavos: previa.multaCentavos,
          };
          if (consulta.pago) {
            reembolso = { valorCentavos: previa.reembolsoCentavos, multaCentavos: previa.multaCentavos, motivo: "pedido_paciente" };
          }
        }
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
        const horario = await validarNovoHorario(consulta, body.data, body.hora);
        if (!horario.ok) return Response.json({ erro: horario.erro }, { status: horario.status });
        data.dataInicio = horario.dataInicio;
        // Regra de status no SERVIDOR: remarcar NÃO altera confirmação —
        // quem confirma é o pagamento (confirmarPagamento). Legado
        // "pendente_anamnese" permanece até a trilha de pagamento resolver.
        data.remarcada = true;
        if (consulta.status === "cancelada" || consulta.status === "concluida") {
          return Response.json({ erro: "Esta consulta já foi encerrada." }, { status: 409 });
        }
        const vindoDeReagendamento = consulta.status === "aguardando_reagendamento";
        if (vindoDeReagendamento) data.status = "confirmada";
        const multaRemarcar =
          por === "paciente"
            ? calcularMulta({ consulta, eventos: await eventosAnteriores(), por }).multaCentavos
            : 0;
        // Multa > 0: a nova data só vale depois de a multa ser paga
        // (POST /api/consultas/[id]/remarcacao). Aqui nunca muda sem pagar.
        if (multaRemarcar > 0) {
          return Response.json(
            {
              erro: "Remarcar faltando 24 h ou menos tem multa: pague a multa para confirmar a nova data.",
              multaCentavos: multaRemarcar,
              usar: "remarcacao",
            },
            { status: 402 },
          );
        }
        evento = {
          tipo: "remarcada",
          por,
          motivo:
            por === "admin"
              ? "admin"
              : consulta.status === "aguardando_reagendamento"
                ? "reagendamento"
                : "pedido_paciente",
          dataAnterior: consulta.dataInicio,
          dataNova: data.dataInicio,
          multaCentavos: multaRemarcar,
        };
        const novoQuando = quandoClinica(data.dataInicio);
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
        audit.detalhes = `Consulta ${consulta.especialidade} remarcada para ${novoQuando} (status ${vindoDeReagendamento ? "aguardando_reagendamento → confirmada" : `mantido: ${consulta.status}`})${multaRemarcar ? ` — multa registrada: R$ ${(multaRemarcar / 100).toFixed(2)}` : ""}`;
        break;
      }
      case "atualizar": {
        if (!ehAdmin) {
          return Response.json({ erro: "Apenas administradores podem editar consultas." }, { status: 403 });
        }
        if (body.data && body.hora) {
          data.dataInicio = parseDataHora(body.data, body.hora);
          if (data.dataInicio.getTime() !== consulta.dataInicio.getTime()) {
            evento = { tipo: "remarcada", por: "admin", motivo: "admin", dataAnterior: consulta.dataInicio, dataNova: data.dataInicio, multaCentavos: 0 };
          }
        }
        if (body.medicoId) {
          const novoMedico = await db.user.findFirst({
            where: { id: body.medicoId, role: "MEDICO" },
          });
          if (!novoMedico) {
            return Response.json({ erro: "Médico não encontrado." }, { status: 400 });
          }
          data.medicoId = novoMedico.id;
        }
        if (data.dataInicio && Number.isNaN((data.dataInicio as Date).getTime())) {
          return Response.json({ erro: "Data ou horário inválido." }, { status: 400 });
        }
        if (body.status && !STATUS_VALIDOS.includes(body.status)) {
          return Response.json({ erro: "Status inválido." }, { status: 400 });
        }
        // Agenda da combinação RESULTANTE (médico + horário + status): confere
        // dia bloqueado, conflito do médico, conflito do paciente e reserva
        // vigente de outra consulta quando a data ou o médico mudam, ou quando
        // uma consulta que liberava o horário (cancelada/concluída/aguardando
        // reagendamento) volta a ocupá-lo. Cancelar nunca é barrado.
        {
          const novoInicio = (data.dataInicio as Date | undefined) ?? consulta.dataInicio;
          const novoMedicoId = (data.medicoId as string | undefined) ?? consulta.medicoId;
          const novoStatus = body.status ?? consulta.status;
          const mudou = novoInicio.getTime() !== consulta.dataInicio.getTime() || novoMedicoId !== consulta.medicoId;
          const voltaAOcupar =
            STATUS_LIBERAM_HORARIO.includes(consulta.status) && !STATUS_LIBERAM_HORARIO.includes(novoStatus);
          const vaiOcupar = !STATUS_LIBERAM_HORARIO.includes(novoStatus);
          if (vaiOcupar && (mudou || voltaAOcupar)) {
            if (await diaBloqueado(db, novoMedicoId, novoInicio)) {
              return Response.json({ erro: ERRO_DIA_BLOQUEADO }, { status: 409 });
            }
            const [choqueMedico, choquePaciente, reservado] = await Promise.all([
              db.consulta.findFirst({
                where: { id: { not: id }, medicoId: novoMedicoId, dataInicio: novoInicio, status: { notIn: STATUS_LIBERAM_HORARIO } },
                select: { id: true },
              }),
              db.consulta.findFirst({
                where: { id: { not: id }, pacienteId: consulta.pacienteId, dataInicio: novoInicio, status: { notIn: STATUS_LIBERAM_HORARIO } },
                select: { id: true },
              }),
              horarioReservado(novoMedicoId, novoInicio, id),
            ]);
            if (choqueMedico || reservado) {
              return Response.json({ erro: "Esse horário já está ocupado na agenda do médico." }, { status: 409 });
            }
            if (choquePaciente) {
              return Response.json({ erro: "O paciente já tem outra consulta nesse horário." }, { status: 409 });
            }
          }
        }
        if (body.especialidade) data.especialidade = body.especialidade;
        if (body.status) {
          if (!STATUS_VALIDOS.includes(body.status)) {
            return Response.json({ erro: "Status inválido." }, { status: 400 });
          }
          data.status = body.status;
          if (body.status === "cancelada" && consulta.status !== "cancelada") {
            evento = { tipo: "cancelada", por: "admin", motivo: "admin", dataAnterior: consulta.dataInicio, multaCentavos: 0 };
          }
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

    const ev = evento as EventoPendente | null;
    const re = reembolso as ReembolsoPendente | null;
    await db.$transaction(async (tx) => {
      await tx.consulta.update({ where: { id }, data });
      if (ev) await registrarEvento(tx, { consultaId: id, atorId: usuario.id, ...ev });
      // Cancelamento (qualquer pessoa) ou mudança de data por outra via:
      // a reserva de remarcação paga perde a validade na mesma transação.
      if (data.status === "cancelada" || data.status === "aguardando_reagendamento" || ev?.tipo === "remarcada") {
        await cancelarReservasPendentes(tx, id);
      }
      if (por === "medico" && body.acao === "cancelar" && body.cancelarDia) {
        await cancelarReservasDoDia(tx, consulta.medicoId, consulta.dataInicio);
      }
      if (re) await criarReembolsoSeDevido(tx, { consultaId: id, solicitadoPor: usuario.id, ...re });
    });
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

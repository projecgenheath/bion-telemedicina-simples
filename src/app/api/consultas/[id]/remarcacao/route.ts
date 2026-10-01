import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { quandoClinica } from "@/lib/server/fuso";
import { modoGateway } from "@/lib/server/pagamentos";
import {
  RESERVA_REMARCACAO_MIN,
  aprovarMultaRemarcacao,
  calcularMulta,
  filtroReservaVigente,
  remarcacaoWire,
  validarNovoHorario,
} from "@/lib/server/financeiro";

/**
 * Remarcação do PACIENTE com multa (≤24 h da data de referência).
 *
 * POST   { data, hora, metodo? } → reserva o novo horário por
 *        RESERVA_REMARCACAO_MIN e cria a cobrança da multa. A nova data só
 *        vale depois do pagamento aprovado (webhook "multa.confirmada" ou, no
 *        modo simulado, na hora). Multa 0 → 409 (use o PATCH "remarcar").
 * GET    → estado da remarcação mais recente (polling enquanto "pendente").
 * DELETE → paciente desiste: reserva "cancelada", horário liberado.
 *
 * Acesso: paciente dono ou admin. A multa é recalculada no servidor com a
 * mesma regra da prévia (GET /api/consultas/[id]/cancelamento).
 */

async function carregar(id: string) {
  const usuario = await exigirSessao();
  const consulta = await db.consulta.findUnique({ where: { id } });
  if (!consulta) return { erro: Response.json({ erro: "Consulta não encontrada." }, { status: 404 }) } as const;
  const permitido = consulta.pacienteId === usuario.id || usuario.role === "ADMIN";
  if (!permitido) return { erro: Response.json({ erro: "Acesso negado." }, { status: 403 }) } as const;
  return { usuario, consulta } as const;
}

function cobrancaWire(r: { id: string; multaCentavos: number; metodo: string; status: string; via: string | null }) {
  // Mesmo formato do pagamento da consulta, em centavos.
  return { id: r.id, valorCentavos: r.multaCentavos, metodo: r.metodo, status: r.status, via: r.via ?? modoGateway() };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await carregar(id);
    if ("erro" in ctx) return ctx.erro;
    const r = await db.remarcacaoPendente.findFirst({ where: { consultaId: id }, orderBy: { criadoEm: "desc" } });
    return ok({ remarcacao: r ? remarcacaoWire(r) : null });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await carregar(id);
    if ("erro" in ctx) return ctx.erro;
    const { usuario, consulta } = ctx;
    const body = (await req.json()) as { data?: string; hora?: string; metodo?: string };

    if (consulta.status === "cancelada" || consulta.status === "concluida") {
      return Response.json({ erro: "Esta consulta já foi encerrada." }, { status: 409 });
    }
    const jaPendente = await db.remarcacaoPendente.findFirst({ where: { consultaId: id, ...filtroReservaVigente() } });
    if (jaPendente) {
      return Response.json(
        { erro: "Já existe uma remarcação aguardando pagamento.", remarcacao: remarcacaoWire(jaPendente) },
        { status: 409 },
      );
    }

    const eventos = await db.eventoConsulta.findMany({
      where: { consultaId: id },
      select: { por: true, em: true, dataAnterior: true, motivo: true },
    });
    const previa = calcularMulta({ consulta, eventos, por: "paciente" });
    if (previa.multaCentavos <= 0) {
      return Response.json({ erro: "Esta remarcação não tem multa: use a remarcação normal.", usar: "remarcar" }, { status: 409 });
    }

    const horario = await validarNovoHorario(consulta, body.data, body.hora);
    if (!horario.ok) return Response.json({ erro: horario.erro }, { status: horario.status });

    // Pendentes já expiradas não seguram o índice único parcial.
    await db.remarcacaoPendente.updateMany({
      where: { consultaId: id, status: "pendente", expiraEm: { lte: new Date() } },
      data: { status: "expirada" },
    });
    const criada = await db.remarcacaoPendente
      .create({
      data: {
        consultaId: id,
        novaData: horario.dataInicio,
        multaCentavos: previa.multaCentavos,
        metodo: body.metodo === "cartao" ? "cartao" : "pix",
        solicitadoPor: usuario.id,
        expiraEm: new Date(Date.now() + RESERVA_REMARCACAO_MIN * 60_000),
      },
      })
      .catch((e: unknown) => {
        // Clique duplo: o índice único parcial barra a 2ª pendente.
        if ((e as { code?: string }).code === "P2002") return null;
        throw e;
      });
    if (!criada) {
      return Response.json({ erro: "Já existe uma remarcação aguardando pagamento." }, { status: 409 });
    }

    await registrarAudit(usuario, {
      acao: "REMARCACAO_MULTA_INICIADA",
      categoria: "pagamento",
      severidade: "info",
      entidade: "consulta",
      entidadeId: id,
      detalhes: `Remarcação para ${quandoClinica(horario.dataInicio)} aguardando multa de R$ ${(previa.multaCentavos / 100).toFixed(2)}`,
    });

    let final = criada;
    if (modoGateway() === "simulado") {
      // Demonstração: o servidor confirma a multa na hora (nunca o navegador).
      const res = await aprovarMultaRemarcacao(criada.id, "simulado");
      if (res) final = res.remarcacao;
    }

    return ok({ remarcacao: remarcacaoWire(final), cobranca: cobrancaWire(final) });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await carregar(id);
    if ("erro" in ctx) return ctx.erro;
    await db.remarcacaoPendente.updateMany({ where: { consultaId: id, status: "pendente" }, data: { status: "cancelada" } });
    const r = await db.remarcacaoPendente.findFirst({ where: { consultaId: id }, orderBy: { criadoEm: "desc" } });
    return ok({ remarcacao: r ? remarcacaoWire(r) : null });
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import {
  bloquearDiaTravado,
  dateParaDiaIso,
  diaParaDate,
  hojeSaoPaulo,
  limparMotivo,
  MAX_BLOQUEIOS_FUTUROS,
  OPCOES_TX_TRAVA,
  travarDiaIso,
  validarDiaBloqueio,
} from "@/lib/server/bloqueio-agenda";
import { cancelarConsultasDoDia, contarAfetadosDoDia } from "@/lib/server/agenda-dia";
import { fmtDataClinica } from "@/lib/server/fuso";
import { ok, falha } from "@/lib/server/http";

const CORPO_MAX = 2000;

/**
 * Dias inteiros bloqueados na agenda do PRÓPRIO médico (folga/férias).
 * Só MEDICO; o médico vem SEMPRE da sessão (nunca do corpo/query).
 *
 * GET    → { bloqueios: [{ dia: "AAAA-MM-DD", motivo, criadoEm }] } (hoje em diante, São Paulo)
 * POST   { dia, motivo?, cancelarConsultas? }
 *        → grava o bloqueio (idempotente) e, se o dia tiver consultas/reservas,
 *          cancela-as como o cancelamento pelo médico (exige cancelarConsultas: true;
 *          sem ele → 409 { erro, consultas, reservas } e nada é gravado).
 * DELETE ?dia=AAAA-MM-DD → remove o bloqueio (hoje ou depois). Não restaura consultas.
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    const rows = await db.bloqueioAgenda.findMany({
      where: { medicoId: medico.id, dia: { gte: diaParaDate(hojeSaoPaulo()) } },
      orderBy: { dia: "asc" },
      select: { dia: true, motivo: true, criadoEm: true },
    });
    return ok({
      bloqueios: rows.map((r) => ({ dia: dateParaDiaIso(r.dia), motivo: r.motivo, criadoEm: r.criadoEm.toISOString() })),
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function POST(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const texto = await req.text();
    if (texto.length > CORPO_MAX) return Response.json({ erro: "Requisição muito grande." }, { status: 413 });
    let body: { dia?: unknown; motivo?: unknown; cancelarConsultas?: unknown };
    try {
      const v: unknown = JSON.parse(texto || "{}");
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
      body = v as typeof body;
    } catch {
      return Response.json({ erro: "JSON inválido." }, { status: 400 });
    }

    const agora = new Date();
    const dia = validarDiaBloqueio(body.dia, agora);
    if (!dia.ok) return Response.json({ erro: dia.erro }, { status: 400 });
    const motivo = limparMotivo(body.motivo);
    if (!motivo.ok) return Response.json({ erro: motivo.erro }, { status: 400 });
    if (body.cancelarConsultas !== undefined && typeof body.cancelarConsultas !== "boolean") {
      return Response.json({ erro: "cancelarConsultas deve ser verdadeiro ou falso." }, { status: 400 });
    }
    const { dia: iso, meioDia } = dia.valor;
    const cancelarConsultas = body.cancelarConsultas === true;

    // Uma transação com a trava (médico, dia): POST /api/consultas toma a
    // mesma trava, então nenhum agendamento passa pela checagem do bloqueio e
    // termina depois dele. Bloqueio + cancelamentos: tudo ou nada.
    const resultado = await db.$transaction(
      (tx) =>
        bloquearDiaTravado(
          tx,
          { medicoId: medico.id, dia: iso, motivo: motivo.valor, cancelarConsultas, agora },
          {
            contar: (t) => contarAfetadosDoDia(t, medico.id, meioDia, agora),
            // Mesmo caminho do cancelamento do dia (statuses, evento
            // cancelada/agenda_cancelada, reservas, notificações).
            cancelar: (t) => cancelarConsultasDoDia(medico.id, meioDia, new Date(), t),
          },
        ),
      OPCOES_TX_TRAVA,
    );
    if (resultado.tipo === "limite") {
      return Response.json(
        { erro: `Limite de ${MAX_BLOQUEIOS_FUTUROS} dias bloqueados atingido. Desbloqueie algum dia antes.` },
        { status: 409 },
      );
    }
    if (resultado.tipo === "confirmar") {
      return Response.json(
        {
          erro: "Este dia tem consultas ou reservas. Confirme o cancelamento para bloquear o dia.",
          consultas: resultado.consultas,
          reservas: resultado.reservas,
        },
        { status: 409 },
      );
    }
    const { bloqueio } = resultado;
    const r = resultado.cancelamento ?? { canceladas: 0, reservasLiberadas: 0, notificacoes: [] };

    const houveCancelamento = r.canceladas > 0 || r.reservasLiberadas > 0;
    const efeitos = await aplicarSideEffects(medico, r.notificacoes, {
      acao: "AGENDA_DIA_BLOQUEADO",
      categoria: "consulta",
      severidade: houveCancelamento ? "warning" : "info",
      entidade: "medico",
      entidadeId: medico.id,
      detalhes: `Dia ${fmtDataClinica(meioDia)} bloqueado pelo médico — ${r.canceladas} consulta(s) cancelada(s), ${r.reservasLiberadas} reserva(s) liberada(s)${
        resultado.apareceuDepois ? " (entraram durante o bloqueio)" : ""
      }`,
    });

    return ok({
      bloqueio: { dia: dateParaDiaIso(bloqueio.dia), motivo: bloqueio.motivo, criadoEm: bloqueio.criadoEm.toISOString() },
      canceladas: r.canceladas,
      reservasLiberadas: r.reservasLiberadas,
      ...(efeitos.audit ? { audit: efeitos.audit } : {}),
    });
  } catch (erro) {
    return falha(erro);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const medico = await exigirPapel("MEDICO");
    const dia = validarDiaBloqueio(req.nextUrl.searchParams.get("dia"), new Date(), { horizonte: false });
    if (!dia.ok) return Response.json({ erro: dia.erro }, { status: 400 });
    // Mesma trava do bloqueio/agendamento: não intercala com um bloqueio em curso.
    const { count } = await db.$transaction(async (tx) => {
      await travarDiaIso(tx, medico.id, dia.valor.dia);
      return tx.bloqueioAgenda.deleteMany({ where: { medicoId: medico.id, dia: diaParaDate(dia.valor.dia) } });
    }, OPCOES_TX_TRAVA);
    if (!count) return Response.json({ erro: "Este dia não está bloqueado." }, { status: 404 });
    await registrarAudit(medico, {
      acao: "AGENDA_DIA_DESBLOQUEADO",
      categoria: "consulta",
      entidade: "medico",
      entidadeId: medico.id,
      detalhes: `Dia ${fmtDataClinica(dia.valor.meioDia)} desbloqueado pelo médico`,
    });
    return ok({ dia: dia.valor.dia, desbloqueado: true });
  } catch (erro) {
    return falha(erro);
  }
}

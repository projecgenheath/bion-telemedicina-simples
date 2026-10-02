import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { exigirPapel, registrarAudit } from "@/lib/server/auth";
import { aplicarSideEffects } from "@/lib/server/dados";
import {
  dateParaDiaIso,
  diaParaDate,
  hojeSaoPaulo,
  limparMotivo,
  MAX_BLOQUEIOS_FUTUROS,
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
    const diaDate = diaParaDate(iso);

    const existente = await db.bloqueioAgenda.findUnique({
      where: { medicoId_dia: { medicoId: medico.id, dia: diaDate } },
      select: { id: true },
    });
    if (!existente) {
      const futuros = await db.bloqueioAgenda.count({
        where: { medicoId: medico.id, dia: { gte: diaParaDate(hojeSaoPaulo(agora)) } },
      });
      if (futuros >= MAX_BLOQUEIOS_FUTUROS) {
        return Response.json(
          { erro: `Limite de ${MAX_BLOQUEIOS_FUTUROS} dias bloqueados atingido. Desbloqueie algum dia antes.` },
          { status: 409 },
        );
      }
    }

    const afetados = await contarAfetadosDoDia(medico.id, meioDia, agora);
    if ((afetados.consultas || afetados.reservas) && body.cancelarConsultas !== true) {
      return Response.json(
        {
          erro: "Este dia tem consultas ou reservas. Confirme o cancelamento para bloquear o dia.",
          consultas: afetados.consultas,
          reservas: afetados.reservas,
        },
        { status: 409 },
      );
    }

    // 1) Bloqueio PRIMEIRO (a partir daqui nenhum novo agendamento entra no dia).
    let bloqueio: { dia: Date; motivo: string; criadoEm: Date };
    try {
      bloqueio = await db.bloqueioAgenda.upsert({
        where: { medicoId_dia: { medicoId: medico.id, dia: diaDate } },
        create: { medicoId: medico.id, dia: diaDate, motivo: motivo.valor },
        update: { motivo: motivo.valor },
        select: { dia: true, motivo: true, criadoEm: true },
      });
    } catch (e) {
      // Corrida com outra requisição igual: o bloqueio já existe.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      bloqueio = await db.bloqueioAgenda.findUniqueOrThrow({
        where: { medicoId_dia: { medicoId: medico.id, dia: diaDate } },
        select: { dia: true, motivo: true, criadoEm: true },
      });
    }

    // 2) Cancela o que já estava marcado no dia (mesmo caminho do cancelamento pelo médico).
    const r = body.cancelarConsultas === true
      ? await cancelarConsultasDoDia(medico.id, meioDia, new Date())
      : { canceladas: 0, reservasLiberadas: 0, notificacoes: [] };

    const houveCancelamento = r.canceladas > 0 || r.reservasLiberadas > 0;
    const efeitos = await aplicarSideEffects(medico, r.notificacoes, {
      acao: "AGENDA_DIA_BLOQUEADO",
      categoria: "consulta",
      severidade: houveCancelamento ? "warning" : "info",
      entidade: "medico",
      entidadeId: medico.id,
      detalhes: `Dia ${fmtDataClinica(meioDia)} bloqueado pelo médico — ${r.canceladas} consulta(s) cancelada(s), ${r.reservasLiberadas} reserva(s) liberada(s)`,
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
    const { count } = await db.bloqueioAgenda.deleteMany({
      where: { medicoId: medico.id, dia: diaParaDate(dia.valor.dia) },
    });
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

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizarGrade } from "@/lib/grade-semana";
import { dateParaDiaIso, diaParaDate, hojeSaoPaulo, somarDiasIso } from "@/lib/server/bloqueio-agenda";
import { limitarAsync, obterIp, resposta429 } from "@/lib/server/rate-limit";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function diasDaSemana(bruto: string | null): number[] {
  try {
    const v = JSON.parse(bruto || "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6);
  } catch {
    return [];
  }
}

function pausas(bruto: string | null): { dia: number; inicio: string; fim: string }[] {
  try {
    const v = JSON.parse(bruto || "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v.flatMap((p) => {
      if (!p || typeof p !== "object") return [];
      const pa = p as { dia?: unknown; inicio?: unknown; fim?: unknown };
      if (typeof pa.dia !== "number" || pa.dia < 0 || pa.dia > 6) return [];
      if (typeof pa.inicio !== "string" || !HORA.test(pa.inicio)) return [];
      if (typeof pa.fim !== "string" || !HORA.test(pa.fim)) return [];
      return [{ dia: pa.dia, inicio: pa.inicio, fim: pa.fim }];
    });
  } catch {
    return [];
  }
}

/**
 * Agenda pública de UMA médica, para o botão Agendar do perfil /p/[id].
 * Devolve a grade, os dias bloqueados e os instantes já ocupados — sem
 * nome, sem prontuário e sem motivo do bloqueio. Quem monta os horários
 * livres é a mesma função do app do paciente (agendaLivreDoMedico).
 * A vaga de verdade continua sendo conferida na criação da consulta.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const teto = await limitarAsync(`publico-agenda:ip:${obterIp(req)}`, 60, 60_000);
    if (!teto.permitido) return resposta429(teto.restanteSeg);
    const { id } = await params;
    if (!id || id.length > 80) {
      return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
    }

    const perfil = await db.perfilMedico.findUnique({
      where: { userId: id },
      select: {
        userId: true,
        crm: true,
        especialidade: true,
        valor: true,
        status: true,
        horariosDisponiveis: true,
        diasAtendimento: true,
        pausasSemanais: true,
        user: { select: { id: true, nome: true, role: true, status: true } },
      },
    });

    if (!perfil || perfil.status !== "ativo" || perfil.user?.role !== "MEDICO" || perfil.user?.status !== "ativo") {
      return NextResponse.json({ erro: "Médico não encontrado" }, { status: 404 });
    }

    const hoje = hojeSaoPaulo();
    const ate = somarDiasIso(hoje, 14);
    const agora = new Date();
    const [bloqueios, ocupadas] = await Promise.all([
      db.bloqueioAgenda.findMany({
        where: { medicoId: id, dia: { gte: diaParaDate(hoje), lte: diaParaDate(ate) } },
        select: { dia: true },
      }),
      db.consulta.findMany({
        where: {
          medicoId: id,
          dataInicio: { gte: new Date(agora.getTime() - 60 * 60_000), lt: new Date(agora.getTime() + 15 * 24 * 60 * 60_000) },
          status: { notIn: ["cancelada", "concluida", "aguardando_reagendamento", "falta_paciente"] },
        },
        select: { dataInicio: true },
      }),
    ]);

    const grade = normalizarGrade(perfil.horariosDisponiveis);
    return NextResponse.json(
      {
        id: perfil.userId,
        nome: perfil.user.nome,
        especialidade: perfil.especialidade,
        crm: perfil.crm,
        valor: perfil.valor,
        horariosDisponiveis: grade.padrao,
        horariosPorDia: grade.dias,
        diasAtendimento: diasDaSemana(perfil.diasAtendimento),
        pausasSemanais: pausas(perfil.pausasSemanais),
        diasBloqueados: bloqueios.map((b) => dateParaDiaIso(b.dia)),
        ocupadosIso: ocupadas.map((c) => c.dataInicio.toISOString()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    console.error("[api/publico/medico/agenda] falha:", erro);
    return NextResponse.json({ erro: "Médico não encontrado" }, { status: 404 });
  }
}

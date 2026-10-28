import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { foraDoHorarioVedado, medicoLivreAgora, reaisParaCentavos } from "@/lib/server/medico-livre";
import { notaReal } from "@/lib/server/notas-medico";

/**
 * GET /api/medicos/livres-agora?especialidade=...&consultaId=...
 * Médicos livres agora (regra em lib/server/medico-livre.ts) da especialidade.
 * Com consultaId (do paciente da sessão, ou qualquer uma para ADMIN): a
 * especialidade padrão é a da consulta, o médico original fica de fora e
 * cada item traz diferencaCentavos = valorConsultaCentavos − valor original
 * (positiva: o paciente paga; negativa: recebe de volta). Sem consultaId,
 * diferencaCentavos = null. Inteiros, em centavos.
 * → { medicos: [{ id, nome, especialidade, foto, avaliacao, valorConsultaCentavos, diferencaCentavos }] }
 */
const LOTE = 5;

export async function GET(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const sp = req.nextUrl.searchParams;
    const consultaId = sp.get("consultaId");
    let especialidade = sp.get("especialidade")?.trim() || null;
    let original: { medicoId: string; valorCentavos: number } | null = null;
    if (consultaId) {
      const c = await db.consulta.findFirst({
        where: { id: consultaId, ...(usuario.role === "ADMIN" ? {} : { pacienteId: usuario.id }) },
        select: { medicoId: true, valor: true, especialidade: true },
      });
      if (!c) return Response.json({ erro: "Consulta não encontrada." }, { status: 404 });
      original = { medicoId: c.medicoId, valorCentavos: reaisParaCentavos(c.valor) };
      especialidade ??= c.especialidade;
    }
    if (!especialidade) return Response.json({ erro: "Informe especialidade ou consultaId." }, { status: 400 });
    if (!foraDoHorarioVedado()) return ok({ medicos: [] });

    const candidatos = await db.perfilMedico.findMany({
      where: {
        especialidade,
        status: "ativo",
        user: { status: "ativo", role: "MEDICO" },
        ...(original ? { userId: { not: original.medicoId } } : {}),
      },
      select: { userId: true, especialidade: true, valor: true, foto: true, avaliacao: true, user: { select: { nome: true } } },
      take: 50,
    });
    const agora = new Date();
    // Concorrência limitada: lotes de 5 médicos (4 consultas cada).
    const livres: (typeof candidatos[number] | null)[] = [];
    for (let i = 0; i < candidatos.length; i += LOTE) {
      const lote = candidatos.slice(i, i + LOTE);
      livres.push(...(await Promise.all(lote.map(async (m) => ((await medicoLivreAgora(m.userId, undefined, agora, consultaId ?? undefined)) ? m : null)))));
    }
    // M-21 da auditoria: nota REAL (tabela avaliacao) — antes usava a coluna
    // de seed do perfil (valores fictícios), o que notas-medico proíbe.
    const livresFiltrados = livres.filter((m): m is NonNullable<typeof m> => m !== null);
    const notas = new Map(
      await Promise.all(livresFiltrados.map(async (m) => [m.userId, await notaReal(m.userId)] as const)),
    );
    return ok({
      medicos: livresFiltrados.map((m) => {
          const valorConsultaCentavos = reaisParaCentavos(m.valor);
          const nota = notas.get(m.userId) ?? { avaliacao: 0, numAvaliacoes: 0 };
          return {
            id: m.userId,
            nome: m.user.nome,
            especialidade: m.especialidade,
            foto: m.foto,
            avaliacao: nota.avaliacao,
            numAvaliacoes: nota.numAvaliacoes,
            valorConsultaCentavos,
            diferencaCentavos: original ? valorConsultaCentavos - original.valorCentavos : null,
          };
        }),
    });
  } catch (erro) {
    return falha(erro);
  }
}

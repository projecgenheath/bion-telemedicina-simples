import type { ApptStatus } from "@/lib/bion-tipos";
import { limitesDia } from "@/components/bion/admin/tempo";
import { JANELA_DIAS, TETO_JANELA, montarPainel, type LinhaPainel } from "@/lib/painel-forma";
import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { falha, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Início do dia civil (Brasília) de `dias` atrás, inclusive o dia de `agora`. */
function inicioDaJanela(agora: number, dias: number): number {
  let inicio = limitesDia(agora).inicio;
  for (let i = 0; i < dias - 1; i++) inicio = limitesDia(inicio - 1).inicio;
  return inicio;
}

/**
 * GET /api/admin/painel — números do Início fora do teto de 500 do bootstrap.
 * Consultas: janela de 30 dias. Pacientes: contagem do banco. Só ADMIN.
 */
export async function GET() {
  try {
    await exigirPapel("ADMIN");
    const agora = Date.now();
    const where = {
      dataInicio: { gte: new Date(inicioDaJanela(agora, JANELA_DIAS)), lt: new Date(limitesDia(agora).fim) },
    };
    const [totalJanela, rows, cadastrados, ativos] = await Promise.all([
      db.consulta.count({ where }),
      db.consulta.findMany({
        where,
        take: TETO_JANELA,
        orderBy: { dataInicio: "asc" },
        select: {
          id: true,
          especialidade: true,
          dataInicio: true,
          status: true,
          valor: true,
          pago: true,
          medico: { select: { nome: true } },
          paciente: { select: { nome: true } },
        },
      }),
      db.user.count({ where: { role: "PACIENTE" } }),
      db.user.count({ where: { role: "PACIENTE", status: "ativo" } }),
    ]);
    const linhas: LinhaPainel[] = rows.map((c) => ({
      id: c.id,
      medico: c.medico.nome,
      paciente: c.paciente.nome,
      especialidade: c.especialidade,
      status: c.status as ApptStatus,
      dataInicio: c.dataInicio.toISOString(),
      pago: c.pago,
      valorReais: c.valor,
    }));
    return ok(montarPainel(linhas, agora, { cadastrados, ativos }, totalJanela <= linhas.length));
  } catch (erro) {
    return falha(erro);
  }
}

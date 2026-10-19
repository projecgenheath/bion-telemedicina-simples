import "server-only";
import { db } from "@/lib/db";
import { SALA_ABRE_ANTES_MIN, SALA_FECHA_DEPOIS_MIN } from "@/lib/janela-sala";
import { cruzarEvolucaoPendente, PACIENTE_PRESENTE_MS, type EvolucaoAberta, type EvolucaoPendenteItem } from "@/lib/evolucao-pendente";

/**
 * Lista para a Fila do Admin. A tabela "Evolucao" é do Médicos (migração
 * 20261018b) e pode ainda não existir: confere com to_regclass e, sem ela,
 * responde `disponivel: false` (nunca quebra a Fila). Lê via SQL cru porque o
 * model ainda não está no schema.prisma da main. Só leitura.
 */
export async function evolucaoTabelaExiste(): Promise<boolean> {
  const r = await db.$queryRaw<{ existe: boolean }[]>`SELECT to_regclass('public."Evolucao"') IS NOT NULL AS existe`;
  return Boolean(r[0]?.existe);
}

export async function listarEvolucaoPendente(agora: Date = new Date()): Promise<{ disponivel: boolean; consultas: EvolucaoPendenteItem[] }> {
  if (!(await evolucaoTabelaExiste())) return { disponivel: false, consultas: [] };
  const t = agora.getTime();
  const esperando = await db.consulta.findMany({
    where: {
      status: { in: ["confirmada", "em_espera", "pendente_anamnese"] },
      dataInicio: { gte: new Date(t - SALA_FECHA_DEPOIS_MIN * 60_000), lte: new Date(t + SALA_ABRE_ANTES_MIN * 60_000) },
      presencasSala: { some: { papel: "PACIENTE", ultimoPing: { gte: new Date(t - PACIENTE_PRESENTE_MS) } } },
    },
    take: 200,
    select: {
      id: true, medicoId: true, especialidade: true, dataInicio: true, status: true, pacienteId: true,
      paciente: { select: { nome: true } },
      medico: { select: { nome: true } },
      presencasSala: { where: { papel: "PACIENTE" }, select: { usuarioId: true, ultimoPing: true, entrouEm: true } },
    },
  });
  if (!esperando.length) return { disponivel: true, consultas: [] };
  const medicos = [...new Set(esperando.map((c) => c.medicoId))];
  const evolucoes = await db.$queryRaw<EvolucaoAberta[]>`
    SELECT e."consultaId", e."medicoId", e.status, c."dataInicio", c.status AS "consultaStatus", u.nome AS paciente
    FROM "Evolucao" e
    JOIN "Consulta" c ON c.id = e."consultaId"
    JOIN "User" u ON u.id = c."pacienteId"
    WHERE e.status IN ('rascunho', 'pendente') AND e."medicoId" = ANY(${medicos}::text[])`;
  const consultas = cruzarEvolucaoPendente(
    esperando.map((c) => {
      const p = c.presencasSala.filter((x) => x.usuarioId === c.pacienteId);
      return {
        id: c.id, medicoId: c.medicoId, medico: c.medico.nome, paciente: c.paciente.nome, especialidade: c.especialidade,
        dataInicio: c.dataInicio, status: c.status, pingsPaciente: p.map((x) => x.ultimoPing),
        entrouEm: p.map((x) => x.entrouEm).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
      };
    }),
    evolucoes,
    agora,
  );
  return { disponivel: true, consultas };
}

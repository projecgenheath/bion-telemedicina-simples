import "server-only";
import { db } from "@/lib/db";
import { SALA_ABRE_ANTES_MIN, SALA_FECHA_DEPOIS_MIN } from "@/lib/janela-sala";
import { cruzarEvolucaoPendente, STATUS_EVOLUCAO_PENDENTE, PACIENTE_PRESENTE_MS, type EvolucaoAberta, type EvolucaoPendenteItem } from "@/lib/evolucao-pendente";

/**
 * Lista para a Fila do Admin. Lê o model `Evolucao` da main (status
 * "rascunho" | "concluida") com o mesmo critério da trava de
 * `medicoLivreAgora`. `disponivel` fica sempre true (mantido no contrato da
 * rota). Só leitura.
 */

export async function listarEvolucaoPendente(agora: Date = new Date()): Promise<{ disponivel: boolean; consultas: EvolucaoPendenteItem[] }> {
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
  const abertas = await db.evolucao.findMany({
    where: { status: { in: [...STATUS_EVOLUCAO_PENDENTE] }, medicoId: { in: medicos } },
    take: 500,
    select: { consultaId: true, medicoId: true, status: true, consulta: { select: { dataInicio: true, status: true } }, paciente: { select: { nome: true } } },
  });
  const evolucoes: EvolucaoAberta[] = abertas.map((e) => ({
    consultaId: e.consultaId, medicoId: e.medicoId, status: e.status, paciente: e.paciente.nome,
    dataInicio: e.consulta.dataInicio, consultaStatus: e.consulta.status,
  }));
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

import { db } from "@/lib/db";
import { chaveMedicamento, dividirMedicamentosLegado } from "@/lib/saude-paciente";

/** Marca de concorrência: outro import já limpou o campo; a transação é desfeita. */
class ImportacaoConcorrente extends Error {}

/**
 * Importação preguiçosa e idempotente do campo antigo PerfilPaciente.medicamentos
 * para MedicamentoEmUso (origem "paciente"). Na mesma transação cria as linhas e
 * limpa o campo para "[]" — os nomes passam a existir só na lista nova, então
 * não há perda. A limpeza é condicional ao valor lido (updateMany), então duas
 * requisições simultâneas não importam duas vezes. Sem conteúdo, não escreve nada.
 */
export async function importarMedicamentosLegado(pacienteId: string): Promise<{ importados: number; descartados: number }> {
  const perfil = await db.perfilPaciente.findUnique({ where: { userId: pacienteId }, select: { medicamentos: true } });
  const bruto = perfil?.medicamentos ?? "";
  if (dividirMedicamentosLegado(bruto).length === 0) {
    // Vazio, "[]" ou só itens inválidos: nada a importar e nenhuma escrita.
    return { importados: 0, descartados: 0 };
  }
  try {
    return await db.$transaction(async (tx) => {
      const existentes = await tx.medicamentoEmUso.findMany({ where: { pacienteId }, select: { nome: true } });
      const todos = dividirMedicamentosLegado(bruto);
      const novos = dividirMedicamentosLegado(bruto, existentes.map((e) => e.nome));
      const limpo = await tx.perfilPaciente.updateMany({
        where: { userId: pacienteId, medicamentos: bruto },
        data: { medicamentos: "[]" },
      });
      if (limpo.count !== 1) throw new ImportacaoConcorrente();
      if (novos.length) {
        await tx.medicamentoEmUso.createMany({
          data: novos.map((nome) => ({ pacienteId, nome, origem: "paciente", controlado: false, usoContinuo: false })),
        });
      }
      return { importados: novos.length, descartados: todos.length - novos.length };
    });
  } catch (e) {
    if (e instanceof ImportacaoConcorrente) return { importados: 0, descartados: 0 };
    throw e;
  }
}

/**
 * Nomes dos medicamentos em uso para contexto (IA, anamnese): os ativos da lista
 * nova mais o que ainda estiver no campo antigo (antes do import), sem repetir.
 */
export async function nomesMedicamentosEmUso(pacienteId: string, legado?: string | null): Promise<string[]> {
  const ativos = await db.medicamentoEmUso.findMany({
    where: { pacienteId, ativo: true },
    orderBy: { inicio: "desc" },
    take: 50,
    select: { nome: true },
  });
  const nomes: string[] = [];
  const vistos = new Set<string>();
  for (const n of [...ativos.map((a) => a.nome), ...dividirMedicamentosLegado(legado)]) {
    const k = chaveMedicamento(n);
    if (!vistos.has(k)) {
      vistos.add(k);
      nomes.push(n);
    }
  }
  return nomes;
}

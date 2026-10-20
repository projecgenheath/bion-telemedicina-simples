import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { evolucaoPendenteDoMedico } from "@/lib/server/evolucao";

/**
 * GET /api/medico/evolucao-pendente — SOMENTE LEITURA.
 * → { pendente: null | { evolucaoId, consultaId, paciente } } para a tela do
 * médico avisar "Conclua a evolução de Fulano para atender o próximo".
 */
export async function GET() {
  try {
    const medico = await exigirPapel("MEDICO");
    return ok({ pendente: await evolucaoPendenteDoMedico(medico.id) });
  } catch (erro) {
    return falha(erro);
  }
}

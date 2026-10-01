import { exigirSessao } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import { verificarPresencasDoMedicoSemFalhar } from "@/lib/server/presenca-consulta";

/** Bootstrap: carrega todo o estado visível do usuário autenticado. */
export async function GET() {
  try {
    const usuario = await exigirSessao();
    // Médico: grava falta do paciente / falha técnica das consultas passadas
    // (pela presença na sala) antes de carregar. Nunca lança.
    if (usuario.role === "MEDICO") await verificarPresencasDoMedicoSemFalhar(usuario.id);
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

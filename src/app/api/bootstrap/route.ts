import { exigirSessao } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";
import {
  verificarPresencasDoMedicoSemFalhar,
  verificarPresencasDoPacienteSemFalhar,
} from "@/lib/server/presenca-consulta";

/** Bootstrap: carrega todo o estado visível do usuário autenticado. */
export async function GET() {
  try {
    const usuario = await exigirSessao();
    // Médico ou paciente: grava falta do paciente / falha técnica das
    // consultas passadas (pela presença na sala) ANTES de carregar, para a
    // resposta já trazer o desfecho. Nunca lança.
    if (usuario.role === "MEDICO") await verificarPresencasDoMedicoSemFalhar(usuario.id);
    else if (usuario.role === "PACIENTE") await verificarPresencasDoPacienteSemFalhar(usuario.id);
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

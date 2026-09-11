import { exigirSessao } from "@/lib/server/auth";
import { carregarDados } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/** Bootstrap: carrega todo o estado visível do usuário autenticado. */
export async function GET() {
  try {
    const usuario = await exigirSessao();
    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

import { registrarAudit, destruirSessao, getSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";

export async function POST() {
  try {
    const sessao = await getSessao();
    if (sessao) {
      await registrarAudit(sessao, {
        acao: "LOGOUT",
        categoria: "autenticacao",
        detalhes: "Sessão encerrada pelo usuário",
      });
    }
    await destruirSessao();
    return ok({ ok: true });
  } catch (erro) {
    return falha(erro);
  }
}

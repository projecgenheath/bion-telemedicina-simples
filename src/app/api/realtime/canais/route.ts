import { exigirSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { topicoMensagensUsuario, topicoNotificacoesUsuario } from "@/lib/server/usuario-canal";

/**
 * GET /api/realtime/canais — tópicos Realtime PRIVADOS do usuário logado
 * (mensagens e notificações dirigidas). Só devolve os do próprio usuário;
 * o navegador assina com `config: { private: true }` + setAuth, e a policy
 * RLS de realtime.messages (20261013a_canais_usuario_privados.sql) confere
 * que auth.uid() é o dono do canal.
 */
export async function GET() {
  try {
    const usuario = await exigirSessao();
    return ok({
      mensagens: topicoMensagensUsuario(usuario.id),
      notificacoes: topicoNotificacoesUsuario(usuario.id),
    });
  } catch (erro) {
    return falha(erro);
  }
}

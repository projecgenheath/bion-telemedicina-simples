import { db } from "@/lib/db";
import { registrarAudit, destruirSessao, getSessao } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { validarEndpoint } from "@/lib/server/web-push";

/** `endpoint` opcional no corpo (JSON): a inscrição de push DESTE aparelho, para não tocar depois do logout. */
async function endpointDoCorpo(req: Request): Promise<string | null> {
  try {
    const texto = await req.text();
    if (!texto || texto.length > 4_096) return null;
    return validarEndpoint((JSON.parse(texto) as { endpoint?: unknown } | null)?.endpoint);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const sessao = await getSessao();
    if (sessao) {
      await registrarAudit(sessao, {
        acao: "LOGOUT",
        categoria: "autenticacao",
        detalhes: "Sessão encerrada pelo usuário",
      });
      const endpoint = await endpointDoCorpo(req);
      if (endpoint) {
        // Só a inscrição do próprio usuário; falha aqui não impede o logout.
        await db.pushInscricao.deleteMany({ where: { endpoint, usuarioId: sessao.id } }).catch(() => undefined);
      }
    }
    await destruirSessao();
    return ok({ ok: true });
  } catch (erro) {
    return falha(erro);
  }
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exigirSessao, registrarAudit } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { limitar, resposta429 } from "@/lib/server/rate-limit";
import { configVapid, validarEndpoint, validarInscricao } from "@/lib/server/web-push";

export const dynamic = "force-dynamic";

const MAX_CORPO = 4_096;

async function lerCorpo(req: NextRequest): Promise<unknown> {
  const texto = await req.text().catch(() => "");
  if (texto.length > MAX_CORPO) {
    const e = new Error("Corpo grande demais.") as Error & { status?: number };
    e.status = 413;
    throw e;
  }
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/push/inscricao — chave pública VAPID para o navegador assinar o
 * push (`applicationServerKey`). Pública por definição; `ativo: false` quando
 * o servidor está sem as envs VAPID (o app não pede permissão).
 */
export async function GET() {
  const cfg = configVapid();
  return ok({ ativo: cfg !== null, chavePublica: cfg?.publica ?? null });
}

/**
 * POST /api/push/inscricao  { endpoint, keys: { p256dh, auth }, plataforma? }
 * Exige login. Upsert por `endpoint`: num aparelho compartilhado (outra conta
 * entrou no mesmo navegador) a inscrição passa para o usuário atual, senão o
 * toque de um iria para o outro.
 */
export async function POST(req: NextRequest) {
  try {
    const s = await exigirSessao();
    const lim = limitar(`push-inscricao:${s.id}`, 20, 60_000);
    if (!lim.permitido) return resposta429(lim.restanteSeg);
    const v = validarInscricao(await lerCorpo(req));
    if (!v.ok) return Response.json({ erro: v.erro }, { status: 400 });
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300) || null;
    const dados = { usuarioId: s.id, p256dh: v.p256dh, auth: v.auth, plataforma: v.plataforma, userAgent, falhas: 0 };
    // B10: se o endpoint já pertencia a OUTRO usuário, o upsert transfere o
    // dono silenciosamente (aparelho compartilhado) — a vítima para de
    // receber pushes sem deixar rastro. Agora a transferência é auditada
    // (sem gravar o endpoint, que é credencial de envio).
    const anterior = await db.pushInscricao.findUnique({
      where: { endpoint: v.endpoint },
      select: { usuarioId: true },
    });
    await db.pushInscricao.upsert({
      where: { endpoint: v.endpoint },
      create: { endpoint: v.endpoint, ...dados },
      update: dados,
    });
    if (anterior && anterior.usuarioId !== s.id) {
      await registrarAudit(s, {
        acao: "PUSH_INSCRICAO_DONO_TRANSFERIDO",
        categoria: "sistema",
        severidade: "warning",
        entidade: "push_inscricao",
        detalhes: `Inscrição push transferida do usuário ${anterior.usuarioId} para ${s.id} (mesmo endpoint/aparelho)`,
      });
    }
    return ok({ ok: true });
  } catch (erro) {
    return falha(erro);
  }
}

/** DELETE /api/push/inscricao { endpoint } — apaga só se a inscrição for do usuário logado. */
export async function DELETE(req: NextRequest) {
  try {
    const s = await exigirSessao();
    const corpo = (await lerCorpo(req)) as { endpoint?: unknown } | null;
    const endpoint = validarEndpoint(corpo?.endpoint);
    if (!endpoint) return Response.json({ erro: "Endpoint de push inválido." }, { status: 400 });
    const r = await db.pushInscricao.deleteMany({ where: { endpoint, usuarioId: s.id } });
    return ok({ ok: true, apagadas: r.count });
  } catch (erro) {
    return falha(erro);
  }
}

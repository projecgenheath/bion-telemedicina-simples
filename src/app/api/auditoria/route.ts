import { NextRequest } from "next/server";
import { exigirSessao } from "@/lib/server/auth";
import { carregarDados, type AuditPayload } from "@/lib/server/dados";
import { ok, falha } from "@/lib/server/http";

/**
 * Registro de eventos de auditoria vindos do cliente (ex.: exportação de PDF).
 * A identidade do usuário SEMPRE vem da sessão — o cliente não pode falsificar autor.
 */
export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const body = (await req.json()) as AuditPayload & { audit?: never };

    // Reaproveita a resposta fresca para o cliente atualizar a trilha (se admin)
    const { aplicarSideEffects } = await import("@/lib/server/dados");
    await aplicarSideEffects(usuario, undefined, body);

    const dados = await carregarDados(usuario);
    return ok(dados);
  } catch (erro) {
    return falha(erro);
  }
}

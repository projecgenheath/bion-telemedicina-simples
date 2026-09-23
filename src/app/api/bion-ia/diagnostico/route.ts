import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { estadoCanais, probeCanais } from "@/lib/server/llm";

/**
 * Diagnóstico dos canais de IA (BION IA) — somente ADMIN.
 *
 * GET  → estado de configuração dos canais (booleanos/modelos; NUNCA chaves).
 * POST → sonda ao vivo: cada canal recebe "Responda apenas: ok" e a resposta
 *        informa se o canal funciona DESTE runtime (chave válida + região
 *        suportada). Útil para validar envs recém-configuradas na Vercel.
 */
export async function GET() {
  try {
    await exigirPapel("ADMIN");
    return ok({
      canais: estadoCanais(),
      ordem: ["gemini", "env", "publico", "sdk"] as const,
    });
  } catch (e) {
    return falha(e);
  }
}

export async function POST(_req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    const probes = await probeCanais();
    return ok({ probes });
  } catch (e) {
    return falha(e);
  }
}

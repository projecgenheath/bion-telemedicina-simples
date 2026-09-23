import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { estadoCanais, probeCanais, diagnosticoGemini, type Msg } from "@/lib/server/llm";

/**
 * Diagnóstico dos canais de IA (BION IA) — somente ADMIN.
 *
 * GET → estado de configuração dos canais (booleanos/modelos; NUNCA chaves).
 *
 * POST → duas modalidades:
 * - sem corpo (ou {}): sonda ao vivo mínima de cada canal ("Responda apenas: ok").
 * - { mensagens: Msg[] }: reproduz uma chamada REAL ao Gemini com o payload
 *   informado (mesmo caminho do chat, com normalização de alternância) e
 *   devolve texto + registros por tentativa (status, finishReason, blockReason).
 *   A chave NUNCA é ecoada nas respostas.
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

export async function POST(req: NextRequest) {
  try {
    await exigirPapel("ADMIN");

    let mensagens: Msg[] | null = null;
    try {
      const corpo = (await req.json()) as { mensagens?: Msg[] } | null;
      const candidatas = (corpo?.mensagens ?? []).filter(
        (m) => m && typeof m.content === "string" && m.content.trim() && (m.role === "user" || m.role === "assistant"),
      );
      if (candidatas.length) mensagens = candidatas.slice(-24);
    } catch {
      // corpo ausente/inválido → modo sonda simples
    }

    if (mensagens) {
      const resultado = await diagnosticoGemini(mensagens);
      return ok({
        cenario: "chat-real",
        texto: resultado.texto,
        textoLen: resultado.texto?.length ?? 0,
        registros: resultado.registros,
      });
    }

    const probes = await probeCanais();
    return ok({ probes });
  } catch (e) {
    return falha(e);
  }
}

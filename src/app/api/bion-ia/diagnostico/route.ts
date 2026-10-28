import { NextRequest } from "next/server";
import { exigirPapel } from "@/lib/server/auth";
import {ok, falha, lerCorpoJson} from "@/lib/server/http";
import { sondaNvidia, ordemCanais, bloqueioGemini } from "@/lib/server/sonda-nvidia";
import { estadoCanais, diagnosticoGemini, iaPausada, listarModelosGemini, respostaIaPausada, type Msg } from "@/lib/server/llm";

/**
 * Diagnóstico dos canais de IA (BION IA) — somente ADMIN.
 *
 * GET → estado de configuração dos canais (booleanos/modelos; NUNCA chaves).
 *
 * POST → três modalidades:
 * - sem corpo (ou {}): sonda ao vivo mínima SÓ do NVIDIA ("Responda apenas: ok");
 *   nunca chama o Gemini. Resposta: { probes: [{ canal: "nvidia", ... }] }.
 * - { listar: true }: lista os modelos que a chave Gemini tem acesso (ListModels).
 * - { mensagens: Msg[], modelo? }: reproduz uma chamada REAL ao Gemini com o
 *   payload informado (mesmo caminho do chat, com normalização de alternância);
 *   `modelo` (opcional, [A-Za-z0-9._-]) testa um modelo específico antes da
 *   cadeia configurada. Devolve texto + registros por tentativa (status,
 *   finishReason, blockReason). A chave NUNCA é ecoada nas respostas.
 */
export async function GET() {
  try {
    await exigirPapel("ADMIN");
    return ok({
      canais: estadoCanais(),
      pausada: iaPausada(),
      ordem: ordemCanais(),
    });
  } catch (e) {
    return falha(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await exigirPapel("ADMIN");
    // Pausa da BION IA (opt-in, BION_IA_PAUSADA=true): nem a sonda do admin manda dado à IA.
    if (iaPausada()) return respostaIaPausada();

    let mensagens: Msg[] | null = null;
    let modelo: string | undefined;
    let listar = false;
    try {
      const corpo = (await lerCorpoJson(req)) as { mensagens?: Msg[]; modelo?: string; listar?: boolean } | null;
      listar = corpo?.listar === true;
      const candidata = typeof corpo?.modelo === "string" ? corpo.modelo.trim() : "";
      if (/^[A-Za-z0-9._-]{1,80}$/.test(candidata)) modelo = candidata;
      const candidatas = (corpo?.mensagens ?? []).filter(
        (m) => m && typeof m.content === "string" && m.content.trim() && (m.role === "user" || m.role === "assistant"),
      );
      if (candidatas.length) mensagens = candidatas.slice(-24);
    } catch {
      // corpo ausente/inválido → modo sonda simples
    }

    // Reserva do Gemini desligada (padrão em produção): listar/chat-real não chamam o Gemini.
    if (listar || mensagens) {
      const bloqueio = bloqueioGemini();
      if (bloqueio) return bloqueio;
    }

    if (listar) {
      const modelos = await listarModelosGemini();
      return ok({ modelos });
    }

    if (mensagens) {
      const resultado = await diagnosticoGemini(mensagens, 25_000, modelo);
      return ok({
        cenario: "chat-real",
        modelo: modelo ?? "(cadeia configurada)",
        texto: resultado.texto,
        textoLen: resultado.texto?.length ?? 0,
        registros: resultado.registros,
      });
    }

    const probe = await sondaNvidia();
    return ok({ probes: [probe] });
  } catch (e) {
    return falha(e);
  }
}

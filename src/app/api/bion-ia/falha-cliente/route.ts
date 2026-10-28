import { NextRequest } from "next/server";
import { exigirSessao } from "@/lib/server/auth";
import { falha } from "@/lib/server/http";
import { limitar } from "@/lib/server/rate-limit";
import { registrarTurnoLlm } from "@/lib/server/llm-monitor";

/**
 * Falhas da BION IA vistas no NAVEGADOR (504 HTML da Vercel, resposta não
 * JSON, timeout do cliente, rede, stream cortado) → monitor LLM do admin.
 *
 * POST { requestId?, tipo, http?, ms? } → 204
 * - Sem PII: só tipo (lista fechada), status HTTP, duração e o requestId.
 * - Sessão obrigatória; 10 registros/min por usuário (excedente é ignorado
 *   em silêncio: telemetria nunca atrapalha o chat).
 */

const TIPOS = new Set(["timeout", "nao_json", "rede", "http", "stream_interrompido"]);
const RE_ID = /^ia_[a-z0-9]{4,16}_[a-z0-9]{2,10}$/;

export async function POST(req: NextRequest) {
  try {
    const usuario = await exigirSessao();
    const v = limitar(`ia-falha-cliente:${usuario.id}`, 10, 60_000);
    if (!v.permitido) return new Response(null, { status: 204 });
    const b = (await req.json().catch(() => null)) as { requestId?: unknown; tipo?: unknown; http?: unknown; ms?: unknown } | null;
    const tipo = typeof b?.tipo === "string" && TIPOS.has(b.tipo) ? b.tipo : null;
    if (!tipo) return Response.json({ erro: "tipo inválido" }, { status: 400 });
    const requestId = typeof b?.requestId === "string" && RE_ID.test(b.requestId) ? b.requestId : undefined;
    const http = typeof b?.http === "number" && Number.isInteger(b.http) && b.http >= 100 && b.http < 600 ? b.http : null;
    const ms = typeof b?.ms === "number" && Number.isFinite(b.ms) ? Math.max(0, Math.min(Math.round(b.ms), 600_000)) : 0;
    registrarTurnoLlm({
      ts: Date.now(),
      ok: false,
      ms,
      fonte: null,
      modelo: null,
      textoLen: 0,
      http,
      finish: null,
      erro: `cliente:${tipo}`,
      requestId,
      origem: "cliente",
    });
    return new Response(null, { status: 204 });
  } catch (e) {
    return falha(e);
  }
}

import { db } from "@/lib/db";
import { exigirPapel } from "@/lib/server/auth";
import { ok, falha } from "@/lib/server/http";
import { eventosLlmMemoria, resumir, type EventoLlm } from "@/lib/server/llm-monitor";

export async function GET() {
  try {
    await exigirPapel("ADMIN");
    const vivos = eventosLlmMemoria();
    const persistidos = await db.auditLog.findMany({
      where: { acao: "LLM_TURNO" },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    const doBanco: EventoLlm[] = persistidos.map((l) => {
      try {
        return JSON.parse(l.detalhes || "{}") as EventoLlm;
      } catch {
        return {
          ts: l.createdAt.getTime(),
          ok: l.severidade === "info",
          ms: 0,
          fonte: null,
          modelo: null,
          textoLen: 0,
          http: null,
          finish: null,
          erro: l.detalhes,
        };
      }
    });
    const visto = new Set(vivos.map((e) => e.ts));
    const eventos = [...vivos, ...doBanco.filter((e) => !visto.has(e.ts))].slice(0, 80);
    return ok({
      resumo: resumir(eventos),
      eventos,
    });
  } catch (e) {
    return falha(e);
  }
}

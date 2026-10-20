import "server-only";
import { db } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Chat da teleconsulta guardado com a consulta (decisão do Alisson,    */
/* 20/10/2026: prontuário, CFM 20 anos). As mensagens chegam pela       */
/* SinalSala (tipo "chat", payload {s, texto}) junto com os sinais      */
/* WebRTC; antes de qualquer limpeza da sala elas são copiadas para     */
/* ChatConsulta. sinalId é UNIQUE: rodar de novo não duplica.           */
/* ------------------------------------------------------------------ */

type Cliente = Pick<typeof db, "sinalSala" | "chatConsulta">;

/** Texto da mensagem a partir do payload do sinal (JSON {texto} ou texto puro). */
export function textoDoPayload(payload: string): string {
  try {
    const p = JSON.parse(payload) as unknown;
    if (
      p &&
      typeof p === "object" &&
      typeof (p as { texto?: unknown }).texto === "string"
    ) {
      return (p as { texto: string }).texto;
    }
    if (typeof p === "string") return p;
  } catch {
    /* payload não é JSON: guarda como veio */
  }
  return payload;
}

/**
 * Copia o chat da sala para ChatConsulta. Idempotente (skipDuplicates no
 * UNIQUE de sinalId). Devolve os ids de sinal de chat que já estão guardados
 * (os únicos que a limpeza pode apagar).
 */
export async function guardarChatSala(
  consultaId: string,
  cliente: Cliente = db,
): Promise<Set<string>> {
  const sinais = await cliente.sinalSala.findMany({
    where: { consultaId, tipo: "chat" },
    select: {
      id: true,
      deUsuarioId: true,
      deRole: true,
      payload: true,
      createdAt: true,
    },
  });
  if (sinais.length === 0) return new Set();
  await cliente.chatConsulta.createMany({
    data: sinais.map((s) => ({
      sinalId: s.id,
      consultaId,
      autorId: s.deUsuarioId,
      papel: s.deRole,
      texto: textoDoPayload(s.payload),
      criadoEm: s.createdAt,
    })),
    skipDuplicates: true,
  });
  const guardados = await cliente.chatConsulta.findMany({
    where: { sinalId: { in: sinais.map((s) => s.id) } },
    select: { sinalId: true },
  });
  return new Set(guardados.map((g) => g.sinalId));
}

/** Versão que nunca derruba quem chamou (o desfecho já foi gravado). */
export async function guardarChatSalaSemFalhar(
  consultaId: string,
): Promise<void> {
  try {
    await guardarChatSala(consultaId);
  } catch (e) {
    console.error("[chat-consulta] falha ao guardar o chat", consultaId, e);
  }
}

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
/**
 * Texto da mensagem guardada no payload do sinal. Devolve null quando não há
 * texto (payload vazio, "{}", texto vazio ou só espaços): isso não é chat.
 */
export function textoDoPayload(payload: string): string | null {
  let texto: unknown = payload;
  try {
    const p = JSON.parse(payload) as unknown;
    if (typeof p === "string") texto = p;
    else if (p && typeof p === "object") texto = (p as { texto?: unknown }).texto;
  } catch {
    /* payload não é JSON: guarda como veio */
  }
  return typeof texto === "string" && texto.trim() !== "" ? texto : null;
}

/**
 * Copia o chat da sala para ChatConsulta. Idempotente (skipDuplicates no
 * UNIQUE de sinalId). Devolve os ids de sinal de chat que já estão guardados
 * mais os de chat sem texto, que não são guardados (os únicos que a limpeza
 * pode apagar).
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
  const comTexto: { s: (typeof sinais)[number]; texto: string }[] = [];
  const semTexto: string[] = [];
  for (const s of sinais) {
    const texto = textoDoPayload(s.payload);
    if (texto === null) semTexto.push(s.id);
    else comTexto.push({ s, texto });
  }
  if (comTexto.length > 0) {
    await cliente.chatConsulta.createMany({
      data: comTexto.map(({ s, texto }) => ({
        sinalId: s.id,
        consultaId,
        autorId: s.deUsuarioId,
        papel: s.deRole,
        texto,
        criadoEm: s.createdAt,
      })),
      skipDuplicates: true,
    });
  }
  const guardados = await cliente.chatConsulta.findMany({
    where: { sinalId: { in: sinais.map((s) => s.id) } },
    select: { sinalId: true },
  });
  return new Set([...guardados.map((g) => g.sinalId), ...semTexto]);
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

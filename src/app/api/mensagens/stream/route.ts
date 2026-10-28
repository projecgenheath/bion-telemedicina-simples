import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/server/auth";

/**
 * FASE 3 (auditoria front) — mensagens em TEMPO REAL via Server-Sent Events.
 *
 * Por que SSE e não WebSocket: a Vercel (serverless) não mantém sockets
 * persistentes; SSE sobre HTTP funciona nativamente nas Route Handlers com
 * streaming (fluid compute). O EventSource do navegador reconecta sozinho —
 * encadeamos fluxos de ~50s em tempo real contínuo.
 *
 * Contrato:
 *  - `retry: 3000`  → intervalo de reconexão do cliente.
 *  - `event: mensagens` com payload { mensagens } — MESMA forma do GET
 *    /api/mensagens?desde= (id, deId, de, paraId, para, texto, lida,
 *    createdAt), então o cliente reusa mesclarMensagens() sem adaptação.
 *  - comentários `: ping` a cada ~15s mantêm proxies vivos.
 *  - marcador inicial = agora − 2s (tolera skew relógio-app ↔ banco; como o
 *    cliente deduplica por id, reenvio é inofensivo).
 *
 * Segurança: sessão por cookie (EventSource same-origin envia cookies); 401
 * encerra sem retry (o fallback de polling do cliente assume).
 * Custo: enquanto o stream está aberto, o cliente NÃO faz polling — o tráfego
 * ocioso cai de ~15 req/min por usuário para ~1 reconexão/min.
 *
 * B-26: teto de 2 fluxos SIMULTÂNEOS por usuário (multi-aparelho). Cada
 * fluxo varre o banco a cada 1,5 s; sem teto, o custo cresce sem limite com
 * abas/aparelhos abertos. O 3º fluxo recebe 429 (o EventSource para de
 * reconectar e o cliente cai no polling de segurança).
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const INTERVALO_VARREDURA_MS = 1500;
const INTERVALO_PING_MS = 15_000;
const VIDA_DO_FLUXO_MS = 50_000;
const TAKE = 200;
const FLUXOS_POR_USUARIO = 2;

/** Fluxos abertos por usuário (instância). Limpa na saída de cada fluxo. */
const fluxosAbertos = new Map<string, number>();

function abrirFluxo(usuarioId: string): boolean {
  const n = fluxosAbertos.get(usuarioId) ?? 0;
  if (n >= FLUXOS_POR_USUARIO) return false;
  fluxosAbertos.set(usuarioId, n + 1);
  return true;
}

function fecharFluxo(usuarioId: string): void {
  const n = fluxosAbertos.get(usuarioId) ?? 0;
  if (n <= 1) fluxosAbertos.delete(usuarioId);
  else fluxosAbertos.set(usuarioId, n - 1);
}

export async function GET() {
  let usuarioId: string;
  try {
    const usuario = await exigirSessao();
    usuarioId = usuario.id;
  } catch {
    // Status errado faz o EventSource falhar sem reconectar — polling assume.
    return new Response("não autorizado", { status: 401 });
  }

  // B-26: teto por usuário — o 3º fluxo simultâneo cai no polling do cliente.
  if (!abrirFluxo(usuarioId)) {
    return new Response("muitos fluxos abertos", {
      status: 429,
      headers: { "Retry-After": "30" },
    });
  }

  const codificador = new TextEncoder();
  let marcador = new Date(Date.now() - 2000); // tolerância a skew
  let fechado = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (pedaco: string) => {
        if (fechado) return;
        try {
          controller.enqueue(codificador.encode(pedaco));
        } catch {
          fechado = true;
        }
      };

      const linha = (m: {
        id: string;
        deId: string;
        de: { nome: string };
        paraId: string;
        para: { nome: string };
        texto: string;
        lida: boolean;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        id: m.id,
        deId: m.deId,
        de: m.de.nome,
        paraId: m.paraId,
        para: m.para.nome,
        texto: m.texto,
        lida: m.lida,
        createdAt: m.createdAt.toISOString(),
      });

      enviar("retry: 3000\n\n");
      enviar(": conectado bion\n\n");

      const inicio = Date.now();
      let ultimoPing = Date.now();

      try {
        while (!fechado && Date.now() - inicio < VIDA_DO_FLUXO_MS) {
          const novas = await db.mensagem.findMany({
            where: {
              AND: [
                { OR: [{ deId: usuarioId }, { paraId: usuarioId }] },
                {
                  OR: [
                    { createdAt: { gt: marcador } },
                    { updatedAt: { gt: marcador } },
                  ],
                },
              ],
            },
            include: {
              de: { select: { nome: true } },
              para: { select: { nome: true } },
            },
            orderBy: { createdAt: "asc" },
            take: TAKE,
          });

          if (novas.length) {
            const tsMaximo = novas.reduce(
              (acc, m) =>
                Math.max(acc, m.createdAt.getTime(), m.updatedAt.getTime()),
              marcador.getTime(),
            );
            if (tsMaximo > marcador.getTime()) marcador = new Date(tsMaximo);
            enviar(
              `event: mensagens\ndata: ${JSON.stringify({
                mensagens: novas.map(linha),
              })}\n\n`,
            );
          }

          if (Date.now() - ultimoPing >= INTERVALO_PING_MS) {
            enviar(": ping\n\n");
            ultimoPing = Date.now();
          }

          await new Promise((r) => setTimeout(r, INTERVALO_VARREDURA_MS));
        }
      } catch {
        // banco/rede indisponível: encerra — o cliente reconecta e o polling
        // de segurança cobre a janela com falhas.
      } finally {
        fechado = true;
        fecharFluxo(usuarioId);
        try {
          controller.close();
        } catch {
          /* já fechado pelo cliente */
        }
      }
    },
    cancel() {
      fechado = true;
      fecharFluxo(usuarioId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

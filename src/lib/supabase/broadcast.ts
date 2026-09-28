import "server-only";
import { supabaseAdminOuNull } from "@/lib/server/auth";

/** Envia broadcast Realtime (best-effort, não bloqueia a request por mais de ~2s). */
export async function broadcastCanal(
  canal: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const admin = supabaseAdminOuNull();
  if (!admin) return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 2000);
    const channel = admin.channel(canal, {
      config: { broadcast: { ack: false } },
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.send({ type: "broadcast", event, payload });
        } catch (e) {
          console.error("[Realtime] send", e);
        }
        try {
          await admin.removeChannel(channel);
        } catch {
          /* ignore */
        }
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

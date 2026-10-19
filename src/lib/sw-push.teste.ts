/** Testa public/sw.js num self simulado. Rodar: bun src/lib/sw-push.teste.ts */
import { readFileSync } from "node:fs";
let ok = 0, falhas = 0;
function igual(n: string, o: unknown, e: unknown) {
  if (JSON.stringify(o) === JSON.stringify(e)) ok++; else { falhas++; console.log(`FALHA ${n}: ${JSON.stringify(o)} ≠ ${JSON.stringify(e)}`); }
}
type H = (e: unknown) => void;
const handlers: Record<string, H> = {};
const mostradas: { t: string; o: Record<string, unknown>; fechada: boolean }[] = [];
const self = {
  addEventListener: (n: string, h: H) => (handlers[n] = h),
  registration: {
    showNotification: async (t: string, o: Record<string, unknown>) => {
      for (const m of mostradas) if (m.o.tag === o.tag) m.fechada = true; // mesma tag substitui
      mostradas.push({ t, o, fechada: false });
    },
    getNotifications: async ({ tag }: { tag: string }) =>
      mostradas.filter((m) => !m.fechada && m.o.tag === tag).map((m) => ({ data: m.o.data, close: () => (m.fechada = true) })),
  },
  clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
  skipWaiting: () => {},
  location: { origin: "https://bion.test" },
};
new Function("self", readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"))(self);
async function push(p: unknown) {
  let pr: Promise<unknown> = Promise.resolve();
  handlers.push({ data: { json: () => p }, waitUntil: (x: Promise<unknown>) => (pr = x) });
  await pr;
  return mostradas.at(-1)!;
}
const futuro = new Date(Date.now() + 60_000).toISOString();
const n1 = await push({ consultaId: "c1", tentativa: 2, expiraEm: futuro, url: "/consulta?consulta=c1", titulo: "Sua consulta vai começar", corpo: "" });
igual("titulo", n1.t, "Sua consulta vai começar");
igual("tag", n1.o.tag, "c1");
igual("icon", n1.o.icon, "/icons/icon-192.png");
igual("badge", n1.o.badge, "/icons/badge-96.png");
igual("renotify", n1.o.renotify, true);
igual("body", n1.o.body, "");
igual("url", (n1.o.data as { url: string }).url, "/consulta?consulta=c1");
const n2 = await push({ consultaId: "c1", tentativa: 3, expiraEm: new Date(Date.now() - 1000).toISOString(), url: "/consulta?consulta=c1", titulo: "X" });
igual("vencido mostra", n2.o.tag, "c1");
igual("vencido fecha", n2.fechada, true);
igual("substitui anterior", n1.fechada, true);
igual("vencido sem renotify", n2.o.renotify, false);
const n3 = await push({ url: "https://mal.example/" });
igual("url externa", (n3.o.data as { url: string }).url, "/paciente");
const n4 = await push({ consultaId: "c2", tentativa: 1, expiraEm: new Date(Date.now() + 50).toISOString(), url: "/x", titulo: "T" });
igual("fecha no expiraEm", n4.fechada, true);
const n5p = push({ consultaId: "c3", tentativa: 1, expiraEm: new Date(Date.now() + 10 * 60_000).toISOString(), url: "/x", titulo: "T" });
igual("longe: não espera", (await n5p).fechada, false);
console.log(`${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);

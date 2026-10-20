/** Testa public/sw.js num self simulado. Rodar: bun src/lib/sw-push.teste.ts */
import { readFileSync } from "node:fs";
let ok = 0, falhas = 0;
function igual(n: string, o: unknown, e: unknown) {
  if (JSON.stringify(o) === JSON.stringify(e)) ok++; else { falhas++; console.log(`FALHA ${n}: ${JSON.stringify(o)} ≠ ${JSON.stringify(e)}`); }
}
type H = (e: unknown) => void;
type Aba = { url: string; focou: boolean; focus: () => Promise<void>; navigate?: (u: string) => Promise<unknown> };
let abas: Aba[] = [];
const abertas: string[] = [];
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
  clients: { claim: async () => {}, matchAll: async () => abas, openWindow: async (u: string) => void abertas.push(u) },
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
const futuro = new Date(Date.now() + 5 * 60_000).toISOString(); // além da espera máx. do SW (90 s)
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
const urlDe = async (u: unknown) => ((await push({ consultaId: "u", tentativa: 1, url: u })).o.data as { url: string }).url;
igual("url externa", await urlDe("https://mal.example/"), "/paciente");
igual("url //externo", await urlDe("//mal.example/x"), "/paciente");
igual("url javascript:", await urlDe("javascript:alert(1)"), "/paciente");
igual("url mesma origem absoluta", await urlDe("https://bion.test/consulta?consulta=1"), "/consulta?consulta=1");
igual("url relativa", await urlDe("/consulta?consulta=c1"), "/consulta?consulta=c1");
igual("url não string", await urlDe(42), "/paciente");
const nt = await push({ tipo: "outro", titulo: "Mal", url: "/admin" });
igual("tipo desconhecido: texto padrão", nt.t, "Sua consulta vai começar");
igual("tipo desconhecido: url padrão", (nt.o.data as { url: string }).url, "/paciente");
// item 5: notificationclick
async function clicar(url: string) {
  let pr: Promise<unknown> = Promise.resolve();
  handlers.notificationclick({ notification: { data: { url }, close() {} }, waitUntil: (x: Promise<unknown>) => (pr = x) });
  await pr;
}
const mk = (url: string, nav?: Aba["navigate"]): Aba => { const a: Aba = { url, focou: false, focus: async () => void (a.focou = true), navigate: nav }; return a; };
abas = [mk("https://bion.test/paciente", async () => ({}))];
await clicar("/consulta?consulta=c1");
igual("navigate ok foca", [abas[0].focou, abertas.length], [true, 0]);
abas = [mk("https://bion.test/paciente", async () => { throw new Error("x"); })];
await clicar("/consulta?consulta=c1");
igual("navigate falhou → openWindow", [abas[0].focou, abertas.at(-1)], [false, "https://bion.test/consulta?consulta=c1"]);
abas = [mk("https://bion.test/paciente", async () => null)];
await clicar("/consulta?consulta=c2");
igual("navigate null → openWindow", abertas.at(-1), "https://bion.test/consulta?consulta=c2");
abas = [];
await clicar("//mal.example/");
igual("clique url externa", abertas.at(-1), "https://bion.test/paciente");
const n4 = await push({ consultaId: "c2", tentativa: 1, expiraEm: new Date(Date.now() + 50).toISOString(), url: "/x", titulo: "T" });
igual("fecha no expiraEm", n4.fechada, true);
const n5p = push({ consultaId: "c3", tentativa: 1, expiraEm: new Date(Date.now() + 10 * 60_000).toISOString(), url: "/x", titulo: "T" });
igual("longe: não espera", (await n5p).fechada, false);
console.log(`${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);

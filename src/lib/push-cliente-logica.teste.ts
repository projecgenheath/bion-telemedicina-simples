/** Rodar: bun src/lib/push-cliente-logica.teste.ts */
import { chaveDispensa, mesmaChave, tipoAviso, chaveSync, chavesSyncParaLimpar, lerRegistroSync, precisaSincronizar, SYNC_MS, base64UrlParaBytes, corpoInscricao, detectarSuporte, deveMostrarAviso, dispensaRecente, DISPENSA_MS, escolherChave, ehIOS, papelComAviso } from "./push-cliente-logica";

let ok = 0, falhas = 0;
function igual(n: string, o: unknown, e: unknown) {
  if (JSON.stringify(o) === JSON.stringify(e)) ok++; else { falhas++; console.log(`FALHA ${n}: ${JSON.stringify(o)} ≠ ${JSON.stringify(e)}`); }
}
const base = { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", maxTouchPoints: 0, standalone: false, seguro: true, temSW: true, temPush: true, temNotification: true };
const IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari";
igual("desktop", detectarSuporte(base), { ok: true, plataforma: "desktop" });
igual("android", detectarSuporte({ ...base, userAgent: "Linux; Android 14 Chrome" }), { ok: true, plataforma: "android" });
igual("ios sem pwa", detectarSuporte({ ...base, userAgent: IPH, temPush: false }), { ok: false, motivo: "ios_sem_pwa" });
igual("ios pwa", detectarSuporte({ ...base, userAgent: IPH, standalone: true }), { ok: true, plataforma: "ios_pwa" });
igual("ipados", ehIOS("Macintosh Safari", 5), true);
igual("mac", ehIOS("Macintosh Safari", 0), false);
igual("inseguro", detectarSuporte({ ...base, seguro: false }), { ok: false, motivo: "inseguro" });
igual("sem api", detectarSuporte({ ...base, temPush: false }), { ok: false, motivo: "sem_api" });
igual("papel admin", papelComAviso("ADMIN"), false);
igual("papel medico", papelComAviso("medico"), true);
const agora = 1_800_000_000_000;
igual("dispensa recente", dispensaRecente(String(agora - 1000), agora), true);
igual("dispensa velha", dispensaRecente(String(agora - DISPENSA_MS - 1), agora), false);
igual("dispensa lixo", dispensaRecente("abc", agora), false);
const sup = { ok: true as const, plataforma: "desktop" as const };
igual("mostra", deveMostrarAviso({ role: "paciente", suporte: sup, permissao: "default", dispensadoEm: null, agora }), true);
igual("granted", deveMostrarAviso({ role: "paciente", suporte: sup, permissao: "granted", dispensadoEm: null, agora }), false);
igual("denied", deveMostrarAviso({ role: "paciente", suporte: sup, permissao: "denied", dispensadoEm: null, agora }), false);
igual("admin", deveMostrarAviso({ role: "admin", suporte: sup, permissao: "default", dispensadoEm: null, agora }), false);
igual("dispensado", deveMostrarAviso({ role: "medico", suporte: sup, permissao: "default", dispensadoEm: String(agora), agora }), false);
igual("chave env", escolherChave(" abc ", { ativo: true, chavePublica: "x" }), "abc");
igual("chave get", escolherChave("", { ativo: true, chavePublica: "x" }), "x");
igual("chave inativo", escolherChave(undefined, { ativo: false, chavePublica: null }), null);
igual("b64url", Array.from(base64UrlParaBytes("AP-_")), [0, 255, 191]);
igual("corpo", corpoInscricao({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } }, "android"), { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" }, plataforma: "android" });
igual("corpo incompleto", corpoInscricao({ endpoint: "e" }, "android"), null);
igual("sync sem registro", precisaSincronizar(null, "e1", agora), true);
igual("sync mesmo endpoint recente", precisaSincronizar({ endpoint: "e1", em: agora - 1000 }, "e1", agora), false);
igual("sync endpoint mudou", precisaSincronizar({ endpoint: "e0", em: agora - 1000 }, "e1", agora), true);
igual("sync > 24h", precisaSincronizar({ endpoint: "e1", em: agora - SYNC_MS - 1 }, "e1", agora), true);
igual("sync = 24h", precisaSincronizar({ endpoint: "e1", em: agora - SYNC_MS }, "e1", agora), false);
igual("sync relógio voltou", precisaSincronizar({ endpoint: "e1", em: agora + 60_000 }, "e1", agora), true);
igual("ler ok", lerRegistroSync(JSON.stringify({ endpoint: "e", em: 5 })), { endpoint: "e", em: 5 });
igual("ler lixo", lerRegistroSync("{x"), null);
igual("ler null", lerRegistroSync(null), null);
igual("ler incompleto", lerRegistroSync(JSON.stringify({ endpoint: "e" })), null);
igual("chave por usuário", chaveSync("u1"), "bion:push-sync:u1");
igual("limpar", chavesSyncParaLimpar(["bion:push-sync:u1", "bion:push-aviso-dispensado", "x", "bion:push-sync:u2"]), ["bion:push-sync:u1", "bion:push-sync:u2"]);
// item 1/2: tipoAviso
const ta = (x: Partial<Parameters<typeof tipoAviso>[0]>) => tipoAviso({ role: "paciente", suporte: sup, permissao: "default", dispensadoEm: null, agora, temChave: true, ...x });
igual("aviso ativar", ta({}), "ativar");
igual("sem VAPID esconde", ta({ temChave: false }), null);
igual("buscando chave esconde", ta({ temChave: null }), null);
igual("ios sem pwa → instalar", ta({ suporte: { ok: false, motivo: "ios_sem_pwa" }, permissao: "indisponivel" }), "instalar");
igual("instalar dispensado", ta({ suporte: { ok: false, motivo: "ios_sem_pwa" }, dispensadoEm: String(agora) }), null);
igual("instalar admin", ta({ role: "admin", suporte: { ok: false, motivo: "ios_sem_pwa" } }), null);
igual("sem api", ta({ suporte: { ok: false, motivo: "sem_api" } }), null);
igual("granted", ta({ permissao: "granted" }), null);
igual("dispensa por usuário", chaveDispensa("u1"), "bion:push-aviso-dispensado:u1");
igual("dispensa sem usuário", chaveDispensa(), "bion:push-aviso-dispensado");
// item 4: mesmaChave
const k = "BAAQ_w";
igual("mesma chave", mesmaChave(base64UrlParaBytes(k), k), true);
igual("mesma chave (ArrayBuffer)", mesmaChave(base64UrlParaBytes(k).buffer, k), true);
igual("chave trocou", mesmaChave(base64UrlParaBytes("BAAQ_g"), k), false);
igual("tamanho difere", mesmaChave(new Uint8Array([4, 0]), k), false);
igual("navegador não informa", mesmaChave(null, k), true);
console.log(`${ok} ok, ${falhas} falhas`);
if (falhas) process.exit(1);

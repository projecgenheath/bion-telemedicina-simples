/**
 * Teste do job do toque (src/lib/server/toque.ts), da rota do cron, das rotas
 * de inscrição de push, do logout com endpoint e da Fila "Chamada não
 * atendida", contra um Postgres LOCAL descartável (nunca produção) com o
 * schema atual (inclui 20261018a_chamada_push).
 *   DATABASE_URL=postgresql://<usuario>@localhost:<porta>/<banco> \
 *   bun --conditions react-server scripts/teste_toque.ts
 * APAGA os dados do banco local. Broadcast e push são substituídos por
 * gravadores (nada sai para a rede).
 */
import { mock } from "bun:test";
import crypto from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
// Host exato (não regex): "localhost.evil.com" ou "?host=127.0.0.1" não passam.
let hostBanco = "";
try { hostBanco = new URL(url).hostname; } catch { /* URL inválida */ }
if (!["localhost", "127.0.0.1"].includes(hostBanco)) throw new Error("Só roda contra um Postgres local (localhost/127.0.0.1).");

/* Sessão falsa para as rotas (a real depende de cookies do Next). */
let sessaoAtual: { id: string; nome: string; email: string; role: "PACIENTE" | "MEDICO" | "ADMIN"; precisaTrocarSenha: boolean } | null = null;
const naoAutenticado = () => Object.assign(new Error("Não autenticado"), { status: 401 });
mock.module("@/lib/server/auth", () => ({
  getSessao: async () => sessaoAtual,
  exigirSessao: async () => {
    if (!sessaoAtual) throw naoAutenticado();
    return sessaoAtual;
  },
  exigirPapel: async (...papeis: string[]) => {
    if (!sessaoAtual) throw naoAutenticado();
    if (!papeis.includes(sessaoAtual.role)) throw Object.assign(new Error("Acesso negado"), { status: 403 });
    return sessaoAtual;
  },
  registrarAudit: async () => undefined,
  destruirSessao: async () => undefined,
}));

const { db } = await import("@/lib/db");
const toque = await import("@/lib/server/toque");
const { rodarToque, proximaTentativa, listarChamadasNaoAtendidas, TITULO_PUSH } = toque;
const webPush = await import("@/lib/server/web-push");
const cron = await import("@/app/api/cron/toque/route");
const inscricao = await import("@/app/api/push/inscricao/route");
const logout = await import("@/app/api/auth/logout/route");
const naoAtendidasRota = await import("@/app/api/admin/consultas/chamadas-nao-atendidas/route");

let okN = 0;
let falhaN = 0;
function verifica(cond: unknown, nome: string, extra?: unknown) {
  if (cond) { okN++; console.log("ok    " + nome); } else { falhaN++; console.log("FALHA " + nome, extra === undefined ? "" : JSON.stringify(extra)); }
}
const MIN = 60_000;

type Ev = { usuarioId: string; evento: string; payload: Record<string, unknown> };
type Push = { usuarioId: string; payload: Record<string, unknown>; opcoes: { ttl: number; urgencia: string } };
let eventos: Ev[] = [];
let pushes: Push[] = [];
const dep = {
  enviarEvento: async (usuarioId: string, evento: string, payload: Record<string, unknown>) => { eventos.push({ usuarioId, evento, payload }); },
  enviarPush: async (usuarioId: string, payload: Record<string, unknown>, opcoes: { ttl: number; urgencia: string }) => { pushes.push({ usuarioId, payload, opcoes }); return 1; },
};
const zerar = () => { eventos = []; pushes = []; };
const rodar = (t: Date) => rodarToque(t, dep as never);

async function limpar() {
  await db.chamadaConsulta.deleteMany();
  await db.pushInscricao.deleteMany();
  await db.presencaSala.deleteMany();
  await db.eventoConsulta.deleteMany();
  await db.consulta.deleteMany();
  await db.user.deleteMany();
}
await limpar();
await db.user.createMany({
  data: [
    { id: "pac1", nome: "Maria Clara Souza", email: "p1@t", senhaHash: "x", role: "PACIENTE" },
    { id: "med1", nome: "Dra. Ana Lima", email: "m1@t", senhaHash: "x", role: "MEDICO" },
    { id: "pac2", nome: "José", email: "p2@t", senhaHash: "x", role: "PACIENTE" },
    { id: "med2", nome: "Bruno Reis", email: "m2@t", senhaHash: "x", role: "MEDICO" },
    { id: "adm", nome: "Admin", email: "a@t", senhaHash: "x", role: "ADMIN" },
    { id: "med3", nome: "Carla", email: "m3@t", senhaHash: "x", role: "MEDICO" },
  ],
});
const T0 = new Date("2026-10-19T13:00:00.000Z"); // 10:00 em SP
const em = (min: number) => new Date(T0.getTime() + min * MIN);
await db.consulta.createMany({
  data: [
    { id: "c1", pacienteId: "pac1", medicoId: "med1", especialidade: "Psiquiatria", dataInicio: T0, status: "confirmada", pago: true, valor: 150 },
    // médico já na sala: só o paciente toca
    { id: "c2", pacienteId: "pac2", medicoId: "med2", especialidade: "Clínica", dataInicio: T0, status: "confirmada", pago: true, valor: 150 },
    // fora do escopo: cancelada, futura e antiga (> 15 min)
    { id: "c3", pacienteId: "pac2", medicoId: "med1", especialidade: "Clínica", dataInicio: T0, status: "cancelada", valor: 150 },
    { id: "c4", pacienteId: "pac2", medicoId: "med1", especialidade: "Clínica", dataInicio: em(30), status: "confirmada", valor: 150 },
    { id: "c5", pacienteId: "pac2", medicoId: "med1", especialidade: "Clínica", dataInicio: em(-16), status: "confirmada", valor: 150 },
    // dado inconsistente: admin como paciente — nunca toca para admin
    { id: "c6", pacienteId: "adm", medicoId: "med3", especialidade: "Clínica", dataInicio: T0, status: "confirmada", valor: 150 },
  ],
});
await db.presencaSala.create({ data: { consultaId: "c2", usuarioId: "med2", papel: "MEDICO", ultimoPing: em(-1), entrouEm: em(-1) } });

const linhas = async (consultaId: string, usuarioId: string) =>
  db.chamadaConsulta.findMany({ where: { consultaId, paraUsuarioId: usuarioId }, orderBy: { tentativa: "asc" } });

/* ---------------- regra pura ---------------- */
verifica(proximaTentativa({ agora: em(-1), dataInicio: T0, entrouNaSala: false, chamadas: [] }) === null, "pura: antes do horário não toca");
verifica(proximaTentativa({ agora: em(0), dataInicio: T0, entrouNaSala: false, chamadas: [] }) === 1, "pura: no horário toca a 1ª");
verifica(proximaTentativa({ agora: em(15.5), dataInicio: T0, entrouNaSala: false, chamadas: [] }) === null, "pura: depois de 15 min não toca");
verifica(proximaTentativa({ agora: em(1), dataInicio: T0, entrouNaSala: true, chamadas: [] }) === null, "pura: quem entrou na sala não toca");
verifica(proximaTentativa({ agora: em(4.9), dataInicio: T0, entrouNaSala: false, chamadas: [{ tentativa: 1, status: "expirada", expiraEm: em(2) }] }) === null, "pura: pausa de 3 min depois de expirar");
verifica(proximaTentativa({ agora: em(5), dataInicio: T0, entrouNaSala: false, chamadas: [{ tentativa: 1, status: "expirada", expiraEm: em(2) }] }) === 2, "pura: 2ª tentativa 5 min depois da 1ª");
verifica(proximaTentativa({ agora: em(5), dataInicio: T0, entrouNaSala: false, chamadas: [{ tentativa: 1, status: "recusada", expiraEm: em(2) }] }) === null, "pura: recusou → não toca de novo");
verifica(toque.rotuloMedico("Dra. Ana Lima") === "Dr(a). Ana Lima" && toque.rotuloMedico("Bruno") === "Dr(a). Bruno", "contraparte do médico: Dr(a). <nome>");
verifica(toque.primeiroNome("Maria Clara Souza") === "Maria", "contraparte do paciente: só o primeiro nome");

/* ---------------- 1ª tentativa ---------------- */
zerar();
const r1 = await rodar(em(0.2));
verifica(r1.tocadas === 4, "toca 1ª vez: paciente e médico de c1, paciente de c2 e médico de c6", r1);
verifica(!eventos.some((e) => e.usuarioId === "adm") && !pushes.some((p) => p.usuarioId === "adm"), "nunca toca para admin");
verifica((await db.chamadaConsulta.count({ where: { paraUsuarioId: "adm" } })) === 0, "nenhuma linha de chamada para admin");
const evP = eventos.find((e) => e.usuarioId === "pac1" && e.evento === "chamada_tocando");
verifica(
  evP && evP.payload.consultaId === "c1" && evP.payload.contraparte === "Dr(a). Ana Lima" && evP.payload.especialidade === "Psiquiatria" && evP.payload.tentativa === 1 && evP.payload.expiraEm === em(2.2).toISOString(),
  "evento chamada_tocando do paciente: {consultaId, contraparte, especialidade, expiraEm, tentativa}",
  evP,
);
verifica(Object.keys(evP?.payload ?? {}).sort().join() === "consultaId,contraparte,especialidade,expiraEm,tentativa", "evento: só os 5 campos do contrato");
const evM = eventos.find((e) => e.usuarioId === "med1" && e.evento === "chamada_tocando");
verifica(evM?.payload.contraparte === "Maria", "evento do médico: contraparte = primeiro nome do paciente", evM);
verifica(!eventos.some((e) => e.usuarioId === "med2"), "para quem entrou na sala (médico de c2): não toca");
verifica(!eventos.some((e) => ["c3", "c4", "c5"].includes(String(e.payload.consultaId))), "não toca cancelada, futura nem com mais de 15 min");
const pP = pushes.find((p) => p.usuarioId === "pac1");
verifica(
  pP && JSON.stringify(Object.keys(pP.payload).sort()) === JSON.stringify(["consultaId", "corpo", "expiraEm", "tentativa", "tipo", "titulo", "url"]) &&
    pP.payload.tipo === "chamada_tocando" && pP.payload.url === "/consulta?consulta=c1" && pP.payload.titulo === TITULO_PUSH,
  "push: {tipo, consultaId, tentativa, expiraEm, url, titulo, corpo}",
  pP,
);
verifica(!JSON.stringify(pushes).match(/Ana|Maria|Psiquiatria|Lima/), "push sem nome nem especialidade");
verifica(pP?.payload.titulo === "Sua consulta vai começar" && pP?.payload.corpo === "", "push: tela de bloqueio só com o título (corpo vazio)", pP?.payload);
verifica(pP && pP.opcoes.ttl > 0 && pP.opcoes.ttl <= 120 && pP.opcoes.urgencia === "high", "push: TTL = segundos até expirar (≤ 120) e urgência alta", pP?.opcoes);
const l1 = await linhas("c1", "pac1");
verifica(l1.length === 1 && l1[0].status === "tocando" && l1[0].pushEnviado && l1[0].canal === "ambos" && l1[0].papel === "paciente", "linha tocando, push marcado", l1);

/* ---------------- não duplica ---------------- */
zerar();
const r1b = await rodar(em(0.7));
verifica(r1b.tocadas === 0 && eventos.length === 0, "não duplica: rodar de novo no mesmo minuto não toca", r1b);
// duas execuções simultâneas com a trava (apaga e corre)
await db.chamadaConsulta.deleteMany({ where: { consultaId: "c2" } });
zerar();
const [ra, rb] = await Promise.all([rodar(em(0.8)), rodar(em(0.8))]);
verifica(ra.tocadas + rb.tocadas === 1 && eventos.filter((e) => e.usuarioId === "pac2").length === 1, "duas execuções ao mesmo tempo: um toque só", [ra, rb]);

// O médico de c6 recusa a 1ª tentativa (rota do Pacientes grava recusada + respondidaEm na linha dele).
await db.chamadaConsulta.updateMany({ where: { consultaId: "c6", paraUsuarioId: "med3", tentativa: 1 }, data: { status: "recusada", respondidaEm: em(0.5) } });

/* ---------------- expira e repete ---------------- */
zerar();
const r2 = await rodar(em(2.3));
const exp = eventos.find((e) => e.usuarioId === "pac1" && e.evento === "chamada_expirada");
verifica(r2.expiradas >= 2 && exp?.payload.ultima === false && exp?.payload.tentativa === 1 && exp?.payload.em === em(2.2).toISOString(), "expira a 1ª: chamada_expirada {consultaId, tentativa, em, ultima:false}", exp);
verifica(Object.keys(exp?.payload ?? {}).sort().join() === "consultaId,em,tentativa,ultima", "chamada_expirada: só os 4 campos");
verifica(!eventos.some((e) => e.evento === "chamada_tocando"), "logo depois de expirar não toca de novo");
verifica(pushes.length === 0, "expiração não manda push");
zerar();
await rodar(em(2.3));
verifica(eventos.length === 0, "expirar de novo não repete o evento (idempotente)");
zerar();
await rodar(em(4.5));
verifica(!eventos.some((e) => e.evento === "chamada_tocando"), "4,5 min: ainda na pausa (não toca)");
zerar();
await rodar(em(5.2));
verifica(eventos.some((e) => e.usuarioId === "pac1" && e.evento === "chamada_tocando" && e.payload.tentativa === 2), "repete após expirar: 2ª tentativa aos 5 min");
await rodar(em(5.9)); // c2 tocou aos 0,8 → 2ª aos 5,8

/* ---------------- não toca para quem atendeu ---------------- */
// O médico de c1 atende a 2ª tentativa (rota do Pacientes faz isto).
await db.chamadaConsulta.updateMany({ where: { consultaId: "c1", paraUsuarioId: "med1", tentativa: 2 }, data: { status: "atendida", respondidaEm: em(5.5) } });
// O paciente de c2 recusa a 2ª.
await db.chamadaConsulta.updateMany({ where: { consultaId: "c2", paraUsuarioId: "pac2", tentativa: 2 }, data: { status: "recusada", respondidaEm: em(5.6) } });

zerar();
await rodar(em(7.3)); // expira a 2ª do paciente de c1
await rodar(em(10.3)); // 3ª tentativa
verifica(eventos.some((e) => e.usuarioId === "pac1" && e.evento === "chamada_tocando" && e.payload.tentativa === 3), "3ª tentativa aos 10 min");
verifica(!eventos.some((e) => e.usuarioId === "med1"), "não toca para quem atendeu (médico de c1)");
verifica(!eventos.some((e) => e.usuarioId === "pac2"), "não toca para quem recusou a 2ª (paciente de c2)");
verifica(!eventos.some((e) => e.usuarioId === "med3"), "não toca para quem recusou a 1ª (médico de c6), nem na 2ª nem na 3ª janela");
verifica((await linhas("c6", "med3")).map((l) => `${l.tentativa}:${l.status}`).join() === "1:recusada", "recusada não é expirada pelo job e não abre nova tentativa");

/* ---------------- máx 3 e ultima ---------------- */
zerar();
await rodar(em(12.4));
const ult = eventos.find((e) => e.usuarioId === "pac1" && e.evento === "chamada_expirada");
verifica(ult?.payload.tentativa === 3 && ult?.payload.ultima === true, "expira a 3ª e marca ultima: true", ult);
zerar();
await rodar(em(15));
verifica(!eventos.some((e) => e.evento === "chamada_tocando"), "máx 3: não abre a 4ª");
const todas = await linhas("c1", "pac1");
verifica(todas.map((l) => `${l.tentativa}:${l.status}`).join() === "1:expirada,2:expirada,3:expirada", "linhas do paciente de c1: 3 expiradas", todas.map((l) => `${l.tentativa}:${l.status}`));

/* ---------------- Fila do admin ---------------- */
const fila = await listarChamadasNaoAtendidas(em(20));
const f1 = fila.find((f) => f.consultaId === "c1");
const f2 = fila.find((f) => f.consultaId === "c2");
verifica(f1 && f1.quem.length === 1 && f1.quem[0].papel === "paciente" && f1.quem[0].motivo === "expirada" && f1.quem[0].em === em(12.4 - 0.1).toISOString(), "fila: c1, paciente não atendeu (3 expiradas), com a hora", f1);
verifica(f2 && f2.quem.length === 1 && f2.quem[0].motivo === "recusada" && f2.quem[0].em === em(5.6).toISOString(), "fila: c2, paciente recusou, com a hora", f2);
await db.eventoConsulta.create({ data: { consultaId: "c1", tipo: "falta_paciente", motivo: "teste", por: "medico", dataAnterior: T0 } }).catch((e) => console.log("(evento)", e.message));
const fila2 = await listarChamadasNaoAtendidas(em(20));
verifica(!fila2.some((f) => f.consultaId === "c1"), "fila: com desfecho (falta) sai da lista");
verifica((await listarChamadasNaoAtendidas(em(25 * 60))).length === 0, "fila: só as últimas 24 h");
sessaoAtual = { id: "pac1", nome: "M", email: "p1@t", role: "PACIENTE", precisaTrocarSenha: false };
verifica((await naoAtendidasRota.GET(new Request("http://x/") as never)).status === 403, "rota da fila: paciente recebe 403");
sessaoAtual = { id: "adm", nome: "A", email: "a@t", role: "ADMIN", precisaTrocarSenha: false };
const rf = await naoAtendidasRota.GET(new Request("http://x/") as never);
verifica(rf.status === 200 && typeof (await rf.json()).total === "number", "rota da fila: admin recebe 200");

/* ---------------- rota do cron ---------------- */
const req = (h?: string) => new Request("http://x/api/cron/toque", { method: "POST", headers: h ? { authorization: h } : {} }) as never;
delete process.env.CRON_SECRET;
verifica((await cron.POST(req("Bearer x"))).status === 503, "cron: sem CRON_SECRET configurado → 503");
process.env.CRON_SECRET = "segredo-de-teste-" + crypto.randomBytes(8).toString("hex");
verifica((await cron.POST(req())).status === 401, "cron: 401 sem segredo");
verifica((await cron.GET(req("Bearer errado"))).status === 401, "cron: 401 com segredo errado");
const rc = await cron.GET(req(`Bearer ${process.env.CRON_SECRET}`));
const jc = await rc.json();
verifica(rc.status === 200 && typeof jc.tocadas === "number" && typeof jc.expiradas === "number", "cron: 200 com o Bearer certo (só contagens)", jc);

/* ---------------- inscrição de push ---------------- */
const aparelho = crypto.createECDH("prime256v1");
aparelho.generateKeys();
const keys = { p256dh: aparelho.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };
const endpoint = "https://fcm.googleapis.com/fcm/send/aparelho-compartilhado";
const reqJson = (method: string, corpo: unknown) =>
  new Request("http://x/api/push/inscricao", { method, headers: { "content-type": "application/json", "user-agent": "teste" }, body: JSON.stringify(corpo) }) as never;

sessaoAtual = null;
verifica((await inscricao.POST(reqJson("POST", { endpoint, keys }))).status === 401, "inscrição: exige login");
sessaoAtual = { id: "pac1", nome: "M", email: "p1@t", role: "PACIENTE", precisaTrocarSenha: false };
verifica((await inscricao.POST(reqJson("POST", { endpoint: "http://fcm.googleapis.com/x", keys }))).status === 400, "inscrição: endpoint http → 400");
verifica((await inscricao.POST(reqJson("POST", { endpoint: "https://evil.example/x", keys }))).status === 400, "inscrição: host fora dos serviços de push → 400");
verifica((await inscricao.POST(reqJson("POST", { endpoint, keys: { p256dh: "x", auth: "y" } }))).status === 400, "inscrição: chaves inválidas → 400");
verifica((await inscricao.POST(reqJson("POST", { endpoint, keys, plataforma: "android" }))).status === 200, "inscrição: paciente inscreve o aparelho");
let ins = await db.pushInscricao.findMany({ where: { endpoint } });
verifica(ins.length === 1 && ins[0].usuarioId === "pac1" && ins[0].plataforma === "android" && ins[0].userAgent === "teste", "inscrição gravada para pac1", ins);
await db.pushInscricao.update({ where: { endpoint }, data: { falhas: 3 } });
sessaoAtual = { id: "med1", nome: "A", email: "m1@t", role: "MEDICO", precisaTrocarSenha: false };
verifica((await inscricao.POST(reqJson("POST", { endpoint, keys }))).status === 200, "inscrição: outra conta no mesmo aparelho");
ins = await db.pushInscricao.findMany({ where: { endpoint } });
verifica(ins.length === 1 && ins[0].usuarioId === "med1" && ins[0].falhas === 0, "upsert por endpoint troca o usuário (e zera falhas)", ins);
sessaoAtual = { id: "pac1", nome: "M", email: "p1@t", role: "PACIENTE", precisaTrocarSenha: false };
const rd = await inscricao.DELETE(reqJson("DELETE", { endpoint }));
verifica(rd.status === 200 && (await rd.json()).apagadas === 0 && (await db.pushInscricao.count({ where: { endpoint } })) === 1, "DELETE de quem não é dono não apaga");
sessaoAtual = { id: "med1", nome: "A", email: "m1@t", role: "MEDICO", precisaTrocarSenha: false };
const rd2 = await inscricao.DELETE(reqJson("DELETE", { endpoint }));
verifica((await rd2.json()).apagadas === 1 && (await db.pushInscricao.count({ where: { endpoint } })) === 0, "DELETE do dono apaga");
const longo = await inscricao.POST(new Request("http://x/", { method: "POST", body: "x".repeat(5000) }) as never);
verifica(longo.status === 413, "inscrição: corpo grande → 413");
process.env.VAPID_PUBLIC_KEY = ""; 
const rg = await (await inscricao.GET()).json();
verifica(rg.ativo === false && rg.chavePublica === null, "GET sem VAPID: push desligado");
const par = crypto.createECDH("prime256v1");
par.generateKeys();
Object.assign(process.env, { VAPID_PUBLIC_KEY: par.getPublicKey().toString("base64url"), VAPID_PRIVATE_KEY: par.getPrivateKey().toString("base64url"), VAPID_SUBJECT: "mailto:t@t" });
const rg2 = await (await inscricao.GET()).json();
verifica(rg2.ativo === true && rg2.chavePublica === process.env.VAPID_PUBLIC_KEY, "GET com VAPID: devolve a chave pública");

/* ---------------- logout apaga a inscrição do aparelho ---------------- */
sessaoAtual = { id: "pac1", nome: "M", email: "p1@t", role: "PACIENTE", precisaTrocarSenha: false };
await inscricao.POST(reqJson("POST", { endpoint, keys }));
const outro = "https://updates.push.services.mozilla.com/wpush/v2/outro";
await inscricao.POST(reqJson("POST", { endpoint: outro, keys }));
verifica((await logout.POST(new Request("http://x/", { method: "POST" }))).status === 200, "logout sem corpo continua funcionando");
verifica((await db.pushInscricao.count({ where: { usuarioId: "pac1" } })) === 2, "logout sem endpoint não apaga nada");
verifica((await logout.POST(new Request("http://x/", { method: "POST", body: "não é json" }))).status === 200, "logout com corpo inválido continua funcionando");
await logout.POST(new Request("http://x/", { method: "POST", body: JSON.stringify({ endpoint }) }));
verifica((await db.pushInscricao.findMany({ where: { usuarioId: "pac1" } })).map((i) => i.endpoint).join() === outro, "logout com endpoint apaga só a inscrição deste aparelho");

/* ---------------- manutenção da inscrição pelo status do push ---------------- */
const cfg = webPush.configVapid()!;
const inscr = { endpoint: outro, p256dh: keys.p256dh, auth: keys.auth };
const st = await webPush.enviarPush(inscr, { tipo: "x" }, { ttl: 60 }, { cfg, fetch: async () => ({ status: 201 }) });
let row = await db.pushInscricao.findUnique({ where: { endpoint: outro } });
verifica(st === 201 && row?.ultimoUsoEm && row.falhas === 0, "push 201: marca ultimoUsoEm");
for (let i = 0; i < 4; i++) await webPush.enviarPush(inscr, {}, { ttl: 60 }, { cfg, fetch: async () => ({ status: 500 }) });
row = await db.pushInscricao.findUnique({ where: { endpoint: outro } });
verifica(row?.falhas === 4, "push 500: incrementa falhas (4)", row?.falhas);
const st0 = await webPush.enviarPush(inscr, {}, { ttl: 60 }, { cfg, fetch: async () => { throw new Error("rede"); } });
verifica(st0 === 0 && (await db.pushInscricao.count({ where: { endpoint: outro } })) === 0, "5ª falha (rede, status 0): apaga a inscrição");
await inscricao.POST(reqJson("POST", { endpoint: outro, keys }));
await webPush.enviarPush(inscr, {}, { ttl: 60 }, { cfg, fetch: async () => ({ status: 410 }) });
verifica((await db.pushInscricao.count({ where: { endpoint: outro } })) === 0, "push 410: apaga na hora");
await inscricao.POST(reqJson("POST", { endpoint: outro, keys }));
await webPush.enviarPush(inscr, {}, { ttl: 60 }, { cfg, fetch: async () => ({ status: 404 }) });
verifica((await db.pushInscricao.count({ where: { endpoint: outro } })) === 0, "push 404: apaga na hora");
// push real do job: payload cifrado que o aparelho consegue ler, TTL até expirar
await inscricao.POST(reqJson("POST", { endpoint: outro, keys }));
let capturado: { headers: Record<string, string>; body: Uint8Array } | null = null;
const n = await webPush.enviarPushParaUsuario("pac1", { tipo: "chamada_tocando" }, { ttl: 90, urgencia: "high" }, {
  cfg,
  fetch: async (_u, init) => { capturado = init as never; return { status: 201 }; },
});
verifica(n === 1 && capturado!.headers.TTL === "90" && capturado!.body.length > 86, "enviarPushParaUsuario: 1 aparelho aceitou, TTL repassado");

/* ---------------- ritmo 0/5/10 com a variação do pg_cron ---------------- */
// Roda o job a cada minuto cheio (de -1 a 16 min) com o disparo deslocado
// por `desvio(min)` segundos e confere em que minuto cada evento saiu.
async function simular(nome: string, desvio: (min: number) => number | null, esperado = { tocou: "0,5,10", expirou: "2,7,12*" }) {
  await limpar();
  await db.user.createMany({
    data: [
      { id: "sp", nome: "Pedro", email: "sp@t", senhaHash: "x", role: "PACIENTE" },
      { id: "sm", nome: "Dra. Sara", email: "sm@t", senhaHash: "x", role: "MEDICO" },
    ],
  });
  await db.consulta.create({ data: { id: "cs", pacienteId: "sp", medicoId: "sm", especialidade: "Clínica", dataInicio: T0, status: "confirmada", valor: 150 } });
  const tocou: number[] = [];
  const expirou: string[] = [];
  for (let m = -1; m <= 16; m++) {
    zerar();
    const d = desvio(m);
    if (d === null) continue; // job fora do ar neste minuto
    await rodar(new Date(em(m).getTime() + d * 1000));
    for (const e of eventos) {
      if (e.usuarioId !== "sp") continue;
      if (e.evento === "chamada_tocando") tocou.push(m);
      if (e.evento === "chamada_expirada") expirou.push(`${m}${e.payload.ultima ? "*" : ""}`);
    }
  }
  verifica(tocou.join() === esperado.tocou && expirou.join() === esperado.expirou, `ritmo com cron ${nome}: toca ${esperado.tocou}, expira ${esperado.expirou} (* = ultima)`, { tocou, expirou });
}
let semente = 42;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1; // [-1, 1)
await simular("pontual", () => 0);
await simular("0,3 s adiantado", () => -0.3);
await simular("0,3 s atrasado", () => 0.3);
await simular("±0,3 s alternado", (m) => (m % 2 ? 0.3 : -0.3));
await simular("3 s adiantado", () => -3);
await simular("3 s atrasado", () => 3);
await simular("±3 s alternado", (m) => (m % 2 ? 3 : -3));
await simular("∓3 s alternado", (m) => (m % 2 ? -3 : 3));
await simular("±3 s aleatório", () => 3 * aleatorio());
// Job fora do ar no horário (volta aos 2,5 min): toca quando volta, sem ancorar
// no horário nominal, e mantém 5 min entre toques; a 3ª ainda cabe na janela de 15 min.
await simular("fora do ar até 2 min (volta 30 s atrasado)", (m) => (m <= 1 ? null : 30), { tocou: "2,7,12", expirou: "4,9,14*" });

await limpar();
await db.$disconnect();
console.log(`\n${okN} ok, ${falhaN} falha(s)`);
if (falhaN) process.exit(1);

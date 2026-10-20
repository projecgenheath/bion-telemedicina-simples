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
type Push = { usuarioId: string; payload: Record<string, unknown>; opcoes: { ttl: number; urgencia: string; timeoutMs: number } };
let eventos: Ev[] = [];
let pushes: Push[] = [];
const dep = {
  enviarEvento: async (usuarioId: string, evento: string, payload: Record<string, unknown>) => { eventos.push({ usuarioId, evento, payload }); },
  enviarPush: async (usuarioId: string, payload: Record<string, unknown>, opcoes: { ttl: number; urgencia: string; timeoutMs: number }) => { pushes.push({ usuarioId, payload, opcoes }); return 1; },
};
const zerar = () => { eventos = []; pushes = []; };
const rodar = (t: Date) => rodarToque(t, dep as never);

async function limpar() {
  await db.chamadaConsulta.deleteMany();
  await db.pushInscricao.deleteMany();
  await db.presencaSala.deleteMany();
  await db.eventoConsulta.deleteMany();
  await db.chatConsulta.deleteMany(); // FK Restrict: o chat vai antes da Consulta
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
verifica(Object.keys(evP?.payload ?? {}).sort().join() === "consultaId,contraparte,especialidade,expiraEm,inicioEm,tentativa", "evento: só os 6 campos do contrato");
verifica(evP?.payload.inicioEm === T0.toISOString(), "evento: inicioEm = horário marcado da consulta (ISO)", evP?.payload.inicioEm);
const evM = eventos.find((e) => e.usuarioId === "med1" && e.evento === "chamada_tocando");
verifica(evM?.payload.contraparte === "Maria", "evento do médico: contraparte = primeiro nome do paciente", evM);
verifica(!eventos.some((e) => e.usuarioId === "med2"), "para quem entrou na sala (médico de c2): não toca");
verifica(!eventos.some((e) => ["c3", "c4", "c5"].includes(String(e.payload.consultaId))), "não toca cancelada, futura nem com mais de 15 min");
const pP = pushes.find((p) => p.usuarioId === "pac1");
verifica(
  pP && JSON.stringify(Object.keys(pP.payload).sort()) === JSON.stringify(["consultaId", "corpo", "expiraEm", "inicioEm", "tentativa", "tipo", "titulo", "url"]) &&
    pP.payload.inicioEm === T0.toISOString() &&
    pP.payload.tipo === "chamada_tocando" && pP.payload.url === "/consulta?consulta=c1" && pP.payload.titulo === TITULO_PUSH,
  "push: {tipo, consultaId, tentativa, inicioEm, expiraEm, url, titulo, corpo}",
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
// Entrou na sala durante o 3º toque sem atender: a linha expira normal, mas não conta para a Fila.
await db.presencaSala.create({ data: { consultaId: "c1", usuarioId: "pac1", papel: "PACIENTE", ultimoPing: em(11), entrouEm: em(11) } });
verifica((await linhas("c1", "pac1")).map((l) => l.status).join() === "expirada,expirada,expirada", "entrou na sala no 3º toque: as linhas continuam expiradas");
verifica(!(await listarChamadasNaoAtendidas(em(20))).some((f) => f.consultaId === "c1"), "fila: quem entrou na sala da consulta não aparece como 'não atendeu'");
// presença em OUTRA consulta não tira da fila
await db.presencaSala.update({ where: { consultaId_usuarioId: { consultaId: "c1", usuarioId: "pac1" } }, data: { consultaId: "c4" } });
verifica((await listarChamadasNaoAtendidas(em(20))).some((f) => f.consultaId === "c1"), "fila: presença em outra consulta não conta");
await db.presencaSala.deleteMany({ where: { usuarioId: "pac1" } });
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

/* ---------------- médico atendendo outra consulta ---------------- */
await limpar();
await db.user.createMany({
  data: [
    { id: "xp1", nome: "Lucas", email: "xp1@t", senhaHash: "x", role: "PACIENTE" },
    { id: "xp2", nome: "Bia", email: "xp2@t", senhaHash: "x", role: "PACIENTE" },
    { id: "xm", nome: "Dr. Caio", email: "xm@t", senhaHash: "x", role: "MEDICO" },
  ],
});
await db.consulta.createMany({
  data: [
    // a anterior, ainda em andamento (o médico está na sala dela)
    { id: "xa", pacienteId: "xp1", medicoId: "xm", especialidade: "Clínica", dataInicio: em(-30), status: "confirmada", valor: 150 },
    { id: "xb", pacienteId: "xp2", medicoId: "xm", especialidade: "Clínica", dataInicio: T0, status: "confirmada", valor: 150 },
  ],
});
await db.presencaSala.create({ data: { consultaId: "xa", usuarioId: "xm", papel: "MEDICO", ultimoPing: em(0.2 - 0.1), entrouEm: em(-30) } });
zerar();
let ro = await rodar(em(0.2));
verifica(!eventos.some((e) => e.usuarioId === "xm") && (await linhas("xb", "xm")).length === 0, "médico em outra sala (sinal há 6 s): não toca e não grava linha", ro);
verifica(eventos.some((e) => e.usuarioId === "xp2" && e.evento === "chamada_tocando") && ro.medicoOcupado === 1, "paciente da consulta seguinte toca normal");
// ainda na outra sala no minuto seguinte (sinal há 20 s)
await db.presencaSala.update({ where: { consultaId_usuarioId: { consultaId: "xa", usuarioId: "xm" } }, data: { ultimoPing: em(1.2 - 20 / 60) } });
zerar();
await rodar(em(1.2));
verifica(!eventos.some((e) => e.usuarioId === "xm"), "médico ainda na outra sala (20 s): continua sem toque");
// saiu da outra sala (último sinal há 50 s, acima da janela de presença)
zerar();
await rodar(em(2.03));
verifica(eventos.some((e) => e.usuarioId === "xm" && e.evento === "chamada_tocando" && e.payload.tentativa === 1 && e.payload.consultaId === "xb"), "médico saiu da outra sala: recebe a 1ª tentativa no minuto seguinte", eventos);
verifica((await linhas("xb", "xm")).length === 1, "agora grava a linha do médico");
// presença na PRÓPRIA consulta não conta como "outra sala" (é o caso "entrou na sala")
verifica(!toque.proximaTentativa({ agora: em(2), dataInicio: T0, entrouNaSala: true, chamadas: [] }), "presença na própria sala continua sendo 'entrou' (não toca)");

/* ---------------- orçamento: pushes e broadcasts lentos ---------------- */
// fetch global falso (o push real passa por ele): responde 201 depois de
// `atrasoFetch` ms e respeita o AbortSignal do timeout, como o fetch de verdade.
const fetchOriginal = globalThis.fetch;
let atrasoFetch = 4_000;
let fetchChamadas = 0;
let fetchSimult = 0;
let fetchMaxSimult = 0;
let fetchAbortados = 0;
globalThis.fetch = ((_u: unknown, init?: RequestInit) =>
  new Promise<Response>((resolve, reject) => {
    fetchChamadas++;
    fetchSimult++;
    fetchMaxSimult = Math.max(fetchMaxSimult, fetchSimult);
    let fim = false;
    const t = setTimeout(() => { if (fim) return; fim = true; fetchSimult--; resolve(new Response(null, { status: 201 })); }, atrasoFetch);
    init?.signal?.addEventListener(
      "abort",
      () => {
        if (fim) return;
        fim = true;
        clearTimeout(t);
        fetchSimult--;
        fetchAbortados++;
        reject(new DOMException("tempo esgotado", "TimeoutError"));
      },
      { once: true },
    );
  })) as typeof fetch;
const zerarFetch = (atraso: number) => { atrasoFetch = atraso; fetchChamadas = 0; fetchSimult = 0; fetchMaxSimult = 0; fetchAbortados = 0; };

/** n consultas às 10:00, cada participante com `aparelhos` inscrições de push. */
async function cenario(n: number, aparelhos: number) {
  await limpar();
  for (let i = 0; i < n; i++) {
    await db.user.createMany({
      data: [
        { id: `op${i}`, nome: `Paciente ${i}`, email: `op${i}@t`, senhaHash: "x", role: "PACIENTE" },
        { id: `om${i}`, nome: `Médico ${i}`, email: `om${i}@t`, senhaHash: "x", role: "MEDICO" },
      ],
    });
    await db.consulta.create({ data: { id: `oc${i}`, pacienteId: `op${i}`, medicoId: `om${i}`, especialidade: "Clínica", dataInicio: T0, status: "confirmada", valor: 150 } });
    for (const u of [`op${i}`, `om${i}`]) {
      for (let k = 0; k < aparelhos; k++) {
        await db.pushInscricao.create({ data: { usuarioId: u, endpoint: `https://fcm.googleapis.com/fcm/send/${u}-${k}`, p256dh: keys.p256dh, auth: keys.auth } });
      }
    }
  }
}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Broadcast gravado (com atraso opcional) — o push vai pelo caminho REAL (enviarPushParaUsuario). */
function depLento(atrasoBroadcast: (i: number) => number) {
  let i = 0;
  return {
    enviarEvento: async (usuarioId: string, evento: string, payload: Record<string, unknown>) => {
      await espera(atrasoBroadcast(i++));
      eventos.push({ usuarioId, evento, payload });
    },
  };
}
/** Toda linha gravada tem o broadcast correspondente (mesmo usuário, consulta e tentativa)? */
async function linhasSemBroadcast() {
  const ls = await db.chamadaConsulta.findMany({ select: { consultaId: true, paraUsuarioId: true, tentativa: true } });
  return ls.filter(
    (l) => !eventos.some((e) => e.evento === "chamada_tocando" && e.usuarioId === l.paraUsuarioId && e.payload.consultaId === l.consultaId && e.payload.tentativa === l.tentativa),
  ).length;
}

// A) 6 consultas × 2 participantes × 3 aparelhos, cada push leva 4 s.
await cenario(6, 3);
zerar();
zerarFetch(4_000);
let ini = Date.now();
let rr = await rodarToque(em(0.2), depLento(() => 0) as never);
let ms = Date.now() - ini;
verifica(rr.tocadas === 12 && !rr.incompleto, "push lento (4 s): os 12 participantes tocam na mesma rodada", rr);
verifica(ms < toque.ORCAMENTO_MS, `push lento (4 s × 36 aparelhos): a rodada termina antes do orçamento (${ms} ms < ${toque.ORCAMENTO_MS})`);
verifica(fetchChamadas === 36 && fetchMaxSimult === 36, "pushes de todos os aparelhos e consultas em paralelo", { fetchChamadas, fetchMaxSimult });
verifica(rr.push === 12 && (await db.chamadaConsulta.count({ where: { pushEnviado: true } })) === 12, "push lento dentro do limite: pushEnviado marcado", rr);
verifica((await linhasSemBroadcast()) === 0, "nenhuma linha gravada sem broadcast (push lento)");

// B) push que não responde (8 s): cada um é cortado em min(5 s, restante − 1 s).
await cenario(3, 2);
zerar();
zerarFetch(8_000);
ini = Date.now();
rr = await rodarToque(em(0.2), depLento(() => 0) as never);
ms = Date.now() - ini;
verifica(ms < toque.ORCAMENTO_MS && ms >= 4_000, `push travado: cortado pelo timeout e a rodada termina antes do orçamento (${ms} ms)`);
verifica(fetchAbortados === 12 && rr.push === 0, "push travado: os 12 POSTs abortados, nenhum conta como enviado", { fetchAbortados, rr });
verifica(rr.tocadas === 6 && (await db.chamadaConsulta.count({ where: { status: "tocando" } })) === 6 && (await linhasSemBroadcast()) === 0, "push travado: as linhas continuam tocando, com broadcast");

// C) broadcast lento (1 s cada): para de gravar quando não cabe mais, e o resto toca no minuto seguinte.
await cenario(6, 1);
zerar();
zerarFetch(50);
const rodadas: ResultadoRodada[] = [];
type ResultadoRodada = { tocadas: number; incompleto: boolean; ms: number };
for (let m = 0; m < 5; m++) {
  ini = Date.now();
  const x = await rodarToque(new Date(em(0.2).getTime() + m * MIN), depLento(() => 1_000) as never);
  rodadas.push({ tocadas: x.tocadas, incompleto: x.incompleto, ms: Date.now() - ini });
  if (!x.incompleto) break;
}
verifica(rodadas[0].incompleto && rodadas[0].tocadas > 0 && rodadas[0].tocadas < 12, "broadcast lento: a 1ª rodada para no meio (orçamento) sem gravar o resto", rodadas);
verifica(rodadas.every((x) => x.ms < toque.ORCAMENTO_MS), "broadcast lento: toda rodada termina antes do orçamento", rodadas.map((x) => x.ms));
verifica(rodadas.reduce((a, x) => a + x.tocadas, 0) === 12 && !rodadas[rodadas.length - 1].incompleto, "broadcast lento: quem ficou de fora toca nas rodadas seguintes (12 no total)", rodadas);
const t1 = await db.chamadaConsulta.groupBy({ by: ["paraUsuarioId"], _count: { _all: true } });
verifica(t1.length === 12 && t1.every((g) => g._count._all === 1), "broadcast lento: uma tentativa por participante, sem duplicar");
verifica((await linhasSemBroadcast()) === 0, "broadcast lento: nenhuma linha gravada sem broadcast");

// D) broadcasts de 3,2 s: o 2º participante ainda cabe, mas não sobra tempo para push → pula o push, mantém a linha.
await cenario(1, 1);
zerar();
zerarFetch(50);
ini = Date.now();
rr = await rodarToque(em(0.2), depLento(() => 3_200) as never);
ms = Date.now() - ini;
verifica(rr.tocadas === 2 && rr.pushPulados === 2 && fetchChamadas === 0, "sem orçamento para o push: pula o push (registra) e não chama o serviço", rr);
verifica((await db.chamadaConsulta.count({ where: { status: "tocando", pushEnviado: false } })) === 2 && (await linhasSemBroadcast()) === 0, "push pulado: a linha fica tocando, com broadcast");
verifica(ms < toque.ORCAMENTO_MS, `push pulado: a rodada termina antes do orçamento (${ms} ms)`);

// E) prazo ABSOLUTO com findMany das inscrições lento (pool/banco): o POST só sai se ainda couber.
const insc = db.pushInscricao as unknown as { findMany: (...a: unknown[]) => Promise<unknown> };
const findManyOriginal = insc.findMany;
let atrasoFindMany = 0;
insc.findMany = async (...a: unknown[]) => {
  await espera(atrasoFindMany);
  return findManyOriginal.apply(db.pushInscricao, a);
};
await cenario(1, 1);
zerar();
zerarFetch(50);
atrasoFindMany = 6_200; // sobra < 500 ms + margem quando as inscrições chegam
ini = Date.now();
rr = await rodarToque(em(0.2), depLento(() => 0) as never);
ms = Date.now() - ini;
verifica(fetchChamadas === 0 && rr.push === 0, "findMany lento (6,2 s): não chama o serviço depois de ler as inscrições", { fetchChamadas, rr });
verifica(ms <= toque.ORCAMENTO_MS + 300, `findMany lento (6,2 s): a rodada termina no prazo absoluto (${ms} ms)`);
verifica((await db.chamadaConsulta.count({ where: { status: "tocando", pushEnviado: false, canal: "realtime" } })) === 2, "findMany lento: linha fica tocando e livre para reenvio");
await cenario(1, 1);
zerar();
zerarFetch(8_000); // serviço travado (respeita abort)
atrasoFindMany = 3_000;
ini = Date.now();
rr = await rodarToque(em(0.2), depLento(() => 0) as never);
ms = Date.now() - ini;
verifica(fetchChamadas === 2 && fetchAbortados === 2 && ms <= toque.ORCAMENTO_MS, `findMany 3 s + push travado: timeout do fetch = prazo − agora − margem, a rodada termina antes do prazo (${ms} ms)`, { fetchChamadas, fetchAbortados });
atrasoFindMany = 9_000; // findMany que passa do prazo: o Promise.race corta
await cenario(1, 1);
zerar();
zerarFetch(50);
ini = Date.now();
rr = await rodarToque(em(0.2), depLento(() => 0) as never);
ms = Date.now() - ini;
verifica(rr.pushCortados === 2 && fetchChamadas === 0, "findMany que passa do prazo: cortado pelo timer do prazo (registrado)", rr);
verifica(ms <= toque.ORCAMENTO_MS + 300, `findMany que passa do prazo: a rodada termina no prazo absoluto (${ms} ms)`);
await espera(2_200); // deixa os findMany cortados terminarem antes de limpar o banco
insc.findMany = findManyOriginal;
const semTempo = await webPush.enviarPushParaUsuario("op0", { tipo: "chamada_tocando" }, { ttl: 60, timeoutMs: 5_000, prazo: Date.now() + 1_300 });
verifica(semTempo === 0 && fetchChamadas === 0, "enviarPushParaUsuario com prazo a 1,3 s (< 500 ms + margem): não envia", { semTempo, fetchChamadas });

// F) push que trava e IGNORA o abort: o Promise.race contra o prazo corta.
await cenario(2, 1);
zerar();
let travados = 0;
globalThis.fetch = (() => { travados++; return new Promise<Response>(() => {}); }) as unknown as typeof fetch;
ini = Date.now();
rr = await rodarToque(em(0.2), depLento(() => 0) as never);
ms = Date.now() - ini;
verifica(travados === 4 && rr.pushCortados === 4 && rr.push === 0, "push que ignora o abort: os 4 cortados no prazo absoluto", { travados, rr });
verifica(ms >= toque.ORCAMENTO_MS - 200 && ms <= toque.ORCAMENTO_MS + 300, `push que ignora o abort: a rodada termina no prazo (${ms} ms ≈ ${toque.ORCAMENTO_MS})`);
verifica(rr.tocadas === 4 && (await linhasSemBroadcast()) === 0, "push cortado: linhas tocando, com broadcast");

// G) dep.enviarPush lento (pool cheio): recebe o prazo absoluto e é cortado nele.
await cenario(1, 1);
zerar();
const prazos: number[] = [];
ini = Date.now();
rr = await rodarToque(em(0.2), {
  enviarEvento: dep.enviarEvento,
  enviarPush: async (_u: string, _p: unknown, o: { prazo: number }) => { prazos.push(o.prazo); await espera(9_000); return 1; },
} as never);
ms = Date.now() - ini;
verifica(prazos.length === 2 && prazos.every((p) => Math.abs(p - (ini + toque.ORCAMENTO_MS)) < 200), "enviarPush recebe prazo = t0 + ORCAMENTO_MS", prazos.map((p) => p - ini));
verifica(rr.pushCortados === 2 && ms <= toque.ORCAMENTO_MS + 300, `enviarPush lento (9 s): cortado no prazo (${ms} ms)`, rr);
await espera(2_200);

globalThis.fetch = fetchOriginal;

/* ---------------- reenvio do push que não chegou ---------------- */
await cenario(1, 1);
zerar();
let aceitar = 0; // 0 = nenhum aparelho aceitou
const depReenvio = {
  enviarEvento: dep.enviarEvento,
  enviarPush: async (usuarioId: string, payload: Record<string, unknown>, opcoes: { ttl: number; urgencia: string; timeoutMs: number }) => {
    pushes.push({ usuarioId, payload, opcoes });
    return aceitar;
  },
};
const rodarR = (t: Date) => rodarToque(t, depReenvio as never);
await rodarR(em(0.2)); // toca; push falha nos dois participantes
const originais = pushes.filter((p) => p.usuarioId === "op0");
verifica(originais.length === 1 && (await db.chamadaConsulta.count({ where: { pushEnviado: false } })) === 2, "push falhou: linha tocando com pushEnviado = false");
pushes = [];
eventos = [];
const rR = await rodarR(em(1.2)); // 60 s antes de expirar (expira 2,2)
const reenviado = pushes.filter((p) => p.usuarioId === "op0");
verifica(rR.reenvios === 2 && reenviado.length === 1, "reenvia o push na rodada seguinte", rR);
verifica(JSON.stringify(reenviado[0]?.payload) === JSON.stringify(originais[0]?.payload), "payload reenviado é IDÊNTICO ao original (tentativa, inicioEm, expiraEm…)", { original: originais[0]?.payload, reenviado: reenviado[0]?.payload });
verifica(reenviado[0]?.payload.tentativa === 1 && reenviado[0]?.payload.expiraEm === em(2.2).toISOString() && reenviado[0]?.payload.inicioEm === T0.toISOString(), "reenvio: mesma tentativa, mesmo expiraEm e inicioEm");
verifica(reenviado[0] && reenviado[0].opcoes.ttl >= 59 && reenviado[0].opcoes.ttl <= 60, "reenvio: TTL = segundos até expiraEm (~60)", reenviado[0]?.opcoes);
verifica(!eventos.some((e) => e.evento === "chamada_tocando") && (await db.chamadaConsulta.count()) === 2, "reenvio não repete o broadcast nem cria linha");
pushes = [];
const rR2 = await rodarR(em(1.4));
verifica(pushes.length === 0 && rR2.reenvios === 0, "no máximo um reenvio por toque (linha reivindicada como 'reenvio')", rR2);
await db.chamadaConsulta.updateMany({ data: { canal: "realtime" } });
pushes = [];
aceitar = 1;
await rodarR(em(1.5)); // agora o serviço aceita
verifica(pushes.length === 2 && (await db.chamadaConsulta.count({ where: { pushEnviado: true } })) === 2, "reenvio aceito: marca pushEnviado");
pushes = [];
await rodarR(em(1.7));
verifica(pushes.length === 0, "push já entregue: não reenvia mais");
await db.chamadaConsulta.updateMany({ data: { pushEnviado: false, canal: "realtime" } });
pushes = [];
await rodarR(new Date(em(2.2).getTime() - 15_000)); // faltam 15 s
verifica(pushes.length === 0, "faltando menos de 20 s para expirar: não reenvia");
pushes = [];
await rodarR(new Date(em(2.2).getTime() - 21_000)); // faltam 21 s
verifica(pushes.length === 2 && pushes.every((p) => p.opcoes.ttl <= 21), "faltando 21 s: ainda reenvia, com TTL ≤ 21 s", pushes.map((p) => p.opcoes.ttl));
await db.consulta.update({ where: { id: "oc0" }, data: { status: "cancelada" } });
await db.chamadaConsulta.updateMany({ data: { pushEnviado: false, canal: "realtime" } });
pushes = [];
await rodarR(em(1.3));
verifica(pushes.length === 0, "consulta cancelada: não reenvia");

/* ---- reenvios: limite por rodada, ordem por expiraEm, corrida entre rodadas ---- */
await cenario(1, 0);
zerar();
await db.chamadaConsulta.createMany({
  data: Array.from({ length: 60 }, (_, k) => ({
    consultaId: "oc0",
    paraUsuarioId: "op0",
    tentativa: k + 1,
    papel: "paciente",
    status: "tocando",
    canal: "realtime",
    pushEnviado: false,
    tocouEm: em(0),
    expiraEm: new Date(em(1.5).getTime() + (59 - k) * 1_000), // tentativa 60 expira antes
  })),
});
pushes = [];
aceitar = 1;
const rL = await rodarR(em(1));
pushes = pushes.filter((p) => p.usuarioId === "op0"); // o médico (sem linha) toca normalmente
const tentReenviadas = pushes.map((p) => p.payload.tentativa as number).sort((a, b) => a - b);
verifica(rL.reenvios === toque.REENVIO_MAX && pushes.length === 50, "reenvios limitados a 50 por rodada", { reenvios: rL.reenvios, pushes: pushes.length });
verifica(tentReenviadas[0] === 11 && tentReenviadas[49] === 60, "reenvia os 50 que expiram antes (expiraEm asc)", tentReenviadas.slice(0, 3));
verifica((await db.chamadaConsulta.count({ where: { canal: "realtime", pushEnviado: false } })) === 10, "os 10 menos urgentes ficam para a rodada seguinte");
pushes = [];
await rodarR(em(1.05));
pushes = pushes.filter((p) => p.usuarioId === "op0");
verifica(pushes.length === 10, "rodada seguinte reenvia os 10 restantes", pushes.length);

// Duas rodadas simultâneas: o mesmo reenvio sai uma vez só.
await cenario(1, 0);
zerar();
aceitar = 0;
await rodarR(em(0.2)); // toca; push falha (2 linhas livres)
pushes = [];
const [s1, s2] = await Promise.all([rodarR(em(1.2)), rodarR(em(1.2))]);
verifica(pushes.length === 2 && s1.reenvios + s2.reenvios === 2 && new Set(pushes.map((p) => p.usuarioId)).size === 2, "duas rodadas simultâneas: cada linha reenviada uma vez só", { pushes: pushes.length, s1: s1.reenvios, s2: s2.reenvios });

// Push original ainda em voo (rodada lenta) bloqueia o reenvio da rodada sobreposta.
await cenario(1, 0);
zerar();
let liberar: () => void = () => {};
const emVoo = new Promise<void>((r) => { liberar = r; });
const lenta = rodarToque(em(0.2), {
  enviarEvento: dep.enviarEvento,
  enviarPush: async (u: string, payload: Record<string, unknown>, opcoes: unknown) => { pushes.push({ usuarioId: u, payload, opcoes } as never); await emVoo; return 1; },
} as never);
await espera(300);
pushes = [];
const sob = await rodarR(new Date(em(0.2).getTime() + 10_000)); // rodada sobreposta de verdade: < 15 s depois
verifica(sob.reenvios === 0 && pushes.length === 0, "push original em voo (< 15 s): rodada sobreposta não reenvia", sob);
liberar();
const rLenta = await lenta;
verifica(rLenta.push === 2 && (await db.chamadaConsulta.count({ where: { pushEnviado: true, canal: "ambos" } })) === 2, "push original em voo termina e marca ambos", rLenta);

// Linha órfã presa em "push" (rodada morreu / push cortado no prazo): reenviada UMA vez depois de 15 s.
async function linhaPresa() {
  await cenario(1, 0);
  zerar();
  await db.chamadaConsulta.create({
    data: { consultaId: "oc0", paraUsuarioId: "op0", papel: "paciente", tentativa: 1, status: "tocando", canal: "push", pushEnviado: false, tocouEm: em(1), expiraEm: em(3) },
  });
}
const linhaOp0 = () => db.chamadaConsulta.findFirst({ where: { paraUsuarioId: "op0", tentativa: 1 }, select: { canal: true, pushEnviado: true } });
const pushesOp0 = () => pushes.filter((p) => p.usuarioId === "op0");
await linhaPresa();
aceitar = 0;
pushes = [];
const rP1 = await rodarR(new Date(em(1).getTime() + 10_000));
verifica(pushesOp0().length === 0 && rP1.reenvios === 0 && (await linhaOp0())?.canal === "push", "linha em 'push' há 10 s (< 15 s): não é reivindicada", rP1);
pushes = [];
const rP2 = await rodarR(new Date(em(1).getTime() + 16_000));
verifica(pushesOp0().length === 1 && rP2.reenvios === 1 && (await linhaOp0())?.canal === "reenvio", "linha órfã em 'push' há 16 s: reenviada uma vez (vira 'reenvio')", { rP2, linha: await linhaOp0() });
verifica(pushesOp0()[0]?.payload.tentativa === 1 && pushesOp0()[0]?.payload.expiraEm === em(3).toISOString(), "reenvio da órfã: mesmo payload (tentativa, expiraEm)", pushesOp0()[0]?.payload);
pushes = [];
const rP3 = await rodarR(new Date(em(1).getTime() + 40_000));
// (o médico, tocado na rodada de +10 s com push falho, é reenviado normalmente aqui — só olhamos o paciente)
verifica(pushesOp0().length === 0 && (await linhaOp0())?.canal === "reenvio", "linha órfã já reenviada: não reenvia de novo (limite de 1)", rP3);
await linhaPresa();
aceitar = 1;
pushes = [];
const [o1, o2] = await Promise.all([rodarR(new Date(em(1).getTime() + 20_000)), rodarR(new Date(em(1).getTime() + 20_000))]);
verifica(pushesOp0().length === 1 && o1.reenvios + o2.reenvios === 1 && (await linhaOp0())?.canal === "ambos", "órfã com duas rodadas simultâneas: reenviada uma vez só e marca ambos", { o1: o1.reenvios, o2: o2.reenvios });
await db.chamadaConsulta.updateMany({ where: { paraUsuarioId: "op0" }, data: { canal: "reenvio", pushEnviado: false, tocouEm: em(0) } });
pushes = [];
await rodarR(em(1.5));
verifica(pushesOp0().length === 0, "linha em 'reenvio' continua fora do reenvio");

// Usuário sem nenhum aparelho inscrito: a linha vira "sem_inscricao" e não é reivindicada de novo.
await cenario(1, 0); // ninguém tem inscrição; push pelo caminho REAL (enviarPushParaUsuario)
zerar();
let fetchSemInsc = 0;
globalThis.fetch = (async () => { fetchSemInsc++; return new Response(null, { status: 201 }); }) as unknown as typeof fetch;
const rS1 = await rodarToque(em(0.2), depLento(() => 0) as never);
const canaisS = (await db.chamadaConsulta.findMany({ select: { canal: true, status: true } }));
verifica(rS1.tocadas === 2 && rS1.semInscricao === 2 && rS1.push === 0 && fetchSemInsc === 0, "sem aparelho inscrito: não chama o serviço, conta semInscricao", rS1);
verifica(canaisS.length === 2 && canaisS.every((c) => c.canal === "sem_inscricao" && c.status === "tocando"), "sem aparelho inscrito: linha marcada 'sem_inscricao' (não volta para realtime), segue tocando", canaisS);
const rS2 = await rodarToque(em(1.2), depLento(() => 0) as never);
verifica(rS2.reenvios === 0 && rS2.semInscricao === 0 && fetchSemInsc === 0, "rodada seguinte: 'sem_inscricao' não é reivindicada para reenvio", rS2);
const sem = await webPush.enviarPushParaUsuario("op0", { tipo: "chamada_tocando" }, { ttl: 60 });
verifica(sem === webPush.SEM_INSCRICAO, "enviarPushParaUsuario sem inscrição devolve SEM_INSCRICAO", sem);
const rS3 = await rodarToque(em(2.3), depLento(() => 0) as never);
verifica(rS3.expiradas === 2 && (await db.chamadaConsulta.count({ where: { status: "expirada", canal: "sem_inscricao" } })) === 2, "linha 'sem_inscricao' expira normalmente", rS3);
globalThis.fetch = fetchOriginal;

/* ---------------- evolução pendente do médico ---------------- */
// Médico com Evolução em rascunho de OUTRA consulta: não toca para ele nem cria
// a linha dele; o paciente toca normal (linha, evento e push). Rascunho da
// PRÓPRIA consulta não bloqueia; concluída, o médico volta a tocar.
await limpar();
await db.user.createMany({
  data: [
    { id: "ep1", nome: "Paula Dias", email: "ep1@t", senhaHash: "x", role: "PACIENTE" },
    { id: "ep0", nome: "Rui", email: "ep0@t", senhaHash: "x", role: "PACIENTE" },
    { id: "em1", nome: "Dra. Eva", email: "em1@t", senhaHash: "x", role: "MEDICO" },
    { id: "ep2", nome: "Lia", email: "ep2@t", senhaHash: "x", role: "PACIENTE" },
    { id: "em2", nome: "Dr. Leo", email: "em2@t", senhaHash: "x", role: "MEDICO" },
  ],
});
await db.consulta.createMany({
  data: [
    { id: "ce0", pacienteId: "ep0", medicoId: "em1", especialidade: "Clínica", dataInicio: em(-120), status: "concluida", valor: 150 },
    { id: "ce1", pacienteId: "ep1", medicoId: "em1", especialidade: "Clínica", dataInicio: T0, status: "confirmada", pago: true, valor: 150 },
    { id: "ce2", pacienteId: "ep2", medicoId: "em2", especialidade: "Clínica", dataInicio: T0, status: "confirmada", pago: true, valor: 150 },
  ],
});
await db.evolucao.create({ data: { id: "ev0", consultaId: "ce0", medicoId: "em1", pacienteId: "ep0", status: "rascunho" } });
zerar();
const rE1 = await rodar(em(0.2));
verifica(rE1.medicoEvolucaoPendente === 1 && rE1.tocadas === 3, "evolução pendente: pula só o médico com rascunho (3 toques: ep1, ep2, em2)", rE1);
verifica((await linhas("ce1", "em1")).length === 0 && !eventos.some((e) => e.usuarioId === "em1") && !pushes.some((x) => x.usuarioId === "em1"), "médico com rascunho de outra consulta: sem linha, sem evento, sem push");
verifica((await linhas("ce1", "ep1")).length === 1 && eventos.some((e) => e.usuarioId === "ep1" && e.evento === "chamada_tocando" && e.payload.consultaId === "ce1") && pushes.some((x) => x.usuarioId === "ep1"), "paciente do médico com rascunho: linha, evento chamada_tocando e push");
verifica((await linhas("ce2", "ep2")).length === 1 && (await linhas("ce2", "em2")).length === 1 && pushes.some((x) => x.usuarioId === "em2"), "sem rascunho: paciente e médico tocam");
// Rascunho da PRÓPRIA consulta (a evolução de ce0 concluída, a de ce1 aberta): não bloqueia.
await db.evolucao.update({ where: { id: "ev0" }, data: { status: "concluida", concluidaEm: em(4) } });
await db.evolucao.create({ data: { consultaId: "ce1", medicoId: "em1", pacienteId: "ep1", status: "rascunho" } });
zerar();
const rE2 = await rodar(em(5.2));
verifica(rE2.medicoEvolucaoPendente === 0 && (await linhas("ce1", "em1")).length === 1 && eventos.some((e) => e.usuarioId === "em1" && e.evento === "chamada_tocando"), "evolução concluída e rascunho da própria consulta: o médico volta a tocar", rE2);

await limpar();
await db.$disconnect();
console.log(`\n${okN} ok, ${falhaN} falha(s)`);
if (falhaN) process.exit(1);

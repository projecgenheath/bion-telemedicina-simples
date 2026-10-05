/**
 * Teste da chave PIX de recebimento do médico (src/lib/server/recebimento.ts)
 * e, opcionalmente, da rota GET/PUT /api/medico/recebimento num Postgres
 * LOCAL descartável (nunca produção).
 *
 * Rodar só os testes puros:
 *   bun scripts/teste_recebimento.ts
 * Com a rota (banco local com `prisma db push` + a migração 20261003 aplicada):
 *   TESTE_RECEBIMENTO_DB=postgresql://postgres@127.0.0.1:55439/bion bun scripts/teste_recebimento.ts
 * O script RECUSA URLs que não sejam de 127.0.0.1/localhost.
 */
import {
  cpfValido,
  mascararAleatoria,
  mascararChavePix,
  mascararCnpj,
  mascararCpf,
  mascararDocumento,
  mascararEmail,
  mascararTelefone,
  normalizarChaveAleatoria,
  normalizarEmailPix,
  normalizarTelefonePix,
  normalizarTitularNome,
  recebimentoIgual,
  recebimentoWire,
  resumoChaveMascarada,
  validarRecebimento,
} from "../src/lib/server/recebimento";
import { cnpjValido } from "../src/components/bion/medico/dados-pessoais";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}
const val = (r: { ok: true; valor: unknown } | { ok: false; erro: string; campo?: string }) =>
  r.ok ? r.valor : `erro:${r.campo ?? ""}`;

const CPF = "52998224725"; // válido
const CPF2 = "11144477735"; // válido
const CNPJ = "11222333000181"; // válido (numérico)
const CNPJ_ALFA = "12ABC34501DE35"; // válido (alfanumérico)
const UUID = "123e4567-e89b-42d3-a456-426614174000";

/* ---------- CPF ---------- */
igual("CPF válido", cpfValido(CPF), true);
igual("CPF válido 2", cpfValido(CPF2), true);
igual("CPF DV1 errado", cpfValido("52998224735"), false);
igual("CPF DV2 errado", cpfValido("52998224726"), false);
igual("CPF 11 iguais", cpfValido("11111111111"), false);
igual("CPF 10 dígitos", cpfValido("5299822472"), false);
igual("CNPJ numérico válido", cnpjValido(CNPJ), true);
igual("CNPJ alfanumérico válido", cnpjValido(CNPJ_ALFA), true);

/* ---------- e-mail ---------- */
igual("email minúsculo + trim", val(normalizarEmailPix("  Dra.Ana@Clinica.COM.br ")), "dra.ana@clinica.com.br");
igual("email com +", val(normalizarEmailPix("ana+pix@gmail.com")), "ana+pix@gmail.com");
igual("email sem @", val(normalizarEmailPix("ana.gmail.com")), "erro:pixChave");
igual("email sem TLD", val(normalizarEmailPix("ana@gmail")), "erro:pixChave");
igual("email ponto duplo", val(normalizarEmailPix("ana..b@gmail.com")), "erro:pixChave");
igual("email começa com ponto", val(normalizarEmailPix(".ana@gmail.com")), "erro:pixChave");
igual("email com espaço", val(normalizarEmailPix("ana b@gmail.com")), "erro:pixChave");
igual("email > 77", val(normalizarEmailPix(`${"a".repeat(70)}@gmail.com`)), "erro:pixChave");
igual("email vazio", val(normalizarEmailPix("  ")), "erro:pixChave");
igual("email zero-width removido", val(normalizarEmailPix("ana\u200b@gmail.com")), "ana@gmail.com");

/* ---------- telefone ---------- */
igual("tel máscara", val(normalizarTelefonePix("(11) 91234-5678")), "+5511912345678");
igual("tel só dígitos", val(normalizarTelefonePix("11912345678")), "+5511912345678");
igual("tel +55", val(normalizarTelefonePix("+55 11 91234-5678")), "+5511912345678");
igual("tel 55 sem +", val(normalizarTelefonePix("5511912345678")), "+5511912345678");
igual("tel 0 + DDD", val(normalizarTelefonePix("011912345678")), "+5511912345678");
igual("tel DDD 55 (RS)", val(normalizarTelefonePix("55912345678")), "+5555912345678");
igual("tel fixo recusado", val(normalizarTelefonePix("(11) 3123-4567")), "erro:pixChave");
igual("tel sem 9", val(normalizarTelefonePix("11812345678")), "erro:pixChave");
igual("tel DDD 0", val(normalizarTelefonePix("01912345678")), "erro:pixChave");
igual("tel estrangeiro", val(normalizarTelefonePix("+1 415 555 2671")), "erro:pixChave");
igual("tel + no meio", val(normalizarTelefonePix("11+912345678")), "erro:pixChave");
igual("tel letras", val(normalizarTelefonePix("11 9abc-5678")), "erro:pixChave");

/* ---------- aleatória ---------- */
igual("uuid ok", val(normalizarChaveAleatoria(UUID)), UUID);
igual("uuid maiúsculo", val(normalizarChaveAleatoria(UUID.toUpperCase())), UUID);
igual("uuid sem hífen", val(normalizarChaveAleatoria(UUID.replace(/-/g, ""))), UUID);
igual("uuid curto", val(normalizarChaveAleatoria("123e4567-e89b-42d3-a456")), "erro:pixChave");
igual("uuid não hex", val(normalizarChaveAleatoria("123e4567-e89b-42d3-a456-42661417400g")), "erro:pixChave");
igual("uuid versão 0", val(normalizarChaveAleatoria("123e4567-e89b-02d3-a456-426614174000")), "erro:pixChave");
igual("uuid variante errada", val(normalizarChaveAleatoria("123e4567-e89b-42d3-c456-426614174000")), "erro:pixChave");
igual("uuid nulo", val(normalizarChaveAleatoria("00000000-0000-0000-0000-000000000000")), "erro:pixChave");

/* ---------- nome ---------- */
igual("nome trim/colapsa", val(normalizarTitularNome("  Ana   Maria  Souza ")), "Ana Maria Souza");
igual("nome vazio", val(normalizarTitularNome("   ")), "erro:titularNome");
igual("nome 1 letra", val(normalizarTitularNome("A")), "erro:titularNome");
igual("nome sem letra", val(normalizarTitularNome("1234")), "erro:titularNome");
igual("nome 120 ok", (val(normalizarTitularNome("a".repeat(120))) as string).length, 120);
igual("nome 121", val(normalizarTitularNome("a".repeat(121))), "erro:titularNome");
igual("nome não texto", val(normalizarTitularNome(12)), "erro:titularNome");

/* ---------- validarRecebimento ---------- */
const SEM_CNPJ = { cnpjPerfil: "" };
const COM_CNPJ = { cnpjPerfil: CNPJ };
const base = { pixTipo: "email", pixChave: "ana@gmail.com", titularTipo: "pf", titularNome: "Ana Souza", titularDocumento: "529.982.247-25" };
const v = (c: Record<string, unknown>, ctx = SEM_CNPJ) => val(validarRecebimento(c, ctx));

igual("pf + email ok", v(base), { pixTipo: "email", pixChave: "ana@gmail.com", titularTipo: "pf", titularNome: "Ana Souza", titularDocumento: CPF });
igual("corpo não objeto", v([] as unknown as Record<string, unknown>), "erro:");
igual("campo extra", v({ ...base, medicoId: "x" }), "erro:medicoId");
igual("pixTipo inválido", v({ ...base, pixTipo: "banco" }), "erro:pixTipo");
igual("titularTipo inválido", v({ ...base, titularTipo: "pessoa" }), "erro:titularTipo");
igual("pf CPF inválido", v({ ...base, titularDocumento: "529.982.247-24" }), "erro:titularDocumento");
igual("pf CPF ausente", v({ ...base, titularDocumento: undefined }), "erro:titularDocumento");
igual("pf documento CNPJ", v({ ...base, titularDocumento: CNPJ }), "erro:titularDocumento");
igual("nome ausente", v({ ...base, titularNome: "" }), "erro:titularNome");
igual("chave cpf = documento", v({ ...base, pixTipo: "cpf", pixChave: "529.982.247-25" }), {
  pixTipo: "cpf", pixChave: CPF, titularTipo: "pf", titularNome: "Ana Souza", titularDocumento: CPF,
});
igual("chave cpf ≠ documento", v({ ...base, pixTipo: "cpf", pixChave: CPF2 }), "erro:pixChave");
igual("chave cpf com titular pj", v({ ...base, pixTipo: "cpf", pixChave: CPF, titularTipo: "pj", titularDocumento: CNPJ }, COM_CNPJ), "erro:titularTipo");
igual("chave cpf inválida", v({ ...base, pixTipo: "cpf", pixChave: "123" }), "erro:pixChave");
igual("pj sem CNPJ no perfil", v({ ...base, titularTipo: "pj", titularDocumento: CNPJ }), "erro:titularTipo");
igual("pj CNPJ do perfil", v({ ...base, titularTipo: "pj", titularDocumento: "11.222.333/0001-81", titularNome: "Clínica Ana Ltda" }, COM_CNPJ), {
  pixTipo: "email", pixChave: "ana@gmail.com", titularTipo: "pj", titularNome: "Clínica Ana Ltda", titularDocumento: CNPJ,
});
igual("pj CNPJ diferente do perfil", v({ ...base, titularTipo: "pj", titularDocumento: "11.444.777/0001-61" }, COM_CNPJ), "erro:titularDocumento");
igual("pj CNPJ inválido", v({ ...base, titularTipo: "pj", titularDocumento: "11.222.333/0001-82" }, COM_CNPJ), "erro:titularDocumento");
igual("pj perfil com CNPJ mascarado/minúsculo", v({ ...base, titularTipo: "pj", titularDocumento: "12.abc.345/01de-35" }, { cnpjPerfil: "12.ABC.345/01DE-35" }), {
  pixTipo: "email", pixChave: "ana@gmail.com", titularTipo: "pj", titularNome: "Ana Souza", titularDocumento: CNPJ_ALFA,
});
igual("chave cnpj = documento (pj)", v({ ...base, pixTipo: "cnpj", pixChave: "11.222.333/0001-81", titularTipo: "pj", titularDocumento: CNPJ }, COM_CNPJ), {
  pixTipo: "cnpj", pixChave: CNPJ, titularTipo: "pj", titularNome: "Ana Souza", titularDocumento: CNPJ,
});
igual("chave cnpj com titular pf", v({ ...base, pixTipo: "cnpj", pixChave: CNPJ }, COM_CNPJ), "erro:titularTipo");
igual("chave cnpj ≠ perfil", v({ ...base, pixTipo: "cnpj", pixChave: "11444777000161", titularTipo: "pj", titularDocumento: CNPJ }, COM_CNPJ), "erro:pixChave");
igual("chave telefone", (v({ ...base, pixTipo: "telefone", pixChave: "(21) 99876-5432" }) as { pixChave: string }).pixChave, "+5521998765432");
igual("chave aleatória", (v({ ...base, pixTipo: "aleatoria", pixChave: UUID.toUpperCase() }) as { pixChave: string }).pixChave, UUID);
igual("chave aleatória com email", v({ ...base, pixTipo: "aleatoria", pixChave: "ana@gmail.com" }), "erro:pixChave");
igual("chave não texto", v({ ...base, pixChave: 123 }), "erro:pixChave");

/* ---------- máscaras ---------- */
igual("máscara CPF", mascararCpf(CPF), "***.982.247-**");
igual("máscara CPF exemplo", mascararCpf("12345678909"), "***.456.789-**");
igual("máscara CNPJ", mascararCnpj(CNPJ), "**.222.333/0001-**");
igual("máscara CNPJ alfanumérico", mascararCnpj(CNPJ_ALFA), "**.ABC.345/01DE-**");
igual("máscara email", mascararEmail("alisson@gmail.com"), "a***@gmail.com");
igual("máscara email 1 letra", mascararEmail("a@b.co"), "a***@b.co");
igual("máscara telefone", mascararTelefone("+5511912345678"), "+55 ** *****-5678");
igual("máscara aleatória", mascararAleatoria(UUID), "123e…4000");
igual("máscara documento pf", mascararDocumento("pf", CPF), "***.982.247-**");
igual("máscara documento pj", mascararDocumento("pj", CNPJ), "**.222.333/0001-**");
igual("máscara tipo desconhecido", mascararChavePix("banco", "x"), "***");
igual("máscara CPF malformado não vaza", mascararCpf("abc"), "***.***.***-**");
igual("resumo", resumoChaveMascarada({ pixTipo: "email", pixChave: "ana@gmail.com" }), "E-mail a***@gmail.com");
const w = recebimentoWire({ pixTipo: "cpf", pixChave: CPF, titularTipo: "pf", titularNome: "Ana", titularDocumento: CPF, atualizadoEm: new Date("2026-10-04T10:00:00Z") });
igual("wire", w, { pixTipo: "cpf", chaveMascarada: "***.982.247-**", titularTipo: "pf", titularNome: "Ana", documentoMascarado: "***.982.247-**", atualizadoEm: "2026-10-04T10:00:00.000Z" });
igual("wire não tem chave completa", JSON.stringify(w).includes(CPF), false);
const d0 = { pixTipo: "cpf" as const, pixChave: CPF, titularTipo: "pf" as const, titularNome: "Ana", titularDocumento: CPF };
igual("igual", recebimentoIgual(d0, { ...d0 }), true);
igual("diferente nome", recebimentoIgual(d0, { ...d0, titularNome: "Ana S" }), false);
igual("igual null", recebimentoIgual(d0, null), false);

/* ================= rota em banco LOCAL (opcional) ================= */
async function testarRota(url: string) {
  const u = new URL(url);
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) throw new Error("Recuso banco que não é local: " + u.hostname);
  if (u.port === "55432") throw new Error("Porta 55432 é de outro serviço — use outro banco descartável.");
  process.env.DATABASE_URL = url;
  const { mock } = await import("bun:test");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url } } });

  type Sessao = { id: string; nome: string; email: string; role: "PACIENTE" | "MEDICO" | "ADMIN"; precisaTrocarSenha: boolean };
  let sessao: Sessao | null = null;
  mock.module("server-only", () => ({}));
  mock.module("@/lib/db", () => ({ db }));
  // Sessão simulada; registrarAudit = mesma gravação da real (src/lib/server/auth.ts).
  const auth = {
    exigirSessao: async () => {
      if (!sessao) throw Object.assign(new Error("Não autenticado"), { status: 401 });
      return sessao;
    },
    exigirPapel: async (...papeis: Sessao["role"][]) => {
      if (!sessao) throw Object.assign(new Error("Não autenticado"), { status: 401 });
      if (!papeis.includes(sessao.role)) throw Object.assign(new Error("Acesso negado"), { status: 403 });
      return sessao;
    },
    registrarAudit: async (usuario: Sessao | null, log: { acao: string; categoria: string; severidade?: string; entidade?: string; entidadeId?: string; detalhes?: string }) =>
      db.auditLog.create({
        data: {
          acao: log.acao, categoria: log.categoria, severidade: log.severidade ?? "info",
          usuarioId: usuario?.id ?? null, usuarioNome: usuario?.nome ?? "Anônimo", role: usuario?.role ?? "DESCONHECIDO",
          entidade: log.entidade, entidadeId: log.entidadeId, detalhes: log.detalhes,
        },
      }),
  };
  mock.module("@/lib/server/auth", () => auth);
  mock.module("../src/lib/server/auth", () => auth);
  mock.module("@/lib/supabase/broadcast", () => ({ broadcastCanal: async () => {} }));

  const rota = await import("../src/app/api/medico/recebimento/route");

  // Limpa e semeia (só este banco local).
  await db.auditLog.deleteMany({});
  await db.dadosRecebimentoMedico.deleteMany({});
  await db.perfilMedico.deleteMany({});
  await db.user.deleteMany({ where: { id: { startsWith: "trec_" } } });
  const mkUser = (id: string, role: string) => db.user.create({ data: { id, nome: `Usuário ${id}`, email: `${id}@teste.local`, senhaHash: "x", role } });
  await mkUser("trec_medA", "MEDICO");
  await mkUser("trec_medB", "MEDICO");
  await mkUser("trec_medSemPerfil", "MEDICO");
  await mkUser("trec_adm", "ADMIN");
  await mkUser("trec_pac", "PACIENTE");
  await db.perfilMedico.create({ data: { userId: "trec_medA", crm: "CRM 1 SP", especialidade: "Clínica", cnpj: CNPJ } });
  await db.perfilMedico.create({ data: { userId: "trec_medB", crm: "CRM 2 SP", especialidade: "Clínica", cnpj: "" } });

  const como = (id: string | null, role: Sessao["role"] = "MEDICO") => {
    sessao = id ? { id, nome: `Usuário ${id}`, email: `${id}@teste.local`, role, precisaTrocarSenha: false } : null;
  };
  const get = async () => {
    const r = await rota.GET();
    return { status: r.status, json: (await r.json()) as Record<string, any> };
  };
  const put = async (corpo: unknown, texto?: string) => {
    const req = new Request("http://local/api/medico/recebimento", { method: "PUT", body: texto ?? JSON.stringify(corpo) });
    const r = await rota.PUT(req as never);
    return { status: r.status, json: (await r.json()) as Record<string, any> };
  };

  // Acesso
  como(null);
  igual("rota GET sem sessão 401", (await get()).status, 401);
  igual("rota PUT sem sessão 401", (await put(base)).status, 401);
  como("trec_adm", "ADMIN");
  igual("rota GET admin 403", (await get()).status, 403);
  igual("rota PUT admin 403", (await put(base)).status, 403);
  como("trec_pac", "PACIENTE");
  igual("rota GET paciente 403", (await get()).status, 403);
  igual("rota PUT paciente 403", (await put(base)).status, 403);
  como("trec_medSemPerfil");
  igual("rota GET sem PerfilMedico 404", (await get()).status, 404);

  // Médico A: vazio → cadastra
  como("trec_medA");
  igual("rota GET vazio", (await get()).json, { recebimento: null, perfilTemCnpj: true });
  igual("rota PUT JSON inválido 400", (await put(null, "{")).status, 400);
  igual("rota PUT corpo grande 413", (await put(null, JSON.stringify({ x: "a".repeat(5000) }))).status, 413);
  const tentativaOutro = await put({ ...base, medicoId: "trec_medB" });
  igual("rota PUT com medicoId → 400 campo", [tentativaOutro.status, tentativaOutro.json.campo], [400, "medicoId"]);
  const r1 = await put({ ...base, pixTipo: "cpf", pixChave: "529.982.247-25" });
  igual("rota PUT cpf 200", r1.status, 200);
  igual("rota PUT cpf wire mascarado", [r1.json.recebimento.chaveMascarada, r1.json.recebimento.documentoMascarado, r1.json.alterado], ["***.982.247-**", "***.982.247-**", true]);
  igual("rota resposta sem CPF completo", JSON.stringify(r1.json).includes(CPF), false);
  const linha1 = await db.dadosRecebimentoMedico.findUnique({ where: { medicoId: "trec_medA" } });
  igual("banco grava normalizado", [linha1?.pixTipo, linha1?.pixChave, linha1?.titularTipo, linha1?.titularDocumento], ["cpf", CPF, "pf", CPF]);
  const g1 = await get();
  igual("rota GET depois", [g1.status, g1.json.recebimento.pixTipo, g1.json.recebimento.chaveMascarada, g1.json.recebimento.titularNome], [200, "cpf", "***.982.247-**", "Ana Souza"]);
  igual("rota GET sem CPF completo", JSON.stringify(g1.json).includes(CPF), false);

  // Sem mudança → não grava nem audita
  const audAntes = await db.auditLog.count();
  const r2 = await put({ ...base, pixTipo: "cpf", pixChave: CPF, titularDocumento: CPF });
  igual("rota PUT igual → alterado false", [r2.status, r2.json.alterado], [200, false]);
  igual("rota PUT igual não audita", await db.auditLog.count(), audAntes);

  // Troca para PJ + chave CNPJ
  const r3 = await put({ pixTipo: "cnpj", pixChave: "11.222.333/0001-81", titularTipo: "pj", titularNome: "Clínica Ana Ltda", titularDocumento: "11.222.333/0001-81" });
  igual("rota PUT cnpj pj 200", [r3.status, r3.json.recebimento.chaveMascarada, r3.json.recebimento.titularTipo], [200, "**.222.333/0001-**", "pj"]);
  const r4 = await put({ ...base, titularTipo: "pj", titularDocumento: "11.444.777/0001-61" });
  igual("rota PUT pj CNPJ ≠ perfil 400", [r4.status, r4.json.campo], [400, "titularDocumento"]);
  const r5 = await put({ ...base, pixTipo: "cpf", pixChave: CPF2 });
  igual("rota PUT chave cpf ≠ documento 400", [r5.status, r5.json.campo], [400, "pixChave"]);

  // Todos os tipos passam pela CHECK do banco
  for (const [tipo, chave] of [["email", "Ana@Gmail.com"], ["telefone", "(11) 91234-5678"], ["aleatoria", UUID.toUpperCase()]] as const) {
    const r = await put({ ...base, pixTipo: tipo, pixChave: chave });
    igual(`rota PUT ${tipo} 200 (CHECK do banco)`, r.status, 200);
  }
  const linhaFinal = await db.dadosRecebimentoMedico.findUnique({ where: { medicoId: "trec_medA" } });
  igual("banco aleatória normalizada", linhaFinal?.pixChave, UUID);
  igual("uma linha por médico", await db.dadosRecebimentoMedico.count({ where: { medicoId: "trec_medA" } }), 1);

  // Auditoria: mascarada, sem chave/documento completos
  const logs = await db.auditLog.findMany({ where: { acao: "RECEBIMENTO_PIX_ALTERADO" }, orderBy: { createdAt: "asc" } });
  igual("auditoria: 1 por alteração (cpf, cnpj, email, tel, aleatória)", logs.length, 5);
  igual("auditoria: severidade warning", logs.every((l) => l.severidade === "warning" && l.usuarioId === "trec_medA" && l.entidadeId === "trec_medA"), true);
  igual("auditoria 1º cadastro", logs[0]?.detalhes, "Chave PIX de recebimento cadastrada: nenhuma → CPF ***.982.247-** (Pessoa física (CPF))");
  igual("auditoria troca", logs[1]?.detalhes, "Chave PIX de recebimento alterada: CPF ***.982.247-** (Pessoa física (CPF)) → CNPJ **.222.333/0001-** (Pessoa jurídica (CNPJ))");
  const textoLogs = logs.map((l) => l.detalhes ?? "").join("\n");
  igual("auditoria sem dados completos", [CPF, CNPJ, "ana@gmail.com", "+5511912345678", UUID, "912345678"].some((s) => textoLogs.includes(s)), false);

  // Médico B (sem CNPJ): PJ recusado; não enxerga a linha do A
  como("trec_medB");
  igual("rota GET médico B vazio (isolado)", (await get()).json, { recebimento: null, perfilTemCnpj: false });
  const rb = await put({ ...base, titularTipo: "pj", titularDocumento: CNPJ });
  igual("rota PUT pj sem CNPJ no perfil 400", [rb.status, rb.json.campo], [400, "titularTipo"]);
  const rb2 = await put(base);
  igual("rota PUT médico B pf 200", rb2.status, 200);
  const linhaA = await db.dadosRecebimentoMedico.findUnique({ where: { medicoId: "trec_medA" } });
  igual("PUT do B não mexe no A", linhaA?.pixChave, UUID);

  // A CHECK do banco também segura gravação direta fora da regra
  let barrou = false;
  try {
    await db.dadosRecebimentoMedico.update({ where: { medicoId: "trec_medB" }, data: { pixTipo: "cpf", pixChave: CPF2 } });
  } catch {
    barrou = true;
  }
  igual("CHECK do banco barra chave cpf ≠ documento", barrou, true);

  await db.$disconnect();
}

const urlRota = process.env.TESTE_RECEBIMENTO_DB;
if (urlRota) await testarRota(urlRota);
else console.log("(rota não testada: defina TESTE_RECEBIMENTO_DB com um Postgres local descartável)");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

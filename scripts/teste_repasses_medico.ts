/**
 * Teste das rotas GET /api/medico/repasses e /api/medico/repasses/[id]
 * contra um Postgres LOCAL descartável (nunca produção).
 *
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55439/<db> \
 *   bun --conditions react-server scripts/teste_repasses_medico.ts
 *
 * Recusa URL que não seja localhost e a porta 55432.
 */
import { mock } from "bun:test";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("Defina DATABASE_URL apontando para um Postgres local.");
const u = new URL(url);
if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
  throw new Error("Recuso banco que não é local: " + u.hostname);
}
if (u.port === "55432") throw new Error("Porta 55432 é de outro serviço — use 55439.");

const db = new PrismaClient({ datasources: { db: { url } } });

type Sessao = { id: string; nome: string; email: string; role: "PACIENTE" | "MEDICO" | "ADMIN"; precisaTrocarSenha: boolean };
let sessao: Sessao | null = null;

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({ db }));
mock.module("../src/lib/db", () => ({ db }));
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
  registrarAudit: async () => {},
};
mock.module("@/lib/server/auth", () => auth);
mock.module("../src/lib/server/auth", () => auth);
mock.module("@/lib/supabase/env", () => ({ supabaseServiceRoleKey: () => null }));
mock.module("../src/lib/supabase/env", () => ({ supabaseServiceRoleKey: () => null }));
mock.module("@/lib/supabase/storage", () => ({
  urlAssinadaDocumento: async () => { throw new Error("storage off"); },
  uploadDocumento: async () => ({ path: "x" }),
  removerDocumento: async () => {},
}));
mock.module("../src/lib/supabase/storage", () => ({
  urlAssinadaDocumento: async () => { throw new Error("storage off"); },
  uploadDocumento: async () => ({ path: "x" }),
  removerDocumento: async () => {},
}));
mock.module("@/lib/supabase/broadcast", () => ({ broadcastCanal: async () => {} }));

const listaRota = await import("../src/app/api/medico/repasses/route");
const detalheRota = await import("../src/app/api/medico/repasses/[id]/route");

let okN = 0;
let falhaN = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) {
    okN++;
    console.log("ok    " + nome);
  } else {
    falhaN++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}
function verifica(cond: unknown, nome: string, extra?: unknown) {
  if (cond) {
    okN++;
    console.log("ok    " + nome);
  } else {
    falhaN++;
    console.log("FALHA " + nome, extra ?? "");
  }
}

const sp = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);
const CPF = "52998224725";

async function limpar() {
  await db.repasseAjuste.deleteMany({ where: { origemAjusteId: { not: null } } });
  await db.repasseAjuste.deleteMany();
  await db.repasseItem.deleteMany();
  await db.repasse.deleteMany();
  await db.dadosRecebimentoMedico.deleteMany();
  await db.perfilMedico.deleteMany();
  await db.reembolso.deleteMany();
  await db.remarcacaoPendente.deleteMany();
  await db.eventoConsulta.deleteMany();
  await db.pagamento.deleteMany();
  await db.consulta.deleteMany();
  await db.user.deleteMany({ where: { id: { startsWith: "trm_" } } });
}

async function main() {
  await limpar();

  const medA = await db.user.create({ data: { id: "trm_medA", nome: "Dra. Ana", email: "trm_a@t", senhaHash: "x", role: "MEDICO" } });
  const medB = await db.user.create({ data: { id: "trm_medB", nome: "Dr. Bruno", email: "trm_b@t", senhaHash: "x", role: "MEDICO" } });
  const adm = await db.user.create({ data: { id: "trm_adm", nome: "Adm", email: "trm_adm@t", senhaHash: "x", role: "ADMIN" } });
  const pac = await db.user.create({ data: { id: "trm_pac", nome: "Paciente Silva", email: "trm_p@t", senhaHash: "x", role: "PACIENTE" } });
  await db.perfilMedico.create({ data: { userId: medA.id, crm: "1 SP", especialidade: "Clínica" } });
  await db.perfilMedico.create({ data: { userId: medB.id, crm: "2 SP", especialidade: "Clínica" } });
  await db.dadosRecebimentoMedico.create({
    data: { medicoId: medA.id, pixTipo: "cpf", pixChave: CPF, titularTipo: "pf", titularNome: "Ana", titularDocumento: CPF },
  });

  const como = (id: string | null, role: Sessao["role"] = "MEDICO") => {
    sessao = id ? { id, nome: `U ${id}`, email: `${id}@t`, role, precisaTrocarSenha: false } : null;
  };
  const getLista = async () => {
    const r = await listaRota.GET();
    return { status: r.status, json: (await r.json()) as Record<string, any> };
  };
  const getDetalhe = async (id: string) => {
    const r = await detalheRota.GET(new Request(`http://local/api/medico/repasses/${id}`) as never, { params: Promise.resolve({ id }) });
    return { status: r.status, json: (await r.json()) as Record<string, any> };
  };

  /* ---------- acesso ---------- */
  como(null);
  igual("GET lista sem sessão 401", (await getLista()).status, 401);
  como(adm.id, "ADMIN");
  igual("GET lista admin 403", (await getLista()).status, 403);
  como(pac.id, "PACIENTE");
  igual("GET lista paciente 403", (await getLista()).status, 403);

  /* ---------- médico A: vazio + tem chave ---------- */
  como(medA.id);
  const vazio = await getLista();
  igual("lista vazia 200", vazio.status, 200);
  igual("lista vazia temChavePix", vazio.json.temChavePix, true);
  igual("lista vazia repasses", vazio.json.repasses, []);
  verifica(typeof vazio.json.saldoCentavos === "number", "lista traz saldoCentavos");
  verifica(typeof vazio.json.aviso === "string" && /pago inteiro/i.test(vazio.json.aviso), "lista traz aviso de pagamento inteiro");
  verifica(vazio.json.previa?.competencia, "lista traz prévia");

  /* ---------- semeia consultas e fecha repasses ---------- */
  const { fecharRepasseDoMedico, marcarRepassePago } = await import("../src/lib/server/repasse");

  const cA1 = await db.consulta.create({
    data: {
      medicoId: medA.id, pacienteId: pac.id, dataInicio: sp("2030-04-10", "14:00"),
      especialidade: "Clínica", valor: 200, pago: true, status: "confirmada",
    },
  });
  await db.pagamento.create({
    data: { consultaId: cA1.id, valor: 200, status: "confirmado", via: "simulado", confirmadoEm: sp("2030-04-10", "14:00") },
  });
  // consulta de teste (pago sem Pagamento) — não entra
  await db.consulta.create({
    data: {
      medicoId: medA.id, pacienteId: pac.id, dataInicio: sp("2030-04-10", "13:00"),
      especialidade: "Clínica", valor: 300, pago: true, status: "confirmada",
    },
  });
  // consulta do médico B
  const cB1 = await db.consulta.create({
    data: {
      medicoId: medB.id, pacienteId: pac.id, dataInicio: sp("2030-04-10", "15:00"),
      especialidade: "Clínica", valor: 100, pago: true, status: "confirmada",
    },
  });
  await db.pagamento.create({
    data: { consultaId: cB1.id, valor: 100, status: "confirmado", via: "simulado", confirmadoEm: sp("2030-04-10", "15:00") },
  });
  await db.dadosRecebimentoMedico.create({
    data: { medicoId: medB.id, pixTipo: "email", pixChave: "bruno@t.com", titularTipo: "pf", titularNome: "Bruno", titularDocumento: "11144477735" },
  });

  const fechA = await fecharRepasseDoMedico(medA.id, "2030-04-10", sp("2030-04-10", "23:30"));
  const fechB = await fecharRepasseDoMedico(medB.id, "2030-04-10", sp("2030-04-10", "23:30"));
  verifica(fechA.situacao === "fechado" && !!fechA.repasseId, "fechou repasse A", fechA);
  verifica(fechB.situacao === "fechado" && !!fechB.repasseId, "fechou repasse B", fechB);

  // Dia 11: outra consulta A (fica como prévia / segundo fechado)
  const cA2 = await db.consulta.create({
    data: {
      medicoId: medA.id, pacienteId: pac.id, dataInicio: sp("2030-04-11", "10:00"),
      especialidade: "Clínica", valor: 150, pago: true, status: "confirmada",
    },
  });
  await db.pagamento.create({
    data: { consultaId: cA2.id, valor: 150, status: "confirmado", via: "simulado", confirmadoEm: sp("2030-04-11", "10:00") },
  });
  const fechA2 = await fecharRepasseDoMedico(medA.id, "2030-04-11", sp("2030-04-11", "23:30"));
  verifica(fechA2.situacao === "fechado", "fechou segundo repasse A", fechA2);

  // Marca o primeiro como pago
  await marcarRepassePago({
    repasseId: fechA.repasseId!,
    adminId: adm.id,
    comprovantePath: "repasses/trm_medA/2030-04-10.pdf",
    pixChaveConferida: CPF,
    agora: sp("2030-04-11", "09:00"),
  });

  // Ajuste pendente no médico A (reembolso depois) — cria via tabela direto
  // para exercitar o saldo com ajustesPendentesRestantes sem depender do fluxo completo.
  // Valor alto proposital: não cabe num prévia vazia de "hoje" e aparece no restante.
  await db.repasseAjuste.create({
    data: {
      medicoId: medA.id,
      motivo: "reembolso",
      valorCentavos: 5000,
      valorAplicadoCentavos: 0,
    },
  });

  /* ---------- lista do médico A ---------- */
  como(medA.id);
  // Congela "agora" indiretamente: previaDoDia usa new Date(). O saldo
  // inclui fechados + prévia − restante. Fechado não pago = só 2030-04-11
  // (líquido 13500 de R$150). Pago não entra no saldo.
  const lista = await getLista();
  igual("lista A 200", lista.status, 200);
  igual("lista A tem 2 repasses", lista.json.repasses.length, 2);
  const idsA = lista.json.repasses.map((r: { id: string }) => r.id);
  verifica(idsA.includes(fechA.repasseId), "lista A inclui o pago");
  verifica(idsA.includes(fechA2.repasseId), "lista A inclui o fechado");
  verifica(!idsA.includes(fechB.repasseId), "lista A NÃO inclui repasse do B");

  const pago = lista.json.repasses.find((r: { id: string }) => r.id === fechA.repasseId);
  const fechado = lista.json.repasses.find((r: { id: string }) => r.id === fechA2.repasseId);
  igual("status pago", pago?.status, "pago");
  igual("status fechado", fechado?.status, "fechado");
  igual("líquido pago = 18000 (R$200 − 10%)", pago?.liquidoCentavos, 18000);
  igual("líquido fechado = 13500 (R$150 − 10%)", fechado?.liquidoCentavos, 13500);

  // saldo = fechados (13500) + prévia.líquido. O restante dos ajustes NÃO
  // sai do saldo: o fechado é pago inteiro e o restante só desconta dos
  // próximos repasses (revisão do Admin no #39).
  const saldoEsp = 13500 + (lista.json.previa?.totais?.liquidoCentavos ?? 0);
  igual("saldo = fechados + prévia (sem tirar o restante)", lista.json.saldoCentavos, saldoEsp);
  igual("restante de ajustes = 5000 (prévia vazia)", lista.json.previa.ajustesPendentesRestantesCentavos, 5000);
  verifica(lista.json.saldoCentavos >= 13500, "saldo nunca menor que o PIX fechado de 13500");
  verifica(lista.json.previa.ajustesPendentesRestantesCentavos >= 0, "prévia traz ajustesPendentesRestantes");

  const textoLista = JSON.stringify(lista.json);
  verifica(!textoLista.includes(CPF), "lista sem CPF completo");
  verifica(!/"chave"\s*:/.test(textoLista), "lista sem campo chave de item");
  verifica(!/"reembolsoId"/.test(textoLista), "lista sem reembolsoId");
  verifica(!textoLista.includes(pac.email), "lista sem e-mail do paciente");

  /* ---------- detalhe: próprio vs outro ---------- */
  const detA = await getDetalhe(fechA.repasseId!);
  igual("detalhe próprio 200", detA.status, 200);
  igual("detalhe paciente só nome", detA.json.repasse.itens[0]?.paciente, "Paciente Silva");
  igual("detalhe tem pixUsado mascarado", !!detA.json.repasse.pixUsado?.chaveMascarada, true);
  verifica(detA.json.repasse.pixUsado.chaveMascarada.includes("*"), "chave PIX mascarada");
  verifica(!JSON.stringify(detA.json).includes(CPF), "detalhe sem CPF completo");
  verifica(!/"reembolsoId"/.test(JSON.stringify(detA.json)), "detalhe sem reembolsoId");
  verifica(!/"chave"\s*:/.test(JSON.stringify(detA.json.repasse.itens)), "detalhe itens sem chave");
  verifica(!JSON.stringify(detA.json).includes("trm_pac@"), "detalhe sem contato do paciente");

  const detB = await getDetalhe(fechB.repasseId!);
  igual("detalhe de outro médico 404", detB.status, 404);

  como(pac.id, "PACIENTE");
  igual("detalhe paciente 403", (await getDetalhe(fechA.repasseId!)).status, 403);
  como(adm.id, "ADMIN");
  igual("detalhe admin 403", (await getDetalhe(fechA.repasseId!)).status, 403);

  /* ---------- médico B: isolamento na lista ---------- */
  como(medB.id);
  const listaB = await getLista();
  igual("lista B tem 1 repasse", listaB.json.repasses.length, 1);
  igual("lista B só o dele", listaB.json.repasses[0].id, fechB.repasseId);
  igual("B temChavePix", listaB.json.temChavePix, true);

  await limpar();
  await db.$disconnect();

  console.log(`\n${okN} ok, ${falhaN} falha(s)`);
  if (falhaN) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});

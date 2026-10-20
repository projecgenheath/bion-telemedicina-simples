/**
 * Testes do chat guardado da teleconsulta (lib/server/chat-consulta.ts,
 * limparSala em presenca-consulta.ts e lib/chat-consulta-acesso.ts).
 * Rodar: bun --conditions=react-server src/lib/server/chat-consulta.teste.ts
 * Com DATABASE_URL apontando para um Postgres LOCAL, roda também a parte de
 * banco (cópia idempotente e limpeza que não perde chat).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { podeLerChatConsulta } from "../chat-consulta-acesso";
import { textoDoPayload } from "./chat-consulta";

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

// --- payload ---
igual(
  "payload {s, texto}",
  textoDoPayload(JSON.stringify({ s: "x", texto: "Olá, doutor" })),
  "Olá, doutor",
);
igual("payload não JSON", textoDoPayload("oi"), "oi");
igual("payload string JSON", textoDoPayload(JSON.stringify("oi")), "oi");
igual("payload {} não vira texto", textoDoPayload("{}"), null);
igual("payload vazio não vira texto", textoDoPayload(""), null);
igual("payload só espaços não vira texto", textoDoPayload("   "), null);
igual("payload {texto: \"\"} não vira texto", textoDoPayload('{"texto":""}'), null);
igual("payload sem campo texto não vira texto", textoDoPayload('{"s":"x"}'), null);

// --- quem lê ---
const consulta = { pacienteId: "p1", medicoId: "m1" };
igual(
  "paciente da consulta lê",
  podeLerChatConsulta({ id: "p1", role: "PACIENTE" }, consulta),
  true,
);
igual(
  "médico da consulta lê",
  podeLerChatConsulta({ id: "m1", role: "MEDICO" }, consulta),
  true,
);
igual(
  "admin não lê",
  podeLerChatConsulta({ id: "a1", role: "ADMIN" }, consulta),
  false,
);
igual(
  "admin com id do médico não lê",
  podeLerChatConsulta({ id: "m1", role: "ADMIN" }, consulta),
  false,
);
igual(
  "outro paciente não lê",
  podeLerChatConsulta({ id: "p2", role: "PACIENTE" }, consulta),
  false,
);
igual(
  "outro médico não lê",
  podeLerChatConsulta({ id: "m2", role: "MEDICO" }, consulta),
  false,
);
igual(
  "paciente com id do médico não lê",
  podeLerChatConsulta({ id: "m1", role: "PACIENTE" }, consulta),
  false,
);

// --- admin não recebe o chat em nenhuma rota nem em dados.ts ---
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : [p];
  });
}
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fontesAdmin = [
  join(raiz, "lib/server/dados.ts"),
  ...arquivos(join(raiz, "app/api/admin")),
];
const vazam = fontesAdmin.filter((f) =>
  /chatConsulta|ChatConsulta|sinalSala|SinalSala/.test(readFileSync(f, "utf8")),
);
igual("dados.ts e api/admin não leem ChatConsulta/SinalSala", vazam, []);

async function banco() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/127\.0\.0\.1|localhost|host=\/tmp/.test(url)) {
    console.log("(sem DATABASE_URL local: parte de banco pulada)");
    return;
  }
  const { db } = await import("@/lib/db");
  const { guardarChatSala } = await import("./chat-consulta");
  const { limparSala } = await import("./presenca-consulta");
  const sufixo = Date.now().toString(36);
  const pac = await db.user.create({
    data: { nome: "P", email: `p-${sufixo}@t.local`, senhaHash: "x" },
  });
  const med = await db.user.create({
    data: {
      nome: "M",
      email: `m-${sufixo}@t.local`,
      senhaHash: "x",
      role: "MEDICO",
    },
  });
  const c = await db.consulta.create({
    data: {
      pacienteId: pac.id,
      medicoId: med.id,
      especialidade: "Clínica",
      dataInicio: new Date(Date.now() - 3 * 3600e3),
      status: "concluida",
    },
  });
  const velho = new Date(Date.now() - 2 * 3600e3);
  await db.sinalSala.createMany({
    data: [
      {
        consultaId: c.id,
        deUsuarioId: pac.id,
        deRole: "PACIENTE",
        tipo: "chat",
        payload: JSON.stringify({ s: "a", texto: "Estou com dor" }),
        consumido: true,
        createdAt: velho,
      },
      {
        consultaId: c.id,
        deUsuarioId: med.id,
        deRole: "MEDICO",
        tipo: "chat",
        payload: JSON.stringify({ s: "b", texto: "Desde quando?" }),
        consumido: true,
        createdAt: new Date(velho.getTime() + 1000),
      },
      {
        consultaId: c.id,
        deUsuarioId: med.id,
        deRole: "MEDICO",
        tipo: "oferta",
        payload: "{}",
        consumido: true,
        createdAt: velho,
      },
    ],
  });
  const g1 = await guardarChatSala(c.id);
  const g2 = await guardarChatSala(c.id);
  igual("cópia: 2 mensagens", g1.size, 2);
  igual("cópia de novo devolve as mesmas", g2.size, 2);
  igual(
    "cópia idempotente: 2 linhas",
    await db.chatConsulta.count({ where: { consultaId: c.id } }),
    2,
  );

  // Chat sem texto ("{}" ou vazio) não é guardado, mas pode ser limpo.
  const vazios = await Promise.all(
    ["{}", ""].map((payload) =>
      db.sinalSala.create({
        data: {
          consultaId: c.id,
          deUsuarioId: pac.id,
          deRole: "PACIENTE",
          tipo: "chat",
          payload,
          consumido: true,
          createdAt: velho,
        },
      }),
    ),
  );
  const g3 = await guardarChatSala(c.id);
  igual(
    "chat sem texto: não vira linha",
    await db.chatConsulta.count({ where: { consultaId: c.id } }),
    2,
  );
  igual(
    "chat sem texto: liberado para a limpeza",
    vazios.every((v) => g3.has(v.id)),
    true,
  );

  // Mensagem nova que ainda não foi copiada: limparSala copia antes de apagar.
  await db.sinalSala.create({
    data: {
      consultaId: c.id,
      deUsuarioId: pac.id,
      deRole: "PACIENTE",
      tipo: "chat",
      payload: JSON.stringify({ s: "c", texto: "Obrigado" }),
      consumido: true,
      createdAt: new Date(velho.getTime() + 2000),
    },
  });
  await limparSala(c.id);
  igual(
    "limpeza apagou os sinais antigos",
    await db.sinalSala.count({ where: { consultaId: c.id } }),
    0,
  );
  const guardado = await db.chatConsulta.findMany({
    where: { consultaId: c.id },
    orderBy: { criadoEm: "asc" },
    select: { papel: true, texto: true, autorId: true },
  });
  igual("limpeza não perdeu chat", guardado, [
    { papel: "PACIENTE", texto: "Estou com dor", autorId: pac.id },
    { papel: "MEDICO", texto: "Desde quando?", autorId: med.id },
    { papel: "PACIENTE", texto: "Obrigado", autorId: pac.id },
  ]);
  await limparSala(c.id);
  igual(
    "limpeza de novo não duplica",
    await db.chatConsulta.count({ where: { consultaId: c.id } }),
    3,
  );

  // Se a cópia falhar, nada é apagado.
  await db.sinalSala.create({
    data: {
      consultaId: c.id,
      deUsuarioId: pac.id,
      deRole: "PACIENTE",
      tipo: "chat",
      payload: "{}",
      consumido: true,
      createdAt: velho,
    },
  });
  await db.$executeRawUnsafe(
    `ALTER TABLE "ChatConsulta" RENAME TO "ChatConsulta_x"`,
  );
  let falhou = false;
  try {
    await limparSala(c.id);
  } catch {
    falhou = true;
  }
  await db.$executeRawUnsafe(
    `ALTER TABLE "ChatConsulta_x" RENAME TO "ChatConsulta"`,
  );
  igual("cópia falhou: limparSala lança", falhou, true);
  igual(
    "cópia falhou: chat não apagado",
    await db.sinalSala.count({ where: { consultaId: c.id, tipo: "chat" } }),
    1,
  );

  // FK Restrict: o chat é prontuário, então apagar a consulta com chat falha.
  let apagou = true;
  try {
    await db.consulta.delete({ where: { id: c.id } });
  } catch {
    apagou = false;
  }
  igual("Restrict: consulta com chat não é apagada", apagou, false);

  await db.chatConsulta.deleteMany({ where: { consultaId: c.id } });
  await db.sinalSala.deleteMany({ where: { consultaId: c.id } });
  await db.consulta.delete({ where: { id: c.id } });
  await db.user.deleteMany({ where: { id: { in: [pac.id, med.id] } } });
  await db.$disconnect();
}

await banco();
console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

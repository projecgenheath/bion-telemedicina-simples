/**
 * Job de avisos de lembrete, com o model Prisma completo (feitoEm,
 * ultimoDisparoEm, diaSemana — 20261110a). O #170 gravava por SQL cru
 * porque o campo estava fora do model e o update gerava
 * PrismaClientValidationError (54x, 04/11 a 10/11). Agora o update é tipado.
 * Rodar: bun --conditions=react-server test ./src/lib/server/lembretes-aviso.teste.ts
 */
import { Prisma } from "@prisma/client";
import { rodarAvisosLembretes, type BancoAvisos } from "./lembretes-aviso";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = String(JSON.stringify(obtido));
  const b = String(JSON.stringify(esperado));
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}

{
  const campos = Prisma.dmmf.datamodel.models.find((m) => m.name === "Lembrete")!.fields.map((f) => f.name);
  igual("model declara feitoEm", campos.includes("feitoEm"), true);
  igual("model declara ultimoDisparoEm", campos.includes("ultimoDisparoEm"), true);
  igual("model declara diaSemana", campos.includes("diaSemana"), true);
  const feito = Prisma.dmmf.datamodel.models.find((m) => m.name === "Lembrete")!.fields.find((f) => f.name === "feitoEm");
  const ultimo = Prisma.dmmf.datamodel.models.find((m) => m.name === "Lembrete")!.fields.find((f) => f.name === "ultimoDisparoEm");
  const dia = Prisma.dmmf.datamodel.models.find((m) => m.name === "Lembrete")!.fields.find((f) => f.name === "diaSemana");
  igual("feitoEm é DateTime anulável", [feito?.type, feito?.isRequired], ["DateTime", false]);
  igual("ultimoDisparoEm é DateTime anulável", [ultimo?.type, ultimo?.isRequired], ["DateTime", false]);
  igual("diaSemana é Int anulável", [dia?.type, dia?.isRequired], ["Int", false]);
}

// 04/11/2026 11:00 em America/Sao_Paulo = 14:00 UTC.
const AGORA = new Date("2026-11-04T14:00:00.000Z");
const base = {
  id: "l1",
  usuarioId: "u1",
  titulo: "Remédio das 11",
  horario: "11:00",
  tipo: "Medicação",
  frequencia: "Todos os dias",
  feitoEm: null as Date | null,
  ultimoDisparoEm: null as Date | null,
};

function bancoMock(opts: { lembretes?: typeof base[] } = {}) {
  const updates: unknown[] = [];
  const criadas: unknown[] = [];
  return {
    $queryRaw: async () => [{ n: 2 }],
    lembrete: {
      findMany: async () => opts.lembretes ?? [base],
      update: async (args: unknown) => {
        updates.push(args);
        return {};
      },
    },
    medicamentoEmUso: { findMany: async () => [] },
    notificacao: {
      create: async (args: unknown) => {
        criadas.push(args);
        return { id: "n1" };
      },
    },
    updates,
    criadas,
  };
}

{
  const b = bancoMock();
  const r = await rodarAvisosLembretes(AGORA, {
    colunasExistem: async () => true,
    enviarPush: async () => 1,
    db: b as unknown as BancoAvisos,
  });
  igual("dispara o devido e grava com update tipado", r, {
    ativo: true,
    examinados: 1,
    disparados: 1,
    pushes: 1,
    semInscricao: 0,
    erros: 0,
    incompleto: false,
  });
  igual("um prisma.lembrete.update", b.updates.length, 1);
  const data = (b.updates[0] as { data?: { ultimoDisparoEm?: Date } }).data;
  igual("update manda ultimoDisparoEm", data?.ultimoDisparoEm?.toISOString(), AGORA.toISOString());
  igual("notificação criada", b.criadas.length, 1);
}

{
  const b = bancoMock({ lembretes: [{ ...base, ultimoDisparoEm: AGORA }] });
  const r = await rodarAvisosLembretes(AGORA, {
    colunasExistem: async () => true,
    enviarPush: async () => 1,
    db: b as unknown as BancoAvisos,
  });
  igual("já disparado nesta ocorrência: não repete", r.disparados, 0);
  igual("sem update na repetição", b.updates.length, 0);
}

{
  const r = await rodarAvisosLembretes(AGORA, {
    colunasExistem: async () => false,
    db: bancoMock() as unknown as BancoAvisos,
  });
  igual("sem colunas: inativo", r, {
    ativo: false,
    examinados: 0,
    disparados: 0,
    pushes: 0,
    semInscricao: 0,
    erros: 0,
    incompleto: false,
  });
}

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);

/**
 * Job de avisos de lembrete: reproduz o PrismaClientValidationError de
 * /api/cron/lembretes (54 vezes, 04/11 a 10/11) e cobre o conserto
 * (leitura/gravação por SQL cru, sem prisma.lembrete.update).
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

// Causa do PrismaClientValidationError em produção (54x, 04/11 a 10/11,
// log: "[Lembretes] falha ao disparar aviso { erro: PrismaClientValidationError }"):
// o job gravava ultimoDisparoEm com prisma.lembrete.update, mas o campo
// não existe no model (de propósito, enquanto a 20261104a não está no
// schema). O client/engine rejeita o argumento. Sem um banco o client 6
// nem chega a validar (falha de conexão antes); aqui reproduzimos a
// rejeição pelo DMMF — a mesma regra que gera o ValidationError — e
// abaixo cobrimos o conserto (SQL cru).
{
  const campos = Prisma.dmmf.datamodel.models.find((m) => m.name === "Lembrete")!.fields.map((f) => f.name);
  igual("ultimoDisparoEm fora do model Prisma (causa do erro)", campos.includes("ultimoDisparoEm"), false);
  igual("feitoEm também fora do model", campos.includes("feitoEm"), false);
  const conhecidos = new Set(campos);
  const data = { ultimoDisparoEm: new Date("2026-11-04T14:00:00.000Z") } as Record<string, unknown>;
  const desconhecidos = Object.keys(data).filter((k) => !conhecidos.has(k));
  let nome = "sem erro";
  let msg = "";
  if (desconhecidos.length) {
    const err = new Prisma.PrismaClientValidationError(
      `Invalid \`prisma.lembrete.update()\` invocation:\n\nUnknown argument \`${desconhecidos[0]}\`. Available options are marked with ?.`,
      { clientVersion: Prisma.prismaVersion.client },
    );
    nome = err.name;
    msg = err.message;
  }
  igual("reproduz PrismaClientValidationError do cron", nome, "PrismaClientValidationError");
  igual("mensagem cita ultimoDisparoEm", msg.includes("ultimoDisparoEm"), true);
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
};

function bancoMock(opts: {
  extras?: { id: string; feitoEm: Date | null; ultimoDisparoEm: Date | null }[];
  lembretes?: typeof base[];
}) {
  const executes: unknown[][] = [];
  const criadas: unknown[] = [];
  return {
    $queryRaw: async () => opts.extras ?? [{ id: "l1", feitoEm: null, ultimoDisparoEm: null }],
    $executeRaw: async (...args: unknown[]) => {
      executes.push(args.slice(1));
      return 1;
    },
    lembrete: { findMany: async () => opts.lembretes ?? [base] },
    medicamentoEmUso: { findMany: async () => [] },
    notificacao: {
      create: async (args: unknown) => {
        criadas.push(args);
        return { id: "n1" };
      },
    },
    executes,
    criadas,
  };
}

{
  const b = bancoMock({});
  const r = await rodarAvisosLembretes(AGORA, {
    colunasExistem: async () => true,
    enviarPush: async () => 1,
    db: b as unknown as BancoAvisos,
  });
  igual("dispara o devido e grava via executeRaw", r, {
    ativo: true,
    examinados: 1,
    disparados: 1,
    pushes: 1,
    semInscricao: 0,
    erros: 0,
    incompleto: false,
  });
  igual("um executeRaw (não prisma.update)", b.executes.length, 1);
  igual("notificação criada", b.criadas.length, 1);
}

{
  const b = bancoMock({ extras: [{ id: "l1", feitoEm: null, ultimoDisparoEm: AGORA }] });
  const r = await rodarAvisosLembretes(AGORA, {
    colunasExistem: async () => true,
    enviarPush: async () => 1,
    db: b as unknown as BancoAvisos,
  });
  igual("já disparado nesta ocorrência: não repete (campo veio do SQL cru)", r.disparados, 0);
  igual("sem executeRaw na repetição", b.executes.length, 0);
}

{
  const r = await rodarAvisosLembretes(AGORA, {
    colunasExistem: async () => false,
    db: bancoMock({}) as unknown as BancoAvisos,
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

import { PrismaClient } from "@prisma/client";

/** Verificações de banco para a suíte P0/P1/P2 (chamada ao final do .sh). */
const db = new PrismaClient();

async function main() {
  const [acao, emailOuId] = process.argv.slice(2);

  if (acao === "usuario-por-email") {
    const u = await db.user.findUnique({
      where: { email: emailOuId! },
      select: { nome: true, email: true, status: true, precisaTrocarSenha: true },
    });
    console.log(JSON.stringify(u));
  } else if (acao === "medico-por-id") {
    const u = await db.user.findUnique({
      where: { id: emailOuId! },
      select: {
        status: true,
        perfilMedico: { select: { status: true } },
        _count: { select: { consultasComoMedico: true, documentosEmitidos: true } },
      },
    });
    console.log(JSON.stringify(u));
  } else if (acao === "lgpd") {
    const u = await db.user.findUnique({
      where: { id: emailOuId! },
      select: {
        nome: true,
        email: true,
        status: true,
        perfilPaciente: { select: { cpf: true, telefone: true } },
        anamneses: { select: { coleta: true } },
        consultasComoPaciente: { select: { id: true, status: true } },
        mensagensEnviadas: { select: { texto: true } },
        mensagensRecebidas: { select: { texto: true } },
        tickets: { select: { assunto: true } },
      },
    });
    console.log(JSON.stringify(u, null, 1));
  } else {
    console.log("uso: bun scripts/verificar_db.ts <usuario-por-email|medico-por-id|lgpd> <chave>");
    process.exit(1);
  }
}

main().finally(() => db.$disconnect());

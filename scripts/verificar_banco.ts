/**
 * Verificação pós-migração: conta registros de todas as tabelas no banco ativo.
 * Uso: bun scripts/verificar_banco.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const esperado: Record<string, number> = {
  User: 11,
  PerfilMedico: 6,
  PerfilPaciente: 4,
  Consulta: 6,
  Documento: 4,
  Arquivo: 3,
  Notificacao: 5,
  Avaliacao: 3,
  Ticket: 3,
  Lembrete: 4,
  Consentimento: 1,
};

async function main() {
  const contagens: Record<string, number> = {
    User: await db.user.count(),
    PerfilMedico: await db.perfilMedico.count(),
    PerfilPaciente: await db.perfilPaciente.count(),
    Consulta: await db.consulta.count(),
    Documento: await db.documento.count(),
    Arquivo: await db.arquivo.count(),
    Notificacao: await db.notificacao.count(),
    Avaliacao: await db.avaliacao.count(),
    Ticket: await db.ticket.count(),
    Lembrete: await db.lembrete.count(),
    Consentimento: await db.consentimento.count(),
    AuditLog: await db.auditLog.count(),
  };

  let ok = true;
  for (const [tabela, n] of Object.entries(contagens)) {
    const esperadoN = esperado[tabela];
    const marca = esperadoN !== undefined ? (n === esperadoN ? "✅" : "⚠️ ") : "ℹ️ ";
    if (esperadoN !== undefined && n !== esperadoN) ok = false;
    console.log(`${marca} ${tabela}: ${n}${esperadoN !== undefined ? ` (esperado: ${esperadoN})` : ""}`);
  }

  console.log(
    ok
      ? "\n✅ Banco populado e consistente — migração concluída!"
      : "\n⚠️  Algumas contagens divergem — rode novamente: bun prisma/seed.ts",
  );
}

main()
  .catch((e) => {
    console.error("❌ Erro ao verificar banco:", e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());